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
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const decode=s=>String(s||'')
  .replace(/&#x([0-9a-f]+);/gi,(_,h)=>String.fromCodePoint(parseInt(h,16)))
  .replace(/&#(\d+);/g,(_,d)=>String.fromCodePoint(Number(d)))
  .replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>');
const htmlText=html=>decode(String(html||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<br\s*\/?>/gi,'\n').replace(/<\/p>|<\/tr>|<\/li>|<\/h\d>/gi,'\n').replace(/<[^>]+>/g,' ')).replace(/[\t\r]+/g,' ').replace(/ +/g,' ').replace(/\n +/g,'\n').trim();
async function fetchText(url,timeout=15000,retries=2){let last;for(let attempt=0;attempt<=retries;attempt++){const c=new AbortController();const t=setTimeout(()=>c.abort(),timeout);try{const r=await fetch(url,{headers:UA,signal:c.signal,cache:'no-store',redirect:'follow'});if(!r.ok)throw new Error(`HTTP ${r.status}`);return await r.text()}catch(e){last=e;if(attempt<retries)await sleep(400*(attempt+1))}finally{clearTimeout(t)}}throw last}
const waitEvidence=(o)=>({source:o.source,label:o.label,value:o.waitMin,waitMin:o.waitMin,estimateType:o.estimateType||'exact',note:o.note||null,updatedAt:o.updatedAt||null,ageMin:o.ageMin??null,sourceUrl:o.sourceUrl,official:true,countryCode:o.countryCode,direction:o.direction,aliases:o.aliases||[]});
function hoursToMin(v){v=String(v||'').trim().replace(',','.').replace(/[≤<>]/g,'');if(!v)return null;if(/^\d{1,2}:\d{2}$/.test(v)){const [h,m]=v.split(':').map(Number);return h*60+m}const x=v.match(/\d+(?:\.\d+)?/);const num=x?Number(x[0]):NaN;return Number.isFinite(num)?Math.round(num*60):null}
function rowCells(rawRow){return[...String(rawRow||'').matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)].map(m=>htmlText(m[1]))}
function tableRows(raw){return[...String(raw||'').matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(m=>m[1])}
function parsePL(raw,direction){if(direction!=='EU_UA')return[];const rows=tableRows(raw);const carRow=rows.find(r=>/picture\s*CARS|\bCARS\b/i.test(decode(r)));if(!carRow)return[];const cells=rowCells(carRow);const values=cells.slice(-9);if(values.length<9)return[];const date=(htmlText(raw).match(/Data from\s*:\s*(\d{4}-\d{1,2}-\d{1,2})/i)||[])[1]||null;const updateRow=rows.find(r=>/Time of the update/i.test(htmlText(r)));const updateCells=updateRow?rowCells(updateRow).slice(-9):[];
  const defs=[
    {i:1,display:'Устилуг - Зосин',aliases:['zosin','устилуг','зосин']},
    {i:2,display:'Угринів - Долгобичув',aliases:['dołhobyczów','dolhobyczow','угринів','долгобичув']},
    {i:3,display:'Рава-Руська - Гребенне',aliases:['hrebenne','рава руська','гребенне']},
    {i:4,display:'Грушів - Будомєж',aliases:['budomierz','грушів','будомєж']},
    {i:5,display:'Краківець - Корчова',aliases:['korczowa','краківець','корчова']},
    {i:6,display:'Шегині - Медика',aliases:['medyka','шегині','медика']},
    {i:7,display:'Нижанковичі - Мальховичі',aliases:['malhowice','nyzhankovychi','мальховичі']},
    {i:8,display:'Смільниця - Кросценко',aliases:['krościenko','kroscienko','смільниця','кросценко']}
  ];
  return defs.map(d=>{const waitMin=hoursToMin(values[d.i]);if(waitMin==null)return null;const tm=updateCells[d.i]||null;return waitEvidence({source:'official_pl',label:'Офіційний PL',countryCode:'PL',direction,aliases:d.aliases,waitMin,updatedAt:date&&tm?`${date} ${tm} Europe/Warsaw`:null,sourceUrl:OFFICIAL_URLS.PL,note:`${d.display} · виїзд з Польщі`})}).filter(Boolean)
}
function minutesCell(v){const m=String(v||'').match(/(\d+)\s*min\.?/i);return m?Number(m[1]):null}
function parseSK(raw,direction){const rows=tableRows(raw);const defs=[{match:/HP\s*Vyšné\s*Nemecké/i,display:'Ужгород - Вишнє Немецьке',aliases:['ужгород','вишнє немецьке','vysne nemecke','vyšne nemecke']},{match:/HP\s*Ubľa/i,display:'Малий Березний - Убля',aliases:['малий березний','убля','ubla']}];const out=[];for(const d of defs){const row=rows.find(r=>d.match.test(htmlText(r)));if(!row)continue;const c=rowCells(row);if(c.length<6)continue;const entry=minutesCell(c[2]);const exit=minutesCell(c[5]);const waitMin=direction==='UA_EU'?entry:exit;if(waitMin==null)continue;const updatedAt=c[c.length-1]||null;out.push(waitEvidence({source:'official_sk',label:'Офіційний SK',countryCode:'SK',direction,aliases:d.aliases,waitMin,updatedAt,sourceUrl:OFFICIAL_URLS.SK,note:d.display}))}return out}
function section(text,startNames,allNames){let start=-1,matched='';for(const n of startNames){const i=text.indexOf(n);if(i>=0&&(start<0||i<start)){start=i;matched=n}}if(start<0)return'';let end=text.length;for(const n of allNames){const i=text.indexOf(n,start+matched.length);if(i>start&&i<end)end=i}return text.slice(start,end)}
function huWait(part){if(!part)return null;if(/Nincs\s+15\s+percet\s+meghaladó\s+várakozás/i.test(part))return{waitMin:15,estimateType:'upper_bound',note:'≤15 хв'};const m=part.match(/(\d+)\s*(?:perc|min)/i);if(m)return{waitMin:Number(m[1]),estimateType:'exact',note:null};return null}
function parseHU(raw,direction){const t=htmlText(raw);const defs=[
  {heads:['Barabás - Koson','Barabás - Koson’'],display:'Косино - Барабаш',aliases:['косино','барабаш','barabas','koson']},
  {heads:['Beregsurány - Астей','Beregsurány'],display:'Астей - Берегшурань',aliases:['астей','берегшурань','beregsurany']},
  {heads:['Lónya - Dzvinkove','Lónya'],display:'Дзвінкове - Лонья',aliases:['дзвінкове','лонья','lonya','dzvinkove']},
  {heads:['Nagyhódos–Nagypalád','Nagyhódos-Nagypalád','Nagyhódos'],display:'Велика Паладь - Надьгодош',aliases:['велика паладь','надьгодош','nagyhodos','nagypalad']},
  {heads:['Tiszabecs - Vilok','Tiszabecs'],display:'Вилок - Тисабеч',aliases:['вилок','тисабеч','tiszabecs','vilok']},
  {heads:['Záhony - Čop','Záhony'],display:'Чоп - Захонь',aliases:['чоп','захонь','zahony','cop']}
];const all=defs.flatMap(d=>d.heads);const out=[];for(const d of defs){const b=section(t,d.heads,all);if(!b)continue;const marker=direction==='EU_UA'?'Várakozási idő Magyarország felől (ki):':'Várakozási idő Magyarország felé (be):';const opposite=direction==='EU_UA'?'Várakozási idő Magyarország felé (be):':'Forgalom típusa:';const i=b.indexOf(marker);if(i<0)continue;const j=b.indexOf(opposite,i+marker.length);const w=huWait(b.slice(i+marker.length,j>i?j:undefined));if(w)out.push(waitEvidence({source:'official_hu',label:'Офіційний HU',countryCode:'HU',direction,aliases:d.aliases,waitMin:w.waitMin,estimateType:w.estimateType,sourceUrl:OFFICIAL_URLS.HU,note:`${d.display}${w.note?` · ${w.note}`:''}`}))}return out}
function parseRO(raw,direction){const t=htmlText(raw);const defs=[
  {name:'Siret',display:'Порубне - Сірет',aliases:['порубне','сірет','siret']},
  {name:'Sighetu Marmației',display:'Солотвино - Сігету-Мармацієй',aliases:['солотвино','сігету','sighetu']},
  {name:'Halmeu',display:'Дякове - Халмеу',aliases:['дякове','халмеу','halmeu']},
  {name:'Vicovu de Sus',display:'Красноїльськ - Вікову-де-Сус',aliases:['красноїльськ','вікову','vicovu']}
];const out=[];for(const d of defs){const i=t.indexOf(d.name);if(i<0)continue;const s=t.slice(i,i+320);const m=s.match(/Timp de așteptare\s*(\d+)\s*min/i);if(!m)continue;out.push(waitEvidence({source:'official_ro',label:'Офіційний RO',countryCode:'RO',direction,aliases:d.aliases,waitMin:Number(m[1]),sourceUrl:direction==='UA_EU'?OFFICIAL_URLS.RO_IN:OFFICIAL_URLS.RO_OUT,note:d.display}))}return out}
export async function fetchOfficial(direction){const specs=[
  ['PL',OFFICIAL_URLS.PL,parsePL],['SK',OFFICIAL_URLS.SK,parseSK],['HU',OFFICIAL_URLS.HU,parseHU],['RO',direction==='UA_EU'?OFFICIAL_URLS.RO_IN:OFFICIAL_URLS.RO_OUT,parseRO]
];const tasks=specs.map(async([code,url,parser])=>{if(code==='PL'&&direction==='UA_EU')return{code,status:'not_applicable',count:0,items:[],error:null};try{const html=await fetchText(url);const items=parser(html,direction);return{code,status:'connected',count:items.length,items}}catch(e){return{code,status:'error',count:0,items:[],error:String(e?.message||e)}}});const results=await Promise.all(tasks);return{items:results.flatMap(x=>x.items),status:Object.fromEntries(results.map(x=>[x.code,{status:x.status,count:x.count,error:x.error||null}]))}}
export function cameraFor(row){const key=clean(`${row?.name||''} ${(row?.sources||[]).map(x=>x.note||'').join(' ')}`);const c=CAMERA_MAP.find(x=>x.countryCode===row?.countryCode&&x.aliases.some(a=>key.includes(clean(a))));return c?{label:c.label,url:c.url,kind:c.kind}:null}
export const officialUrls=OFFICIAL_URLS;
