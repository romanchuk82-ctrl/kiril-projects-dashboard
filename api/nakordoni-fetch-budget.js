const STATE_KEY=Symbol.for('border-monitor.nakordoni-fetch-budget-v1');
const state=globalThis[STATE_KEY]||(globalThis[STATE_KEY]={heavyCache:new Map(),liveCache:new Map(),blockedUntil:0,nextLiveAt:0});

const HEAVY_TTL_MS=30*60*1000;
const LIVE_TTL_MS=60*60*1000;
const LIVE_GLOBAL_INTERVAL_MS=60*60*1000;
const NKD_PREFIX='https://nakordoni.eu/api/';
const ORIGINAL_FETCH_KEY=Symbol.for('border-monitor.nakordoni-fetch-budget-original');

function nextUtcMidnight(now=Date.now()){
  const d=new Date(now);
  return Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()+1,0,0,0,0);
}

function currentBlock(now=Date.now()){
  if(state.blockedUntil&&now>=state.blockedUntil)state.blockedUntil=0;
  return state.blockedUntil||0;
}

function jsonResponse(payload,status=200){
  return new Response(JSON.stringify(payload),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
}

function isPolandHeavy(url){
  const m=url.match(/\/api\/v4\/data\/border\/(\d+)\/(\d+)\/4(?:\?|$)/);
  if(!m)return false;
  const a=Number(m[1]),b=Number(m[2]);
  return (a===1&&b===2)||(a===2&&b===1);
}

function isHeavy(url){return /\/api\/v4\/data\/border\/\d+\/\d+\/4(?:\?|$)/.test(url)}
function isLive(url){return url.startsWith('https://nakordoni.eu/api/v1/data/queue')}

function cachedResponse(cache,key,ttl,now=Date.now()){
  const hit=cache.get(key);
  if(!hit||now-hit.ts>=ttl)return null;
  return new Response(hit.body,{status:hit.status,headers:{'content-type':hit.contentType||'application/json; charset=utf-8','cache-control':'no-store','x-border-budget-cache':'hit'}});
}

async function remember(cache,key,response){
  try{
    const clone=response.clone();
    const body=await clone.text();
    const contentType=clone.headers.get('content-type')||'application/json; charset=utf-8';
    if(response.ok)cache.set(key,{ts:Date.now(),status:response.status,body,contentType});
    if(response.status===429){
      const low=body.toLowerCase();
      if(low.includes('daily quota exhausted')||low.includes('200 calls/day')||low.includes('resets at midnight utc'))state.blockedUntil=nextUtcMidnight();
    }
  }catch{}
  return response;
}

if(!globalThis[ORIGINAL_FETCH_KEY]){
  const original=globalThis.fetch.bind(globalThis);
  globalThis[ORIGINAL_FETCH_KEY]=original;
  globalThis.fetch=async(input,init)=>{
    const url=typeof input==='string'?input:(input?.url||String(input||''));
    if(!url.startsWith(NKD_PREFIX))return original(input,init);

    const blocked=currentBlock();
    if(blocked)return jsonResponse({ok:false,error:{code:'DAILY_QUOTA_PAUSED',message:'Nakordoni API paused until UTC quota reset',blocked_until:new Date(blocked).toISOString()}},429);

    if(isHeavy(url)){
      if(!isPolandHeavy(url))return jsonResponse({ok:true,data:[],attribution:'Data by nakordoni.eu',budget_skipped:true,country_scope:'PL_only'},200);
      const cached=cachedResponse(state.heavyCache,url,HEAVY_TTL_MS);
      if(cached)return cached;
      const response=await original(input,init);
      return remember(state.heavyCache,url,response);
    }

    if(isLive(url)){
      const cached=cachedResponse(state.liveCache,url,LIVE_TTL_MS);
      if(cached)return cached;
      const now=Date.now();
      if(state.nextLiveAt&&now<state.nextLiveAt)return jsonResponse({ok:false,error:{code:'LIVE_BUDGET_THROTTLED',message:'Live Queue probe deferred by daily budget',next_at:new Date(state.nextLiveAt).toISOString()}},429);
      state.nextLiveAt=now+LIVE_GLOBAL_INTERVAL_MS;
      const response=await original(input,init);
      return remember(state.liveCache,url,response);
    }

    return original(input,init);
  };
}

export function nakordoniBudgetStatus(now=Date.now()){
  const blocked=currentBlock(now);
  return{
    policy:'PL-only heavy API + cached live probes',
    targetMaxCallsPerDay:120,
    heavyCacheMinutes:HEAVY_TTL_MS/60000,
    liveProbeMinIntervalMinutes:LIVE_GLOBAL_INTERVAL_MS/60000,
    dailyQuotaBlockedUntil:blocked?new Date(blocked).toISOString():null,
    nextLiveProbeAt:state.nextLiveAt&&state.nextLiveAt>now?new Date(state.nextLiveAt).toISOString():null,
    autoResumeAtUtcReset:true
  };
}
