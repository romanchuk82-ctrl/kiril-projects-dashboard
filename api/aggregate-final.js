import aggregateFreshHandler from './aggregate-fresh.js';

const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null};

function directWaitQueueConflict(row){
  const waitRaw=row?.baseWaitMin!=null?num(row.baseWaitMin):num(row?.waitMin);
  const queueRaw=num(row?.queueCars);
  if(waitRaw==null||queueRaw==null||waitRaw<0||queueRaw<0)return null;

  const waitMin=Math.max(0,Math.round(waitRaw));
  const queueCars=Math.max(0,Math.round(queueRaw));
  const contradictory=(queueCars<=3&&waitMin>=60)||(queueCars>=15&&waitMin<=20);
  if(!contradictory)return null;

  return{
    waitMin,
    queueCars,
    waitAgeMin:num(row?.waitAgeMin)??num(row?.ageMin),
    queueAgeMin:num(row?.queueAgeMin),
    waitUpdatedAt:row?.waitUpdatedAt||row?.updatedAt||null,
    queueUpdatedAt:row?.queueUpdatedAt||null,
    waitSource:null,
    waitSourceLabel:null,
    queueSource:row?.queueSource||null,
    queueSourceLabel:null
  };
}

function enforceDirectConflict(row){
  if(!row)return row;
  if(row.timeReliability==='conflict')return row;
  const conflict=directWaitQueueConflict(row);
  if(!conflict)return row;
  return{
    ...row,
    timeReliable:false,
    timeReliability:'conflict',
    timeReliabilityReason:`Кількість авто (${conflict.queueCars}) суперечить оцінці часу ${conflict.waitMin} хв`,
    sourceConflictType:'wait_queue',
    sourceConflict:conflict,
    confidence:'low',
    queueConflict:true
  };
}

async function captureFresh(req){
  let statusCode=200,body=null;
  const res={
    status(code){statusCode=code;return this},
    setHeader(){return this},
    json(payload){body=payload;return this}
  };
  await aggregateFreshHandler(req,res);
  return{statusCode,body};
}

export default async function handler(req,res){
  const captured=await captureFresh(req);
  const body=captured.body;
  if(captured.statusCode!==200||!body?.ok||!Array.isArray(body.crossings)){
    return res.status(captured.statusCode).json(body);
  }
  const crossings=body.crossings.map(enforceDirectConflict);
  return res.status(200).json({
    ...body,
    crossings,
    sourceStatus:{
      ...(body.sourceStatus||{}),
      consistencyGuard:{
        directWaitVsCars:true,
        lowCarsMax:3,
        highWaitMin:60,
        highCarsMin:15,
        lowWaitMax:20
      }
    }
  });
}
