import aggregateHandler, { applyTelegramTimeTrust } from './aggregate.js';

const LIVE_URL='https://nakordoni.eu/api/v1/data/queue';
const PROBE_TTL_MS=10*60*1000;
const MAX_PROBES_PER_REQUEST=2;
const STALE_SOURCE_MIN=15;
const LIVE_MIN_INTERVAL_MS=700;
const probeCache=new Map();
let liveStartGate=Promise.resolve();
let nextLiveStartAt=0;

const NKD_FETCH_GUARD=Symbol.for('border-monitor.nakordoni-fetch-guard');
if(!globalThis[NKD_FETCH_GUARD]){
  const originalFetch=globalThis.fetch.bind(globalThis);
  let apiGate=Promise.resolve();
  let nextApiStartAt=0;
  globalThis.fetch=async(input,init)=>{
    const url=typeof input==='string'?input:(input?.url||String(input||''));
    if(!url.startsWith('https://nakordoni.eu/api/'))return originalFetch(input,init);
    const prior=apiGate;
    let release;
    apiGate=new Promise(resolve=>{release=resolve});
    await prior;
    const delay=Math.max(0,nextApiStartAt-Date.now());
    if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
    nextApiStartAt=Date.now()+LIVE_MIN_INTERVAL_MS;
    release();
    return originalFetch(input,init);
  };
  globalThis[NKD_FETCH_GUARD]={minIntervalMs:LIVE_MIN_INTERVAL_MS};
}

const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null};
const text=v=>typeof v==='string'&&v.trim()?v.trim():null;

function sourceAge(src){
  const age=num(src?.ageMin);
  if(age!=null&&age>=0)return age;
  const ts=Date.parse(String(src?.updatedAt||''));
  return Number.isFinite(ts)?Math.max(0,Math.round((Date.now()-ts)/60000)):null;
}

function latestNakordoniSource(row){
  const list=(row?.sources||[]).filter(s=>s?.source==='nakordoni');
  return list.sort((a,b)=>(sourceAge(a)??999999)-(sourceAge(b)??999999))[0]||null;
}

function queueFromSource(src){
  const direct=num(src?.queueCars);
  if(direct!=null&&direct>=0)return Math.round(direct);
  const m=String(src?.note||'').match(/(?:^|[^\d])(\d{1,4})\s*(?:авто|автомоб|машин)/iu);
  return m?Number(m[1]):null;
}

function telegramSignal(src){
  const q=queueFromSource(src);
  if(q!=null){if(q<=3)return'low';if(q>=10)return'high';return'mid'}
  const raw=String(src?.note||'').toLowerCase();
  if(/[?？]/.test(raw))return null;
  if(/(без черги|нема черги|немає черги|черги нема|черги немає|пусто|вільно|нікого|нуль|без очікування)/u.test(raw))return'low';
  if(/(велика черга|довга черга|черга велика|черга довга|стоїмо|стоимо|чекаємо|ждемо|затор)/u.test(raw))return'high';
  return null;
}

function nonTelegramQueues(row){
  return (row?.sources||[])
    .filter(s=>s?.source!=='telegram')
    .map(s=>({src:s,q:queueFromSource(s),age:sourceAge(s)}))
    .filter(x=>x.q!=null)
    .sort((a,b)=>(a.age??999999)-(b.age??999999));
}

function hasQueueDisagreement(row){
  const vals=nonTelegramQueues(row).map(x=>x.q);
  if(vals.length<2)return false;
  return Math.max(...vals)-Math.min(...vals)>=5;
}

function hasTelegramQueueConflict(row){
  const base=nonTelegramQueues(row)[0];
  if(!base)return false;
  const fresh=(row?.sources||[])
    .filter(s=>s?.source==='telegram'&&(sourceAge(s)??999999)<=180)
    .sort((a,b)=>(sourceAge(a)??999999)-(sourceAge(b)??999999));
  for(const src of fresh){
    const sig=telegramSignal(src);
    const q=queueFromSource(src);
    if(q!=null&&Math.abs(q-base.q)>=7)return true;
    if(base.q<=3&&sig==='high')return true;
    if(base.q>=10&&sig==='low')return true;
  }
  return false;
}

function candidatePriority(row){
  const nk=latestNakordoniSource(row);
  const age=sourceAge(nk);
  const conflict=row?.timeReliability==='conflict'||hasQueueDisagreement(row)||hasTelegramQueueConflict(row);
  if(conflict)return 100000+(age??0);
  if(age!=null&&age>=STALE_SOURCE_MIN)return age;
  return -1;
}

function normalizeSnapshot(body){
  const snap=body?.data?.snapshot||body?.snapshot||body?.data;
  if(!snap||typeof snap!=='object'||Array.isArray(snap))return null;
  const pick=(...keys)=>{for(const k of keys)if(snap?.[k]!=null)return snap[k];return null};
  const queueCars=num(pick('queue_now','queue','cars','vehicles'));
  const waitMin=num(pick('wait_min','wait_minutes','estimated_wait_min','waiting_time_min'));
  const ageMin=num(pick('age_min','age_minutes','data_age_min'));
  const updatedAt=text(pick('updated_at','timestamp','as_of','last_update'));
  const waitStatus=text(pick('wait_status','status'));
  if(queueCars==null&&waitMin==null&&waitStatus==null)return null;
  return{queueCars,waitMin,ageMin,updatedAt,waitStatus};
}

async function waitForLiveSlot(){
  const prior=liveStartGate;
  let release;
  liveStartGate=new Promise(resolve=>{release=resolve});
  await prior;
  const delay=Math.max(0,nextLiveStartAt-Date.now());
  if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
  nextLiveStartAt=Date.now()+LIVE_MIN_INTERVAL_MS;
  release();
}

async function fetchLive(ppid,apiKey){
  const key=String(ppid||'');
  const cached=probeCache.get(key);
  if(cached&&Date.now()-cached.ts<PROBE_TTL_MS)return{...cached.value,fromCache:true};
  await waitForLiveSlot();
  const ctl=new AbortController();
  const timer=setTimeout(()=>ctl.abort(),12000);
  let value;
  try{
    const url=`${LIVE_URL}?ppid=${encodeURIComponent(key)}&lang=uk`;
    const r=await fetch(url,{headers:{Authorization:`Bearer ${apiKey}`,Accept:'application/json'},cache:'no-store',signal:ctl.signal});
    const body=await r.json().catch(()=>null);
    const snapshot=r.ok&&body?.ok!==false?normalizeSnapshot(body):null;
    value={ok:Boolean(r.ok&&body?.ok!==false&&snapshot),status:r.status,snapshot,error:snapshot?null:(body?.error?.code||body?.error?.message||`HTTP_${r.status}`)};
  }catch(e){value={ok:false,status:0,snapshot:null,error:String(e?.message||e)}}
  finally{clearTimeout(timer)}
  probeCache.set(key,{ts:Date.now(),value});
  return{...value,fromCache:false};
}

function snapshotStamp(snapshot){
  const ts=Date.parse(String(snapshot?.updatedAt||''));
  if(Number.isFinite(ts))return ts;
  const age=num(snapshot?.ageMin);
  return age!=null&&age>=0?Date.now()-age*60000:null;
}

function sourceStamp(src){
  const ts=Date.parse(String(src?.updatedAt||''));
  if(Number.isFinite(ts))return ts;
  const age=sourceAge(src);
  return age!=null?Date.now()-age*60000:null;
}

function mergeLive(row,snapshot){
  const old=latestNakordoniSource(row);
  const oldTs=sourceStamp(old),newTs=snapshotStamp(snapshot);
  if(newTs==null||(oldTs!=null&&newTs<=oldTs))return{row,updated:false};

  const liveSource={
    source:'nakordoni',label:'Nakordoni · Live Queue API',value:snapshot.waitMin,queueCars:snapshot.queueCars,
    updatedAt:snapshot.updatedAt||null,ageMin:snapshot.ageMin??null,
    sourceUrl:row.sourceUrl||`https://nakordoni.eu/uk/id/${row.ppid||''}`,
    note:snapshot.queueCars!=null?`${Math.round(snapshot.queueCars)} авто · live queue snapshot`:'live queue snapshot'
  };
  let next={...row,sources:[liveSource,...(row.sources||[]).filter(s=>s?.source!=='nakordoni')]};

  if(snapshot.waitMin!=null){next.waitMin=Math.max(0,Math.round(snapshot.waitMin));next.baseWaitMin=next.waitMin;}
  if(snapshot.waitStatus!=null)next.waitStatus=snapshot.waitStatus;

  const currentQueueAge=num(next.queueAgeMin);
  const liveAge=num(snapshot.ageMin);
  if(snapshot.queueCars!=null&&(currentQueueAge==null||liveAge==null||liveAge<=currentQueueAge)){
    next.queueCars=Math.max(0,Math.round(snapshot.queueCars));
    next.queueSource='nakordoni_live';
    next.queueAgeMin=liveAge;
  }
  if(snapshot.updatedAt)next.updatedAt=snapshot.updatedAt;
  if(liveAge!=null)next.ageMin=liveAge;
  next.stale=liveAge!=null?liveAge>60:false;
  next=applyTelegramTimeTrust(next);
  return{row:next,updated:true};
}

function enforceQueueConflict(row){
  if(!row)return row;
  const disagreement=hasQueueDisagreement(row);
  const tgConflict=hasTelegramQueueConflict(row);
  if(!disagreement&&!tgConflict)return row;
  return{
    ...row,
    timeReliable:false,
    timeReliability:'conflict',
    timeReliabilityReason:tgConflict?'Telegram і свіже джерело кількості авто показують різну ситуацію з чергою':'Актуальні джерела показують різну кількість авто',
    confidence:'low',
    queueConflict:true
  };
}

async function captureBase(req){
  let statusCode=200,body=null;
  const res={status(code){statusCode=code;return this},json(payload){body=payload;return this}};
  await aggregateHandler(req,res);
  return{statusCode,body};
}

export default async function handler(req,res){
  const captured=await captureBase(req);
  const body=captured.body;
  const apiKey=process.env.NKD_API_KEY||'';
  if(captured.statusCode!==200||!body?.ok||!apiKey||!Array.isArray(body.crossings))return res.status(captured.statusCode).json(body);

  const rows=body.crossings.map(r=>({...r,sources:[...(r.sources||[])]}));
  const candidates=rows
    .map((row,index)=>({row,index,priority:candidatePriority(row)}))
    .filter(x=>x.row?.countryCode==='PL'&&x.row?.ppid&&x.priority>=0)
    .sort((a,b)=>b.priority-a.priority)
    .slice(0,MAX_PROBES_PER_REQUEST);

  const details=[];
  let updated=0;
  for(const item of candidates){
    const before=latestNakordoniSource(item.row);
    const live=await fetchLive(item.row.ppid,apiKey);
    const detail={ppid:item.row.ppid,name:item.row.name,oldAgeMin:sourceAge(before),ok:live.ok,status:live.status||null,error:live.error||null,fromCache:Boolean(live.fromCache),newAgeMin:live.snapshot?.ageMin??null};
    details.push(detail);
    if(!live.ok||!live.snapshot)continue;
    const merged=mergeLive(rows[item.index],live.snapshot);
    if(merged.updated){rows[item.index]=merged.row;updated+=1;}
  }

  const finalRows=rows.map(enforceQueueConflict);
  const nd={...(body.sourceStatus?.nakordoniDetails||{}),freshLiveSweep:true,freshLiveAttempted:candidates.length,freshLiveUpdated:updated,freshLiveDetails:details,rateLimitProtection:{scope:'all_nakordoni_api',maxPerSecond:2,minStartIntervalMs:LIVE_MIN_INTERVAL_MS,probeCacheMinutes:PROBE_TTL_MS/60000}};
  return res.status(200).json({...body,generatedAt:new Date().toISOString(),crossings:finalRows,sourceStatus:{...(body.sourceStatus||{}),nakordoniDetails:nd}});
}
