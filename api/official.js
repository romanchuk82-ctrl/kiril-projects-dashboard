const UA={'User-Agent':'BorderMonitorUA/1.0 (+https://border-monitor-ua.onrender.com)','Accept':'text/html,application/xhtml+xml'};
const OFFICIAL_URLS={
  PL:'https://granica.gov.pl/index_wait.php?c=t&k=w&p=u&v=en',
  SK:'https://www.financnasprava.sk/sk/infoservis/hranicne-priechody/_1',
  HU:'https://www.police.hu/hu/hirek-es-informaciok/hatarinfo?field_hat_rszakasz_value=ukr%C3%A1n+hat%C3%A1rszakasz',
  RO_IN:'https://www.politiadefrontiera.ro/ro/traficonline/?dt=1&vw=2',
  RO_OUT:'https://www.politiadefrontiera.ro/ro/traficonline/?dt=2&vw=2'
};
const CAMERA_MAP=[
  {countryCode:'PL',aliases:['шегині','medyka'],label:'Медика - камера',url:'https://kordon.info/medyka-online/',kind:'border_cam'},
  {countryCode:'PL',aliases:['устилуг','zosin'],label:'Зосін - камера',url:'https://kordon.info/zosin-online/',kind:'border_cam'},
  {countryCode:'PL',aliases:['грушів','budomierz'],label:'Грушів - камери',url:'https://kordon.info/grushiv-kamery-na-kordoni/',kind:'border_cam'},
  {countryCode:'HU',aliases:['чоп','zahony','záhony'],label:'Záhony - камера',url:'https://worldcam.eu/webcams/europe/hungary/37855-zahony-border-checkpoint',kind:'border_cam'},
  {countryCode:'RO',aliases:['порубне','siret'],label:'Siret - live камера',url:'https://webcamromania.ro/webcam-orase/webcam-orasul-siret/',kind:'border_cam'}
];
const clean=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[–—-]/g,' ').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const decode=s=>String(s||'').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>');
const htmlText=html=>decode(String(html||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<br\s*\/?>/gi,'\n').replace(/<\/p>|<\/tr>|<\/li>|<\/h\d>/gi,'\n').replace(/<[^>]+>/g,' ')).replace(/[\t\r]+/g,' ').replace(/ +/g,' ').replace(/\n +/g,'\n');
async function fetchText(url,timeout=12000){const c=new AbortController();const t=setTimeout(()=>c.abort(),timeout);try{const r=await fetch(url,{headers:UA,signal:c.signal,cache:'no-store',redirect:'follow'});if(!r.ok)throw new Error(`HTTP ${r.status}`);return await r.text()}finally{clearTimeout(t)}}
const waitEvidence=(o)=>({source:o.source,label:o.label,value:o.waitMin,waitMin:o.waitMin,estimateType:o.estimateType||'exact',note:o.note||null,updatedAt:o.updatedAt||null,ageMin:o.ageMin??null,sourceUrl:o.sourceUrl,official:true,countryCode:o.countryCode,direction:o.direction,aliases:o.aliases||[]});
function hoursToMin(v){v=String(v||'').trim().replace(',','.');if(/^\d+:\d\d$/.test(v)){const [h,m]=v.split(':').map(Number);return h*60+m}const n=Number(v);return Number.isFinite(n)?Math.round(n*60):null}
function parsePL(text,direction){if(direction!=='EU_UA')return[];const t=htmlText(text);const names=['Zosin','Dołhobyczów','Hrebenne','Budomierz','Korczowa','Medyka','Malhowice','Krościenko'];const aliases={Zosin:['устилуг','зосин'],Dołhobyczów:['угринів','долгобичув'],Hrebenne:['рава руська','гребенне'],Budomierz:['грушів','будомєж'],Korczowa:['краківець','корчова'],Medyka:['шегині','медика'],Malhowice:['нижankовичі','мальховичі','nyzhankovychi','malhowice'],Krościenko:['смільниця','кросценко']};const display={Zosin:'Устилуг - Зосин',Dołhobyczów:'Угринів - Долгобичув',Hrebenne:'Рава-Руська - Гребенне',Budomierz:'Грушів - Будомєж',Korczowa:'Краківець - Корчова',Medyka:'Шегині - Медика',Malhowice:'Нижанковичі - Мальховичі',Krościenko:'Смільниця - Кросценко'};
  const carStart=t.search(/CARS\s+Estimated waiting time/i);const upd=t.search(/Time of the update/i);if(carStart<0||upd<0||upd<=carStart)return[];const row=t.slice(carStart,upd);const vals=[...row.matchAll(/\b(\d{1,2}:\d{2}|\d+(?:[.,]\d+)?)\b/g)].map(m=>m[1]);let carVals=vals.filter((v,i)=>i>=0);if(carVals.length>8)carVals=carVals.slice(-8);if(carVals.length<8)return[];const date=(t.match(/Data from\s*:\s*(\d{4}-\d{1,2}-\d{1,2})/i)||[])[1]||null;const timesPart=t.slice(upd,upd+700);const times=[...timesPart.matchAll(/\b([01]?\d|2[0-3]):[0-5]\d\b/g)].map(m=>m[0]);const alignedTimes=times.length>=9?times.slice(-9).slice(1):times.slice(-8);
  return names.map((name,i)=>waitEvidence({source:'official_pl',label:'Офіційний PL',countryCode:'PL',direction,aliases:[name,...aliases[name]],waitMin:hoursToMin(carVals[i]),updatedAt:date&&alignedTimes[i]?`${date} ${alignedTimes[i]} Europe/Warsaw`:null,sourceUrl:OFFICIAL_URLS.PL,note:`${display[name]} · виїзд з Польщі`})).filter(x=>x.waitMin!=null)
}
function section(text,startNames,allNames){let start=-1,matched='';for(const n of startNames){const i=text.indexOf(n);if(i>=0&&(start<0||i<start)){start=i;matched=n}}if(start<0)return'';let end=text.length;for(const n of allNames){const i=text.indexOf(n,start+matched.length);if(i>start&&i<end)end=i}return text.slice(start,end)}
function parseSK(text,direction){const t=htmlText(text);const defs=[{names:['HP Vyšné Nemecké','Vyšné Nemecké'],display:'Ужгород - Вишнє Немецьке',aliases:['ужгород','вишнє немецьке','vysne nemecke']},{names:['HP Ubľa','Ubľa'],display:'Малий Березний - Убля',aliases:['малий березний','убля','ubla']}];const all=defs.flatMap(d=>d.names);const out=[];for(const d of defs){const b=section(t,d.names,all);if(!b)continue;const nums=[...b.matchAll(/(\d+)\s*min\.?/gi)].map(m=>Number(m[1]));let entry=null,exit=null;if(nums.length>=4){entry=nums[1];exit=nums[3]}else if(nums.length>=2){entry=nums[0];exit=nums[1]}const upd=(b.match(/(\d{1,2}\.\s*\d{1,2}\.\s*\d{4}\s+\d{1,2}:\d{2}:\d{2})/)||[])[1]||null;const waitMin=direction==='UA_EU'?entry:exit;if(waitMin!=null)out.push(waitEvidence({source:'official_sk',label:'Офіційний SK',countryCode:'SK',direction,aliases:d.aliases,waitMin,updatedAt:upd,sourceUrl:OFFICIAL_URLS.SK,note:d.display}))}return out}
function huWait(part){if(!part)return null;if(/Nincs\s+15\s+percet\s+meghaladó\s+várakozás/i.test(part))return{waitMin:15,estimateType:'upper_bound',note:'≤15 хв'};const m=part.match(/(\d+)\s*(?:perc|min)/i);if(m)return{waitMin:Number(m[1]),estimateType:'exact',note:null};return null}
function parseHU(text,direction){const t=htmlText(text);const defs=[
  {head:'Barabás - Koson',display:'Косино - Барабаш',aliases:['косино','барабаш','barabas','koson']},
  {head:'Beregsurány',display:'Астей - Берегшурань',aliases:['астей','берегшурань','beregsurany']},
  {head:'Lónya',display:'Дзвінкове - Лонья',aliases:['дзвінкове','лонья','lonya']},
  {head:'Nagyhódos',display:'Велика Паладь - Надьгодош',aliases:['велика паладь','надьгодош','nagyhodos']},
  {head:'Tiszabecs',display:'Вилок - Тисабеч',aliases:['вилок','тисабеч','tiszabecs']},
  {head:'Záhony',display:'Чоп - Захонь',aliases:['чоп','захонь','zahony']}
];const heads=defs.map(d=>d.head);const out=[];for(const d of defs){const b=section(t,[d.head],heads);if(!b)continue;const marker=direction==='EU_UA'?'Várakozási idő Magyarország felől (ki):':'Várakozási idő Magyarország felé (be):';const alt=direction==='EU_UA'?'Várakozási idő Magyarország felé (be):':'Forgalom típusa:';const i=b.indexOf(marker);if(i<0)continue;const j=b.indexOf(alt,i+marker.length);const w=huWait(b.slice(i+marker.length,j>i?j:undefined));if(w)out.push(waitEvidence({source:'official_hu',label:'Офіційний HU',countryCode:'HU',direction,aliases:d.aliases,waitMin:w.waitMin,estimateType:w.estimateType,sourceUrl:OFFICIAL_URLS.HU,note:`${d.display}${w.note?` · ${w.note}`:''}`}))}return out}
function parseRO(text,direction){const t=htmlText(text);const defs=[
  {name:'Siret',display:'Порубне - Сірет',aliases:['порубне','сірет','siret']},
  {name:'Sighetu Marmației',display:'Солотвино - Сігету-Мармацієй',aliases:['солотвино','сігету','sighetu']},
  {name:'Halmeu',display:'Дякове - Халмеу',aliases:['дякове','халмеу','halmeu']},
  {name:'Vicovu de Sus',display:'Красноїльськ - Вікову-де-Сус',aliases:['красноїльськ','вікову','vicovu']}
];const out=[];for(const d of defs){const i=t.indexOf(d.name);if(i<0)continue;const s=t.slice(i,i+280);const m=s.match(/Timp de așteptare\s*(\d+)\s*min/i);if(!m)continue;out.push(waitEvidence({source:'official_ro',label:'Офіційний RO',countryCode:'RO',direction,aliases:d.aliases,waitMin:Number(m[1]),sourceUrl:direction==='UA_EU'?OFFICIAL_URLS.RO_IN:OFFICIAL_URLS.RO_OUT,note:d.display}))}return out}
export async function fetchOfficial(direction){const tasks=[
  ['PL',OFFICIAL_URLS.PL,parsePL],['SK',OFFICIAL_URLS.SK,parseSK],['HU',OFFICIAL_URLS.HU,parseHU],['RO',direction==='UA_EU'?OFFICIAL_URLS.RO_IN:OFFICIAL_URLS.RO_OUT,parseRO]
].map(async([code,url,parser])=>{try{const html=await fetchText(url);const items=parser(html,direction);return{code,status:'connected',count:items.length,items}}catch(e){return{code,status:'error',count:0,items:[],error:String(e?.message||e)}}});const results=await Promise.all(tasks);return{items:results.flatMap(x=>x.items),status:Object.fromEntries(results.map(x=>[x.code,{status:x.status,count:x.count,error:x.error||null}]))}}
export function cameraFor(row){const key=clean(`${row?.name||''} ${(row?.sources||[]).map(x=>x.note||'').join(' ')}`);const c=CAMERA_MAP.find(x=>x.countryCode===row?.countryCode&&x.aliases.some(a=>key.includes(clean(a))));return c?{label:c.label,url:c.url,kind:c.kind}:null}
export const officialUrls=OFFICIAL_URLS;
