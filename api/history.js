const ALLOWED_MODES=new Set(['catalog','series','insights']);
const ALLOWED_DIRECTIONS=new Set(['UA_EU','EU_UA']);

function cleanBaseUrl(value){return String(value||'').trim().replace(/\/+$/,'')}
function clampDays(value){const n=Number(value);return Number.isFinite(n)?Math.max(1,Math.min(730,Math.round(n))):30}

async function callRpc(functionName,body){
  const baseUrl=cleanBaseUrl(process.env.BORDER_HISTORY_SUPABASE_URL);
  const apiKey=String(process.env.BORDER_HISTORY_SUPABASE_KEY||'').trim();
  if(!baseUrl||!apiKey){const e=new Error('history_not_configured');e.statusCode=503;throw e}
  const headers={'Content-Type':'application/json','Accept':'application/json','apikey':apiKey};
  if(apiKey.startsWith('eyJ'))headers.Authorization=`Bearer ${apiKey}`;
  const ctl=new AbortController();
  const timeout=setTimeout(()=>ctl.abort(),12000);
  try{
    const response=await fetch(`${baseUrl}/rest/v1/rpc/${functionName}`,{method:'POST',headers,body:JSON.stringify(body||{}),signal:ctl.signal,cache:'no-store'});
    const raw=await response.text();
    let payload=null;try{payload=raw?JSON.parse(raw):null}catch{}
    if(!response.ok){
      const e=new Error('history_upstream_failed');
      e.statusCode=502;
      e.upstreamStatus=response.status;
      e.upstreamCode=payload?.code||payload?.error_code||null;
      e.upstreamMessage=payload?.message||payload?.msg||payload?.error||raw?.slice(0,240)||null;
      throw e;
    }
    return payload;
  }finally{clearTimeout(timeout)}
}

export default async function historyHandler(req,res){
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
  const mode=String(req.query?.mode||'').trim();
  if(!ALLOWED_MODES.has(mode))return res.status(404).json({ok:false,error:'history_mode_not_found'});
  try{
    if(mode==='catalog'){
      const data=await callRpc('border_history_catalog',{});
      return res.status(200).json({ok:true,data:Array.isArray(data)?data:[]});
    }
    const crossing=String(req.query?.crossing||'').trim();
    if(!crossing||crossing.length>320)return res.status(400).json({ok:false,error:'invalid_crossing'});
    const direction=ALLOWED_DIRECTIONS.has(String(req.query?.direction||''))?String(req.query.direction):'UA_EU';
    const days=clampDays(req.query?.days);
    const fn=mode==='series'?'border_history_series':'border_history_insights';
    const data=await callRpc(fn,{p_crossing_key:crossing,p_direction:direction,p_days:days});
    return res.status(200).json({ok:true,data:mode==='series'?(Array.isArray(data)?data:[]):(data||{})});
  }catch(error){
    const status=Number(error?.statusCode)||502;
    if(status>=500)console.error('[history-api]',JSON.stringify({error:String(error?.message||'history_error'),upstreamStatus:error?.upstreamStatus||null,upstreamCode:error?.upstreamCode||null,upstreamMessage:error?.upstreamMessage||null}));
    return res.status(status).json({ok:false,error:status===503?'history_not_configured':'history_unavailable',upstreamStatus:error?.upstreamStatus||null,upstreamCode:error?.upstreamCode||null,upstreamMessage:error?.upstreamMessage||null});
  }
}
