const STATE_KEY=Symbol.for('border-monitor.nakordoni-fetch-budget-v2');
const state=globalThis[STATE_KEY]||(globalThis[STATE_KEY]={
  heavyCache:new Map(),liveCache:new Map(),heavyInflight:new Map(),liveInflight:new Map(),
  blockedUntil:0,nextLiveAt:0,dayKey:null,heavyNetworkCalls:0,liveNetworkCalls:0
});

const HEAVY_TTL_MS=30*60*1000;
const LIVE_TTL_MS=60*60*1000;
const LIVE_GLOBAL_INTERVAL_MS=60*60*1000;
const HARD_DAILY_NETWORK_CAP=150;
const NKD_PREFIX='https://nakordoni.eu/api/';
const ORIGINAL_FETCH_KEY=Symbol.for('border-monitor.nakordoni-fetch-budget-original-v2');

function utcDayKey(now=Date.now()){return new Date(now).toISOString().slice(0,10)}
function refreshDay(now=Date.now()){
  const key=utcDayKey(now);
  if(state.dayKey!==key){state.dayKey=key;state.heavyNetworkCalls=0;state.liveNetworkCalls=0;state.blockedUntil=0;}
}
function nextUtcMidnight(now=Date.now()){
  const d=new Date(now);
  return Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()+1,0,0,0,0);
}
function currentBlock(now=Date.now()){
  refreshDay(now);
  if(state.blockedUntil&&now>=state.blockedUntil)state.blockedUntil=0;
  return state.blockedUntil||0;
}
function totalNetworkCalls(){return Number(state.heavyNetworkCalls||0)+Number(state.liveNetworkCalls||0)}
function enforceLocalCap(now=Date.now()){
  refreshDay(now);
  if(totalNetworkCalls()>=HARD_DAILY_NETWORK_CAP&&!state.blockedUntil)state.blockedUntil=nextUtcMidnight(now);
  return currentBlock(now);
}

function jsonResponse(payload,status=200){
  return new Response(JSON.stringify(payload),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
}
function responseFromSnapshot(snap,cacheHeader=null){
  const headers={'content-type':snap.contentType||'application/json; charset=utf-8','cache-control':'no-store'};
  if(cacheHeader)headers['x-border-budget-cache']=cacheHeader;
  return new Response(snap.body,{status:snap.status,headers});
}
function isPolandHeavy(url){
  const m=url.match(/\/api\/v4\/data\/border\/(\d+)\/(\d+)\/4(?:\?|$)/);
  if(!m)return false;
  const a=Number(m[1]),b=Number(m[2]);
  return (a===1&&b===2)||(a===2&&b===1);
}
function isHeavy(url){return /\/api\/v4\/data\/border\/\d+\/\d+\/4(?:\?|$)/.test(url)}
function isLive(url){return url.startsWith('https://nakordoni.eu/api/v1/data/queue')}
function cachedSnapshot(cache,key,ttl,now=Date.now()){
  const hit=cache.get(key);
  return hit&&now-hit.ts<ttl?hit:null;
}
function noteDailyQuota(status,body,now=Date.now()){
  if(Number(status)!==429)return;
  const low=String(body||'').toLowerCase();
  if(low.includes('daily quota exhausted')||low.includes('200 calls/day')||low.includes('resets at midnight utc'))state.blockedUntil=nextUtcMidnight(now);
}
async function networkSnapshot(original,input,init,cache,key,kind){
  refreshDay();
  if(kind==='heavy')state.heavyNetworkCalls+=1;else state.liveNetworkCalls+=1;
  const response=await original(input,init);
  const body=await response.text();
  const snap={ts:Date.now(),status:response.status,body,contentType:response.headers.get('content-type')||'application/json; charset=utf-8'};
  if(response.ok)cache.set(key,snap);
  noteDailyQuota(response.status,body);
  enforceLocalCap();
  return snap;
}
async function singleFlight(map,key,work){
  let task=map.get(key);
  if(!task){
    task=Promise.resolve().then(work).finally(()=>map.delete(key));
    map.set(key,task);
  }
  return task;
}

if(!globalThis[ORIGINAL_FETCH_KEY]){
  const original=globalThis.fetch.bind(globalThis);
  globalThis[ORIGINAL_FETCH_KEY]=original;
  globalThis.fetch=async(input,init)=>{
    const url=typeof input==='string'?input:(input?.url||String(input||''));
    if(!url.startsWith(NKD_PREFIX))return original(input,init);

    const blocked=enforceLocalCap();
    if(blocked)return jsonResponse({ok:false,error:{code:'DAILY_QUOTA_PAUSED',message:'Nakordoni API paused until UTC quota reset',blocked_until:new Date(blocked).toISOString()}},429);

    if(isHeavy(url)){
      if(!isPolandHeavy(url))return jsonResponse({ok:true,data:[],attribution:'Data by nakordoni.eu',budget_skipped:true,country_scope:'PL_only'},200);
      const cached=cachedSnapshot(state.heavyCache,url,HEAVY_TTL_MS);
      if(cached)return responseFromSnapshot(cached,'hit');
      const snap=await singleFlight(state.heavyInflight,url,()=>networkSnapshot(original,input,init,state.heavyCache,url,'heavy'));
      return responseFromSnapshot(snap,'single-flight');
    }

    if(isLive(url)){
      const cached=cachedSnapshot(state.liveCache,url,LIVE_TTL_MS);
      if(cached)return responseFromSnapshot(cached,'hit');
      const now=Date.now();
      if(state.nextLiveAt&&now<state.nextLiveAt)return jsonResponse({ok:false,error:{code:'LIVE_BUDGET_THROTTLED',message:'Live Queue probe deferred by daily budget',next_at:new Date(state.nextLiveAt).toISOString()}},429);
      state.nextLiveAt=now+LIVE_GLOBAL_INTERVAL_MS;
      const snap=await singleFlight(state.liveInflight,url,()=>networkSnapshot(original,input,init,state.liveCache,url,'live'));
      return responseFromSnapshot(snap,'single-flight');
    }

    return original(input,init);
  };
}

export function nakordoniBudgetStatus(now=Date.now()){
  const blocked=currentBlock(now);
  return{
    policy:'PL-only heavy API + cached/single-flight live probes',
    targetMaxCallsPerDay:120,
    hardProcessSafetyCap:HARD_DAILY_NETWORK_CAP,
    heavyCacheMinutes:HEAVY_TTL_MS/60000,
    liveProbeMinIntervalMinutes:LIVE_GLOBAL_INTERVAL_MS/60000,
    networkCallsToday:{heavy:state.heavyNetworkCalls||0,live:state.liveNetworkCalls||0,total:totalNetworkCalls()},
    dailyQuotaBlockedUntil:blocked?new Date(blocked).toISOString():null,
    nextLiveProbeAt:state.nextLiveAt&&state.nextLiveAt>now?new Date(state.nextLiveAt).toISOString():null,
    autoResumeAtUtcReset:true
  };
}
