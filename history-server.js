import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

const port=Number(process.env.PORT||10000);
const publicDir=path.join(process.cwd(),'public');
const modelFile=process.env.HISTORY_MODEL_FILE||'/tmp/border-history-read-model.json';
const ingestToken=String(process.env.HISTORY_INGEST_TOKEN||'');
let model=null;

const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8'};
const json=(res,status,body)=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(body));};
const key=(direction,crossing,days)=>`${direction}|${crossing}|${days}`;

async function loadModel(){try{const raw=await fs.readFile(modelFile,'utf8');const parsed=JSON.parse(raw);if(parsed&&Array.isArray(parsed.catalog)&&parsed.datasets)model=parsed}catch{}}
async function saveModel(next){const tmp=`${modelFile}.tmp`;await fs.writeFile(tmp,JSON.stringify(next));await fs.rename(tmp,modelFile);model=next;}
async function readBody(req,max=8*1024*1024){let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>max)throw Object.assign(new Error('payload_too_large'),{statusCode:413});chunks.push(chunk)}return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}')}
function authOk(req){const h=String(req.headers.authorization||'');return ingestToken&&h===`Bearer ${ingestToken}`}
async function staticFile(res,name){try{const data=await fs.readFile(path.join(publicDir,name));res.statusCode=200;res.setHeader('Content-Type',mime[path.extname(name)]||'application/octet-stream');res.setHeader('Cache-Control',name.endsWith('.html')||name.endsWith('.js')?'no-store':'public, max-age=300');res.end(data)}catch{res.statusCode=404;res.end('Not found')}}

await loadModel();
const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('X-Frame-Options','DENY');
  try{
    const url=new URL(req.url||'/','https://history.invalid');
    if(req.method==='GET'&&url.pathname==='/health')return json(res,200,{ok:true,service:'border-monitor-history',hasModel:Boolean(model),generatedAt:model?.generatedAt||null});
    if(req.method==='POST'&&url.pathname==='/ingest'){
      if(!authOk(req))return json(res,401,{ok:false,error:'unauthorized'});
      const next=await readBody(req);
      if(!next||!Array.isArray(next.catalog)||!next.datasets||typeof next.datasets!=='object')return json(res,400,{ok:false,error:'invalid_model'});
      await saveModel(next);return json(res,200,{ok:true,generatedAt:next.generatedAt||null,catalog:next.catalog.length,datasets:Object.keys(next.datasets).length});
    }
    if(req.method==='GET'&&url.pathname==='/api/export')return model?json(res,200,model):json(res,503,{ok:false,error:'history_model_not_ready'});
    if(req.method==='GET'&&url.pathname==='/api/catalog')return model?json(res,200,{ok:true,data:model.catalog}):json(res,503,{ok:false,error:'history_model_not_ready'});
    if(req.method==='GET'&&(url.pathname==='/api/series'||url.pathname==='/api/insights')){
      if(!model)return json(res,503,{ok:false,error:'history_model_not_ready'});
      const crossing=String(url.searchParams.get('crossing')||'');
      const direction=url.searchParams.get('direction')==='EU_UA'?'EU_UA':'UA_EU';
      const days=Math.max(1,Math.min(730,Number(url.searchParams.get('days'))||30));
      const item=model.datasets[key(direction,crossing,days)]||null;
      if(!item)return json(res,200,{ok:true,data:url.pathname.endsWith('series')?[]:{}});
      return json(res,200,{ok:true,data:url.pathname.endsWith('series')?(item.series||[]):(item.insights||{})});
    }
    if(req.method!=='GET')return json(res,405,{ok:false,error:'method_not_allowed'});
    if(url.pathname==='/'||url.pathname==='/index.html'||url.pathname==='/history.html')return staticFile(res,'history.html');
    if(url.pathname==='/history.js')return staticFile(res,'history.js');
    if(url.pathname==='/history.css')return staticFile(res,'history.css');
    if(url.pathname==='/section-nav.css')return staticFile(res,'section-nav.css');
    res.statusCode=404;res.end('Not found');
  }catch(e){json(res,Number(e?.statusCode)||500,{ok:false,error:Number(e?.statusCode)===413?'payload_too_large':'internal_error'});}
});
server.listen(port,'0.0.0.0',()=>console.log(`Border History listening on ${port}`));
