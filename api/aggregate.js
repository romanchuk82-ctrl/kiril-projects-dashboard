import {fetchOfficial,cameraFor} from './official.js';
import {getTelegramSnapshot} from './telegram.js';
import {fetchNakordoniWeb} from './nakordoni-web.js';
const DESTS={2:{code:'PL',name:'Польща'},3:{code:'SK',name:'Словаччина'},4:{code:'HU',name:'Угорщина'},5:{code:'RO',name:'Румунія'}};
const COUNTRY_NAMES={PL:'Польща',SK:'Словаччина',HU:'Угорщина',RO:'Румунія',MD:'Молдова'};
const TTL=5*60*1000;
const OFFICIAL_TTL=2*60*1000;
const cache=new Map();
const officialCache=new Map();
const n=v=>{const x=Number(v);return Number.isFinite(x)?x:null};
const s=v=>typeof v==='string'&&v.trim()?v.trim():null;
const pick=(o,ks)=>{for(const k of ks)if(o?.[k]!=null)return o[k];return null};
const tr=v=>{v=String(v??'').toLowerCase();if(['up','rising','increase','increasing','↑'].includes(v))return'up';if(['down','falling','decrease','decreasing','↓'].includes(v))return'down';if(['flat','stable','same','→'].includes(v))return'flat';return'unknown'};
const keyName=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[–—-]/g,' ').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function rowsFrom(body){if(Array.isArray(body?.data))return body.data;if(Array.isArray(body?.data?.checkpoints))return body.data.checkpoints;if(Array.isArray(body?.checkpoints))return body.checkpoints;return[]}
function conf(row,age){const q=String(pick(row,['data_quality','quality'])||'').toLowerCase();if(q==='high'&&(age==null||age<=30))return'high';if(q==='low')return'low';if(age!=null&&age<=20)return'high';if(age!=null&&age<=60)return'medium';return'low'}
function norm(row,originId,destId){const c=DESTS[destId]||{code:String(destId),name:String(destId)};const ppid=s(pick(row,['ppid','id','checkpoint_id']));const name=s(pick(row,['name','checkpoint_name','title','crossing_name']))||ppid||'Невідомий КПП';const queueCars=n(pick(row,['queue','queue_now','cars','vehicles']));const waitMin=n(pick(row,['wait_min','wait_minutes','estimated_wait_min','waiting_time_min']));const ageMin=n(pick(row,['age_min','age_minutes','data_age_min']));const updatedAt=s(pick(row,['updated_at','timestamp','as_of','last_update']));const stale=typeof row?.stale==='boolean'?row.stale:(ageMin!=null?ageMin>60:false);const direction=originId===1?'UA_EU':'EU_UA';const sourceUrl=s(pick(row,['source_url','url']));return{id:`${ppid||name}-${direction}`,ppid,name,country:c.name,countryCode:c.code,direction,queueCars,waitMin,waitStatus:s(pick(row,['wait_status','status'])),ageMin,updatedAt,trend:tr(pick(row,['trend_direction','trend','trend_status'])),trendPercent:n(pick(row,['trend_percent'])),stale,confidence:conf(row,ageMin),sourceUrl,sources:[{source:'nakordoni',label:'Nakordoni',value:waitMin,updatedAt,ageMin,sourceUrl,note:queueCars!=null?`${queueCars} авто`:null}]}}
async function fetchJson(url,key){const ctl=new AbortController();const t=setTimeout(()=>ctl.abort(),20000);try{const r=await fetch(url,{headers:{Authorization:`Bearer ${key}`,Accept:'application/json'},signal:ctl.signal,cache:'no-store'});const body=await r.json().catch(()=>null);return{ok:r.ok&&body?.ok!==false,status:r.status,body}}finally{clearTimeout(t)}}
async function getNkd(key,direction){const reqs=Object.keys(DESTS).map(Number).map(destId=>{const originId=direction==='UA_EU'?1:destId;const destinationId=direction==='UA_EU'?destId:1;return{destId,originId,destinationId,url:`https://nakordoni.eu/api/v4/data/border/${originId}/${destinationId}/4?lang=uk`}});const out=await Promise.all(reqs.map(async(q,i)=>{if(i)await sleep(i*600);try{return{...q,...await fetchJson(q.url,key)}}catch(e){return{...q,ok:false,status:0,error:String(e),body:null}}}));const crossings=[],failures=[],usage=[];let attribution='Data by nakordoni.eu';for(const r of out){if(!r.ok){failures.push({countryCode:DESTS[r.destId]?.code,httpStatus:r.status,error:r.body?.error?.message||r.body?.error||r.error||'upstream_error'});continue}if(r.body?.usage)usage.push(r.body.usage);if(r.body?.attribution)attribution=r.body.attribution;for(const row of rowsFrom(r.body)){const x=norm(row,r.originId,r.destId);if(x)crossings.push(x)}}return{crossings,failures,usage,attribution}}
async function getOfficial(direction){let x=officialCache.get(direction);if(!x||Date.now()-x.ts>OFFICIAL_TTL){x={ts:Date.now(),value:await fetchOfficial(direction)};officialCache.set(direction,x)}return x.value}
async function getTelegram(){try{const b=await getTelegramSnapshot();const src=Array.isArray(b?.sources)?b.sources:[];const connected=src.filter(x=>x.status==='connected').length;const status=s(b?.status)||(connected===0?'error':connected===src.length?'connected':'partial');return{status,items:Array.isArray(b?.items)?b.items:[],sources:src,meta:{mode:b?.mode||'mtproto',configured:Boolean(b?.sessionConfigured),authorized:Boolean(b?.authorized),connectedSources:connected,totalSources:src.length,maxAgeMinutes:b?.maxAgeMinutes??180}}}catch(e){return{status:'error',items:[],sources:[],meta:{mode:'mtproto',configured:Boolean(process.env.TELEGRAM_SESSION),authorized:false,connectedSources:0,totalSources:0,maxAgeMinutes:180},error:String(e?.message||e)}}}
function mergeOfficial(crossings,items,direction){const out=crossings.map(x=>({...x,sources:[...(x.sources||[])]}));for(const e of items||[]){if(e.direction!==direction)continue;let f=out.find(x=>x.countryCode===e.countryCode&&e.aliases?.some(a=>keyName(`${x.name} ${(x.sources||[]).map(z=>z.note||'').join(' ')}`).includes(keyName(a))));if(!f){f={id:`official-${e.countryCode}-${keyName(e.note||e.aliases?.[0]||'crossing')}-${direction}`,ppid:null,name:(e.note||e.aliases?.[0]||'Офіційний КПП').split(' · ')[0],country:COUNTRY_NAMES[e.countryCode]||e.countryCode,countryCode:e.countryCode,direction,queueCars:null,waitMin:e.waitMin,waitStatus:null,ageMin:e.ageMin??null,updatedAt:e.updatedAt||null,trend:'unknown',trendPercent:null,stale:false,confidence:'high',sourceUrl:e.sourceUrl||null,sources:[]};out.push(f)}const src={...e};delete src.aliases;f.sources.push(src);if(f.waitMin==null&&e.waitMin!=null)f.waitMin=e.waitMin;if(!f.updatedAt&&e.updatedAt)f.updatedAt=e.updatedAt;if(f.ageMin==null&&e.ageMin!=null)f.ageMin=e.ageMin;if(e.waitMin!=null)f.confidence='high'}return out.map(x=>({...x,camera:cameraFor(x)}))}
function rowMatches(x,name,countryCode,aliases=[]){if(countryCode&&x.countryCode&&x.countryCode!==countryCode)return false;const a=keyName(x.name),b=keyName(name);if(a&&b&&(a.includes(b)||b.includes(a)))return true;const rowText=keyName(`${x.name} ${(x.sources||[]).map(z=>z.note||'').join(' ')}`);return aliases.some(v=>{const k=keyName(v);return k&&rowText.includes(k)})}
function chatMeta(src){return{label:src.label||src.checkpoint||src.channel,channel:src.channel||null,url:src.channelUrl||null,status:src.status||'unknown',freshReports:src.items??0,messagesScanned:src.messagesScanned??0,newestMessageAt:src.newestMessageAt||null}}
function chatPlaceholder(chat,direction){return{id:`tg-chat-${chat.channel}-${direction}`,ppid:null,name:chat.checkpoint,country:chat.country||COUNTRY_NAMES[chat.countryCode]||'',countryCode:chat.countryCode||'',direction,queueCars:null,waitMin:null,waitStatus:null,ageMin:null,updatedAt:null,trend:'unknown',trendPercent:null,stale:false,confidence:'low',sourceUrl:chat.channelUrl||null,sources:[],humanReports:0,humanSignal:null,telegramChat:chatMeta(chat)}}
function dropDuplicateChatPlaceholders(rows){
  const realChannels=new Set(rows.filter(r=>!String(r.id||'').startsWith('tg-chat-')&&r.telegramChat?.channel).map(r=>String(r.telegramChat.channel).toLowerCase()));
  return rows.filter(r=>{if(!String(r.id||'').startsWith('tg-chat-'))return true;const ch=String(r.telegramChat?.channel||'').toLowerCase();return !ch||!realChannels.has(ch)})
}
export function mergeTelegram(crossings,items,direction,chatSources=[]){const out=crossings.map(x=>({...x,sources:[...(x.sources||[])],humanReports:x.humanReports||0,humanSignal:x.humanSignal||null}));for(const chat of Array.isArray(chatSources)?chatSources:[]){if(chat.kind!=='checkpoint_chat'||!chat.checkpoint)continue;const exactName=keyName(chat.checkpoint);let f=out.find(x=>(!chat.countryCode||!x.countryCode||x.countryCode===chat.countryCode)&&keyName(x.name)===exactName);if(!f)f=out.find(x=>!x.telegramChat&&rowMatches(x,chat.checkpoint,chat.countryCode,chat.aliases||[]));if(!f){f=chatPlaceholder(chat,direction);out.push(f)}else f.telegramChat=chatMeta(chat)}for(const raw of Array.isArray(items)?items:[]){const name=s(pick(raw,['checkpoint','name','crossing']));if(!name)continue;const dir=String(raw.direction||'').toUpperCase().startsWith('EU')?'EU_UA':'UA_EU';if(dir!==direction)continue;const countryCode=s(raw.country_code||raw.countryCode)||'';const sourceChannel=s(raw.source_channel||raw.sourceChannel);let f=out.find(x=>sourceChannel&&String(x.telegramChat?.channel||'').toLowerCase()===sourceChannel.toLowerCase());if(!f)f=out.find(x=>rowMatches(x,name,countryCode,[]));const rawWait=pick(raw,['wait_min','waitMinutes','waiting_time_min']);const waitMin=rawWait==null?null:n(rawWait);const rawAge=pick(raw,['age_min','ageMinutes']);const ageMin=rawAge==null?null:n(rawAge);const rawQueue=pick(raw,['queue_cars','cars','queue']);const queueCars=rawQueue==null?null:n(rawQueue);const updatedAt=s(pick(raw,['updated_at','timestamp','as_of']));const note=s(pick(raw,['note','text','summary']));const sourceUrl=s(raw.source_url||raw.sourceUrl);const sourceLabel=s(raw.source_label||raw.sourceLabel)||'Telegram';const channelUrl=s(raw.channel_url||raw.channelUrl);const replyContext=s(raw.reply_context||raw.replyContext);const directionBasis=s(raw.direction_basis||raw.directionBasis);if(!f){f={id:`tg-${keyName(name)}-${dir}`,name,country:s(raw.country)||COUNTRY_NAMES[countryCode]||'',countryCode,direction:dir,queueCars:null,waitMin:null,ageMin:null,updatedAt:null,trend:'unknown',trendPercent:null,stale:false,confidence:'low',sourceUrl:null,sources:[],humanReports:0,humanSignal:'reported'};out.push(f)}f.sources.push({source:'telegram',label:sourceLabel,value:waitMin,queueCars,updatedAt,ageMin,note:note||(queueCars!=null?`${queueCars} авто`:null),replyContext,directionBasis,sourceUrl,channelUrl,sourceChannel});if(channelUrl)f.telegramChat={label:sourceLabel,channel:sourceChannel,url:channelUrl,status:'connected',freshReports:(f.telegramChat?.freshReports||0)+1};f.humanReports=(f.humanReports||0)+1;f.humanSignal=f.humanReports>=2?'corroborated':'reported'}return dropDuplicateChatPlaceholders(out).map(x=>applyTelegramTimeTrust({...x,camera:x.camera||cameraFor(x)}))}
const TG_TRUST_MAX_AGE=180;
function telegramQueueCount(src){
  const direct=src?.queueCars!=null?Number(src.queueCars):NaN;
  if(Number.isFinite(direct)&&direct>=0)return Math.round(direct);
  const raw=String(src?.note||'');
  let m=raw.match(/(\d{1,4})\s*[-–—]\s*(\d{1,4})\s*(?:авто|машин[\p{L}]*)/iu);
  if(m)return Math.max(Number(m[1]),Number(m[2]));
  m=raw.match(/(?:^|[^\d])(\d{1,4})\s*(?:авто|машин[\p{L}]*)(?=$|[^\p{L}\p{N}])/iu);
  return m?Number(m[1]):null
}
function telegramQualitativeSignal(src){
  const q=telegramQueueCount(src);
  if(q!=null){if(q<=3)return'low';if(q>=10)return'high';return'mid'}
  const raw=String(src?.note||'');
  if(/[?？]/.test(raw)||/(?:^|\s)(яка|який|які|скільки|підкажіть|підкажи|скажіть|скажи|хто знає)(?:\s|$)/iu.test(raw))return null;
  const text=keyName(raw);
  const low=/(без черги|нема черги|немає черги|черги нема|черги немає|пусто|вільно|вільний|одразу|відразу|сразу|без очікування)/.test(text);
  const high=/(велика черга|довга черга|черга велика|черга довга|стоимо|стоїмо|чекаємо|ждемо|затор)/.test(text);
  if(low&&!high)return'low';if(high&&!low)return'high';return null
}
export function applyTelegramTimeTrust(row){
  const out={...row,sources:[...(row.sources||[])]};
  const baseRaw=out.baseWaitMin!=null?Number(out.baseWaitMin):(out.waitMin!=null?Number(out.waitMin):null);
  const base=Number.isFinite(baseRaw)?Math.max(0,Math.round(baseRaw)):null;
  const fresh=out.sources.filter(src=>src?.source==='telegram'&&src.ageMin!=null&&Number(src.ageMin)>=0&&Number(src.ageMin)<=TG_TRUST_MAX_AGE);
  const numeric=fresh.filter(src=>src.value!=null&&Number.isFinite(Number(src.value)));
  const vals=numeric.map(src=>Math.max(0,Math.round(Number(src.value)))).sort((a,b)=>a-b);
  const median=vals.length?(vals.length%2?vals[(vals.length-1)/2]:Math.round((vals[vals.length/2-1]+vals[vals.length/2])/2)):null;
  const signalRows=fresh.map(src=>({src,signal:telegramQualitativeSignal(src)})).filter(x=>x.signal);
  const signals=signalRows.map(x=>x.signal);
  const counts={low:signals.filter(x=>x==='low').length,mid:signals.filter(x=>x==='mid').length,high:signals.filter(x=>x==='high').length};
  const queueRows=fresh.map(src=>({src,q:telegramQueueCount(src)})).filter(x=>x.q!=null).sort((a,b)=>Number(a.src.ageMin)-Number(b.src.ageMin));
  out.baseWaitMin=base;
  out.telegramWaitMin=median;
  out.telegramTimeReports=vals.length;
  out.telegramFreshReports=fresh.length;
  out.telegramQualitative=counts;
  out.telegramQueueCars=queueRows.length?queueRows[0].q:null;
  out.telegramQueueAgeMin=queueRows.length?Number(queueRows[0].src.ageMin):null;
  out.telegramTimeAgeMin=numeric.length?Math.min(...numeric.map(src=>Number(src.ageMin))):null;
  out.timeDeltaMin=base!=null&&median!=null?Math.abs(base-median):null;
  if(base==null){out.timeReliable=false;out.timeReliability='no_time';out.timeReliabilityReason=fresh.length?'Telegram має свіжі дані, але немає незалежної базової оцінки часу':'Немає незалежної базової оцінки часу';return out}
  if(vals.length){
    const spread=vals.length>1?vals[vals.length-1]-vals[0]:0;
    const spreadLimit=Math.max(30,Math.round((median||0)*0.5));
    if(spread>spreadLimit){out.waitMin=base;out.timeReliable=false;out.timeReliability='conflict';out.timeReliabilityReason='Свіжі повідомлення Telegram суперечать одне одному';out.confidence='low';return out}
    const tolerance=Math.max(20,Math.round(base*0.35));
    if(Math.abs(base-median)>tolerance){out.waitMin=base;out.timeReliable=false;out.timeReliability='conflict';out.timeReliabilityReason=`Telegram відрізняється від базового часу на ${Math.abs(base-median)} хв`;out.confidence='low';return out}
    const weight=vals.length>=2?0.45:0.35;
    out.waitMin=Math.max(0,Math.round(base*(1-weight)+median*weight));
    out.timeReliable=true;out.timeReliability='confirmed';out.timeReliabilityReason=`Telegram прямо підтвердив час (${vals.length})`;out.confidence='high';return out
  }
  let support=0,contradict=0;
  if(base<=20){support=counts.low;contradict=counts.high}
  else if(base>=60){support=counts.high;contradict=counts.low}
  else {support=counts.mid;contradict=(base>=45?counts.low:0)+(base<=35?counts.high:0)}
  if(contradict>0&&support===0){out.waitMin=base;out.timeReliable=false;out.timeReliability='conflict';out.timeReliabilityReason='Telegram описує іншу ситуацію з чергою, ніж базова оцінка';out.confidence='low';return out}
  if(support>=1){out.waitMin=base;out.timeReliable=true;out.timeReliability='supported';out.timeReliabilityReason=`Ситуацію підтверджує ${support} пряме повідомлення Telegram`;out.confidence='medium';return out}
  out.waitMin=base;out.timeReliable=false;out.timeReliability='unconfirmed';out.timeReliabilityReason=fresh.length?'Telegram є, але немає прямого підтвердження ситуації':'Немає свіжого підтвердження з Telegram за останні 3 години';out.confidence='low';return out
}
async function supplementNakordoniWeb(rows,direction){
  const base=Array.isArray(rows)?rows.map(x=>({...x,sources:[...(x.sources||[])]})):[];
  const usablePl=base.filter(x=>x.countryCode==='PL'&&!x.stale&&(x.waitMin!=null||x.queueCars!=null)).length;
  if(usablePl>=8)return{rows:base,web:null,added:0};
  let web;
  try{web=await fetchNakordoniWeb(direction)}catch(e){return{rows:base,web:{crossings:[],failures:[{error:String(e?.message||e)}]},added:0}}
  let added=0;
  for(const w of web.crossings||[]){
    const i=base.findIndex(x=>x.countryCode==='PL'&&rowMatches(x,w.name,'PL',[]));
    if(i<0){base.push(w);added++;continue}
    const cur=base[i];
    const curUsable=!cur.stale&&(cur.waitMin!=null||cur.queueCars!=null);
    const webUsable=!w.stale&&(w.waitMin!=null||w.queueCars!=null);
    if(!curUsable&&webUsable){base[i]={...cur,...w,id:cur.id||w.id,sources:[...(cur.sources||[]),...(w.sources||[])]};added++}
    else if((cur.sources||[]).every(z=>z.source!=='nakordoni')&&(w.sources||[]).length){base[i]={...cur,sources:[...(cur.sources||[]),...(w.sources||[])]}}
  }
  return{rows:base,web,added}
}
function sort(rows){return[...rows].sort((a,b)=>(a.timeReliable===true?0:1)-(b.timeReliable===true?0:1)||(a.stale?1:0)-(b.stale?1:0)||(a.waitMin??999999)-(b.waitMin??999999)||(a.ageMin??9999)-(b.ageMin??9999))}
async function fetchRegionalUpstream(direction){const base=process.env.UPSTREAM_AGGREGATOR_URL?.replace(/\/$/,'');if(!base)return null;try{const r=await fetch(`${base}/api/aggregate?direction=${direction}`,{headers:{Accept:'application/json'},cache:'no-store'});const body=await r.json().catch(()=>null);if(!r.ok||!body?.ok)return null;return body}catch{return null}}
export default async function handler(req,res){if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});const direction=req.query?.direction==='EU_UA'?'EU_UA':'UA_EU';const regional=await fetchRegionalUpstream(direction);if(regional){const tg=await getTelegram();const rows=mergeTelegram(Array.isArray(regional.crossings)?regional.crossings:[],tg.items,direction,tg.sources);return res.status(200).json({...regional,generatedAt:new Date().toISOString(),crossings:sort(rows),sourceStatus:{...(regional.sourceStatus||{}),telegram:tg.status,telegramDetails:tg.meta},viaRegionalUpstream:true,telegramLocal:true})}const generatedAt=new Date().toISOString();const [tg,official]=await Promise.all([getTelegram(),getOfficial(direction)]);const apiKey=process.env.NKD_API_KEY||s(req.headers?.['x-nkd-key']);if(!apiKey){const nw=await supplementNakordoniWeb([],direction);const rows=mergeTelegram(mergeOfficial(nw.rows,official.items,direction),tg.items,direction,tg.sources);return res.status(200).json({ok:true,generatedAt,direction,apiVersion:'v4',cacheMinutes:5,crossings:sort(rows),sourceStatus:{nakordoni:nw.rows.length?'connected':'missing_key',nakordoniDetails:{mode:nw.rows.length?'web_fallback':'missing_key',apiCount:0,webCount:nw.web?.crossings?.length||0,added:nw.added},official:official.status,cameras:'configured',telegram:tg.status,telegramDetails:tg.meta},attribution:'Data by nakordoni.eu',failures:nw.web?.failures||[]})}const ck=`${apiKey.slice(-6)}:${direction}`;let nkd=cache.get(ck);let fromCache=true;if(!nkd||Date.now()-nkd.ts>TTL){nkd={ts:Date.now(),value:await getNkd(apiKey,direction)};cache.set(ck,nkd);fromCache=false}const x=nkd.value;const nw=await supplementNakordoniWeb(x.crossings,direction);let rows=mergeOfficial(nw.rows,official.items,direction);rows=mergeTelegram(rows,tg.items,direction,tg.sources);return res.status(200).json({ok:true,generatedAt,direction,apiVersion:'v4',cacheMinutes:5,fromCache,crossings:sort(rows),sourceStatus:{nakordoni:nw.rows.length?'connected':(x.failures.length?'error':'empty'),nakordoniDetails:{mode:x.crossings.length?(nw.added?'api_plus_web':'api'):(nw.web?.crossings?.length?'web_fallback':'error'),apiCount:x.crossings.length,webCount:nw.web?.crossings?.length||0,added:nw.added},official:official.status,cameras:'configured',telegram:tg.status,telegramDetails:tg.meta},attribution:x.attribution,usage:x.usage,failures:[...(x.failures||[]),...((nw.web?.failures)||[])]})}
