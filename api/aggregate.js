const DESTS={2:{code:'PL',name:'Польща'},3:{code:'SK',name:'Словаччина'},4:{code:'HU',name:'Угорщина'},5:{code:'RO',name:'Румунія'}};
const TTL=5*60*1000;
const cache=new Map();
const n=v=>{const x=Number(v);return Number.isFinite(x)?x:null};
const s=v=>typeof v==='string'&&v.trim()?v.trim():null;
const pick=(o,ks)=>{for(const k of ks)if(o?.[k]!=null)return o[k];return null};
const tr=v=>{v=String(v??'').toLowerCase();if(['up','rising','increase','increasing','↑'].includes(v))return'up';if(['down','falling','decrease','decreasing','↓'].includes(v))return'down';if(['flat','stable','same','→'].includes(v))return'flat';return'unknown'};
const keyName=v=>String(v||'').toLowerCase().replace(/[–—-]/g,' ').replace(/[^\p{L}\p{N}]+/gu,' ').trim();

function rowsFrom(body){if(Array.isArray(body?.data))return body.data;if(Array.isArray(body?.data?.checkpoints))return body.data.checkpoints;if(Array.isArray(body?.checkpoints))return body.checkpoints;return[]}
function conf(row,age){const q=String(pick(row,['data_quality','quality'])||'').toLowerCase();if(q==='high'&&(age==null||age<=30))return'high';if(q==='low')return'low';if(age!=null&&age<=20)return'high';if(age!=null&&age<=60)return'medium';return'low'}
function norm(row,originId,destId){
  const c=DESTS[destId]||{code:String(destId),name:String(destId)};
  const ppid=s(pick(row,['ppid','id','checkpoint_id']));
  const name=s(pick(row,['name','checkpoint_name','title','crossing_name']))||ppid||'Невідомий КПП';
  const queueCars=n(pick(row,['queue','queue_now','cars','vehicles']));
  const waitMin=n(pick(row,['wait_min','wait_minutes','estimated_wait_min','waiting_time_min']));
  const ageMin=n(pick(row,['age_min','age_minutes','data_age_min']));
  const updatedAt=s(pick(row,['updated_at','timestamp','as_of','last_update']));
  const stale=typeof row?.stale==='boolean'?row.stale:(ageMin!=null?ageMin>60:false);
  const direction=originId===1?'UA_EU':'EU_UA';
  const sourceUrl=s(pick(row,['source_url','url']));
  return{ id:`${ppid||name}-${direction}`,ppid,name,country:c.name,countryCode:c.code,direction,queueCars,waitMin,waitStatus:s(pick(row,['wait_status','status'])),ageMin,updatedAt,trend:tr(pick(row,['trend_direction','trend','trend_status'])),trendPercent:n(pick(row,['trend_percent'])),stale,confidence:conf(row,ageMin),sourceUrl,sources:[{source:'nakordoni',label:'Nakordoni',value:waitMin,updatedAt,ageMin,sourceUrl,note:queueCars!=null?`${queueCars} авто`:null}]};
}
async function fetchJson(url,key){const ctl=new AbortController();const t=setTimeout(()=>ctl.abort(),10000);try{const r=await fetch(url,{headers:{Authorization:`Bearer ${key}`,Accept:'application/json'},signal:ctl.signal,cache:'no-store'});const body=await r.json().catch(()=>null);return{ok:r.ok&&body?.ok!==false,status:r.status,body}}finally{clearTimeout(t)}}
async function getNkd(key,direction){
  const reqs=Object.keys(DESTS).map(Number).map(destId=>{const originId=direction==='UA_EU'?1:destId;const destinationId=direction==='UA_EU'?destId:1;return{destId,originId,destinationId,url:`https://nakordoni.eu/api/v4/data/border/${originId}/${destinationId}/4?lang=uk`}});
  const out=await Promise.all(reqs.map(async q=>{try{return{...q,...await fetchJson(q.url,key)}}catch(e){return{...q,ok:false,status:0,error:String(e),body:null}}}));
  const crossings=[],failures=[],usage=[];let attribution='Data by nakordoni.eu';
  for(const r of out){if(!r.ok){failures.push({countryCode:DESTS[r.destId]?.code,httpStatus:r.status,error:r.body?.error?.message||r.body?.error||r.error||'upstream_error'});continue}if(r.body?.usage)usage.push(r.body.usage);if(r.body?.attribution)attribution=r.body.attribution;for(const row of rowsFrom(r.body)){const x=norm(row,r.originId,r.destId);if(x)crossings.push(x)}}
  return{crossings,failures,usage,attribution};
}
async function getTelegram(){
  const base=process.env.TELEGRAM_READER_URL?.replace(/\/$/,'');if(!base)return{status:'not_configured',items:[]};
  try{const h={Accept:'application/json'};if(process.env.TELEGRAM_READER_TOKEN)h.Authorization=`Bearer ${process.env.TELEGRAM_READER_TOKEN}`;const r=await fetch(`${base}/snapshot`,{headers:h,cache:'no-store'});if(!r.ok)return{status:'error',items:[]};const b=await r.json();return{status:'connected',items:Array.isArray(b)?b:(b.items||[])}}catch{return{status:'error',items:[]}}
}
function mergeTelegram(crossings,items,direction){const out=crossings.map(x=>({...x,sources:[...x.sources]}));for(const raw of Array.isArray(items)?items:[]){const name=s(pick(raw,['checkpoint','name','crossing']));if(!name)continue;const dir=String(raw.direction||'').toUpperCase().startsWith('EU')?'EU_UA':'UA_EU';if(dir!==direction)continue;const nk=keyName(name);let f=out.find(x=>keyName(x.name).includes(nk)||nk.includes(keyName(x.name)));const waitMin=n(pick(raw,['wait_min','waitMinutes','waiting_time_min']));const ageMin=n(pick(raw,['age_min','ageMinutes']));const queueCars=n(pick(raw,['queue_cars','cars','queue']));const updatedAt=s(pick(raw,['updated_at','timestamp','as_of']));const note=s(pick(raw,['note','text','summary']));if(!f){f={id:`tg-${nk}-${dir}`,name,country:s(raw.country)||'',countryCode:s(raw.country_code||raw.countryCode)||'',direction:dir,queueCars,waitMin,ageMin,updatedAt,trend:tr(raw.trend),trendPercent:null,stale:(ageMin??999)>60,confidence:'low',sourceUrl:null,sources:[]};out.push(f)}f.sources.push({source:'telegram',label:'Telegram',value:waitMin,updatedAt,ageMin,note:note||(queueCars!=null?`${queueCars} авто`:null)})}return out}
function sort(rows){return[...rows].sort((a,b)=>(a.stale?1:0)-(b.stale?1:0)||(a.waitMin??999999)-(b.waitMin??999999)||(a.ageMin??9999)-(b.ageMin??9999))}

export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
  const direction=req.query?.direction==='EU_UA'?'EU_UA':'UA_EU';const generatedAt=new Date().toISOString();const tg=await getTelegram();const apiKey=process.env.NKD_API_KEY;
  if(!apiKey)return res.status(200).json({ok:true,generatedAt,direction,apiVersion:'v4',cacheMinutes:5,crossings:sort(mergeTelegram([],tg.items,direction)),sourceStatus:{nakordoni:'missing_key',telegram:tg.status},attribution:'Data by nakordoni.eu'});
  const ck=`${apiKey.slice(-6)}:${direction}`;let nkd=cache.get(ck);let fromCache=true;if(!nkd||Date.now()-nkd.ts>TTL){nkd={ts:Date.now(),value:await getNkd(apiKey,direction)};cache.set(ck,nkd);fromCache=false}
  const x=nkd.value;return res.status(200).json({ok:true,generatedAt,direction,apiVersion:'v4',cacheMinutes:5,fromCache,crossings:sort(mergeTelegram(x.crossings,tg.items,direction)),sourceStatus:{nakordoni:x.crossings.length?'connected':(x.failures.length?'error':'empty'),telegram:tg.status},attribution:x.attribution,usage:x.usage,failures:x.failures});
}
