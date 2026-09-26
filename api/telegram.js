const UA={
  'User-Agent':'Mozilla/5.0 (compatible; BorderMonitorUA/1.0; +https://border-monitor-ua.onrender.com)',
  'Accept':'text/html,application/xhtml+xml'
};

const TTL_MS=5*60*1000;
const MAX_AGE_MIN=180;
const FETCH_TIMEOUT_MS=7000;
const CONCURRENCY=10;
let cache={ts:0,payload:null};
let refreshPromise=null;

const CHAT_SOURCES=[
  // Poland
  {username:'Krakivets',label:'Краківець - Корчова',checkpoint:'Краківець - Корчова',country:'Польща',countryCode:'PL',aliases:['краківець','краковець','корчова','korczowa']},
  {username:'shegunimeduka',label:'Шегині - Медика',checkpoint:'Шегині - Медика',country:'Польща',countryCode:'PL',aliases:['шегині','медика','medyka']},
  {username:'rawahrebenne',label:'Рава-Руська - Гребенне',checkpoint:'Рава-Руська - Гребенне',country:'Польща',countryCode:'PL',aliases:['рава руська','рава-руська','гребенне','hrebenne']},
  {username:'ustylug',label:'Устилуг - Зосин',checkpoint:'Устилуг - Зосин',country:'Польща',countryCode:'PL',aliases:['устилуг','зосин','zosin']},
  {username:'ugryniv',label:'Угринів - Долгобичув',checkpoint:'Угринів - Долгобичув',country:'Польща',countryCode:'PL',aliases:['угринів','долгобичув','dolhobyczow','dołhobyczów']},
  {username:'hryshiv',label:'Грушів - Будоміж',checkpoint:'Грушів - Будоміж',country:'Польща',countryCode:'PL',aliases:['грушів','будоміж','будомєж','budomierz']},
  {username:'yagodyn',label:'Ягодин - Дорогуск',checkpoint:'Ягодин - Дорогуск',country:'Польща',countryCode:'PL',aliases:['ягодин','дорогуск','dorohusk']},
  {username:'smilnutsa',label:'Смільниця - Кросценко',checkpoint:'Смільниця - Кросценко',country:'Польща',countryCode:'PL',aliases:['смільниця','кросценко','kroscienko','krościenko']},
  {username:'nyzhankovychi',label:'Нижанковичі - Мальховичі',checkpoint:'Нижанковичі - Мальховичі',country:'Польща',countryCode:'PL',aliases:['нижankовичі','нижankovychi','нижанковичі','мальховичі','malhowice']},
  // Slovakia
  {username:'maluibereznui',label:'Малий Березний - Убля',checkpoint:'Малий Березний - Убля',country:'Словаччина',countryCode:'SK',aliases:['малий березний','убля','ubla','ubľa']},
  {username:'uzhorodqueue',label:'Ужгород - Вишнє Нємецьке',checkpoint:'Ужгород - Вишнє Нємецьке',country:'Словаччина',countryCode:'SK',aliases:['ужгород','вишнє немецьке','вишнє нємецьке','vysne nemecke','vyšné nemecké']},
  {username:'MaliSelmentsi',label:'Малі Селменці - Вельке Слеменце',checkpoint:'Малі Селменці - Вельке Слеменце',country:'Словаччина',countryCode:'SK',aliases:['малі селменці','вельке слеменце','velke slemence','veľké slemence']},
  // Romania
  {username:'parubne',label:'Порубне - Сірет',checkpoint:'Порубне - Сірет',country:'Румунія',countryCode:'RO',aliases:['порубне','сірет','сирет','siret']},
  {username:'solotkino',label:'Солотвино - Сігету Мармацієй',checkpoint:'Солотвино - Сігету Мармацієй',country:'Румунія',countryCode:'RO',aliases:['солотвино','сігету','сигету','sighetu']},
  {username:'diakove',label:'Дякове - Халмеу',checkpoint:'Дякове - Халмеу',country:'Румунія',countryCode:'RO',aliases:['дякове','халмеу','halmeu']},
  {username:'diakivchi',label:'Дяківці - Раковець',checkpoint:'Дяківці - Раковець',country:'Румунія',countryCode:'RO',aliases:['дяківці','раковець','racovat','racovăț']},
  {username:'krasnoyilsk',label:'Красноїльськ - Вікову де Сус',checkpoint:'Красноїльськ - Вікову де Сус',country:'Румунія',countryCode:'RO',aliases:['красноїльськ','красноільськ','вікову','vicovu']},
  {username:'bilacerkvasigetumarmatiei',label:'Біла Церква - Сігету-Мармацієй',checkpoint:'Біла Церква - Сігету-Мармацієй',country:'Румунія',countryCode:'RO',aliases:['біла церква','сігету','сигету','sighetu']},
  // Hungary
  {username:'lugankabereg',label:'Лужанка - Берегшурань',checkpoint:'Лужанка - Берегшурань',country:'Угорщина',countryCode:'HU',aliases:['лужанка','берегшурань','beregsurany','beregsurány','астей']},
  {username:'chopzahon',label:'Чоп (Тиса) - Захонь',checkpoint:'Чоп (Тиса) - Захонь',country:'Угорщина',countryCode:'HU',aliases:['чоп','тиса','захонь','zahony','záhony']},
  {username:'viloktisabech',label:'Вилок - Тісабеч',checkpoint:'Вилок - Тісабеч',country:'Угорщина',countryCode:'HU',aliases:['вилок','тісабеч','тисабеч','tiszabecs','vilok']},
  {username:'dzvinkovelonya',label:'Дзвінкове - Лонья',checkpoint:'Дзвінкове - Лонья',country:'Угорщина',countryCode:'HU',aliases:['дзвінкове','лонья','lonya','lónya','dzvinkove']},
  {username:'kosunopunkt',label:'Косино - Барабаш',checkpoint:'Косино - Барабаш',country:'Угорщина',countryCode:'HU',aliases:['косино','барабаш','barabas','barabás','koson']},
  // Moldova
  {username:'Mohylivcheckpoint',label:'Могилів-Подільський - Отачь',checkpoint:'Могилів-Подільський - Отачь',country:'Молдова',countryCode:'MD',aliases:['могилів подільський','могилев подольский','отач','отачь','otaci']},
  {username:'palankaudobne',label:'Маяки-Удобне - Паланка',checkpoint:'Маяки-Удобне - Паланка',country:'Молдова',countryCode:'MD',aliases:['маяки','удобне','паланка','palanca']},
  {username:'Rossoshany',label:'Россошани - Бричани',checkpoint:'Россошани - Бричани',country:'Молдова',countryCode:'MD',aliases:['россошани','росошани','бричани','briceni']},
  {username:'Mamalyhacheckpoint',label:'Мамалига - Крива',checkpoint:'Мамалига - Крива',country:'Молдова',countryCode:'MD',aliases:['мамалига','крива','crivă','criva']},
  {username:'sokiryany',label:'Сокиряни - Окниця',checkpoint:'Сокиряни - Окниця',country:'Молдова',countryCode:'MD',aliases:['сокиряни','окниця','ocnița','ocnita']},
  {username:'Bronnitsacheckpoint',label:'Бронниця - Унгурь',checkpoint:'Бронниця - Унгурь',country:'Молдова',countryCode:'MD',aliases:['бронниця','унгурь','unguri']}
].map(x=>({...x,kind:'checkpoint_chat',channelUrl:`https://t.me/${x.username}`}));

const GENERAL_SOURCES=[
  {username:'ukrainianattheborder',label:'Українці на кордоні',kind:'general',channelUrl:'https://t.me/ukrainianattheborder'},
  {username:'zahidwtf_official',label:'ZAHIDWTF 24/7',kind:'general',channelUrl:'https://t.me/zahidwtf_official'},
  {username:'uzhgorod_21',label:'21 Ужгород',kind:'general',channelUrl:'https://t.me/uzhgorod_21'},
  {username:'UADrivers',label:'Водії України',kind:'general',channelUrl:'https://t.me/UADrivers'}
];

const SOURCES=[...CHAT_SOURCES,...GENERAL_SOURCES];
const CHECKPOINTS=CHAT_SOURCES.map(({checkpoint,country,countryCode,aliases})=>({checkpoint,country,countryCode,aliases}));

function decode(v){return String(v||'')
  .replace(/&#x([0-9a-f]+);/gi,(_,h)=>String.fromCodePoint(parseInt(h,16)))
  .replace(/&#(\d+);/g,(_,d)=>String.fromCodePoint(Number(d)))
  .replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"')
  .replace(/&#39;|&apos;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>')}

function textFromHtml(html){return decode(String(html||'')
  .replace(/<br\s*\/?>/gi,'\n').replace(/<\/p>|<\/div>|<\/li>|<\/span>/gi,'\n')
  .replace(/<[^>]+>/g,' ')).replace(/\r/g,'').replace(/[ \t]+/g,' ')
  .replace(/\n +/g,'\n').replace(/\n{3,}/g,'\n\n').trim()}

function clean(v){return String(v||'').toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'').replace(/[–—-]/g,' ')
  .replace(/[^\p{L}\p{N}]+/gu,' ').trim()}

function findCheckpoint(text){const key=clean(text);let best=null;for(const cp of CHECKPOINTS){for(const alias of cp.aliases||[]){const a=clean(alias);if(a&&key.includes(a)&&(!best||a.length>best.aliasLen))best={...cp,aliasLen:a.length}}}if(!best)return null;delete best.aliasLen;return best}

function inferDirection(text){const t=clean(text);if(!t)return null;
  const uaEu=[
    /виїзд з україни/,/виїзд із україни/,/з україни/,/из украины/,/выезд из украины/,
    /до польщі|до словаччини|до угорщини|до румунії|до молдови/,
    /на польщу|на словаччину|на угорщину|на румунію|на молдову/,
    /в польщу|в словаччину|в угорщину|в румунію|в молдову/,
    /в польшу|в словакию|в венгрию|в румынию|в молдову/,
    /у бік польщі|у бік словаччини|у бік угорщини|у бік румунії|у бік молдови/,
    /в сторону польши|в сторону словакии|в сторону венгрии|в сторону румынии|в сторону молдовы/
  ];
  const euUa=[
    /в їзд в україну/,/в їзд до україни/,/вїзд в україну/,/в їзд на україну/,
    /в україну/,/до україни/,/на україну/,/в украину/,/на украину/,/въезд в украину/,
    /з польщі|зі словаччини|з угорщини|з румунії|з молдови/,
    /из польши|из словакии|из венгрии|из румынии|из молдовы/
  ];
  const a=uaEu.some(r=>r.test(t)),b=euUa.some(r=>r.test(t));
  if(a===b)return null;return a?'UA_EU':'EU_UA'}

function parseWaitMin(text){const t=String(text||'').toLowerCase();let m=t.match(/(\d{1,2})\s*(?:год(?:ина|ини|ин)?|час(?:а|ов)?|h)\s*(?:(\d{1,2})\s*(?:хв(?:илин[аи]?|илини)?|мин(?:ут[ыа]?)?|min))?/i);if(m)return Number(m[1])*60+Number(m[2]||0);m=t.match(/(?:очікуван\w*|чекал\w*|стоял\w*|пройшл\w*|проход\w*|перетнул\w*|черга\w*|очеред\w*)[^\n]{0,50}?(\d{1,3})\s*(?:хв(?:илин[аи]?|илини)?|мин(?:ут[ыа]?)?|min)\b/i);if(m)return Number(m[1]);m=t.match(/(?:очікуван\w*|чекал\w*|стоял\w*|пройшл\w*|проход\w*|перетнул\w*|черга\w*|очеред\w*)[^\n]{0,35}?(\d{1,2})[:.](\d{2})\b/i);if(m)return Number(m[1])*60+Number(m[2]);return null}

function parseQueueCars(text){const m=String(text||'').match(/\b(\d{1,4})\s*(?:авто|автомобіл\w*|машин\w*|машины|машина|т\/?з|тз)\b/i);return m?Number(m[1]):null}

function extractReply(chunk){const m=String(chunk||'').match(/<a[^>]*class="[^"]*tgme_widget_message_reply[^"]*"[^>]*>([\s\S]*?)<\/a>/i);return m?textFromHtml(m[1]):''}
function extractBody(chunk){const matches=[...String(chunk||'').matchAll(/<div[^>]*class="[^"]*tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/gi)];if(matches.length)return textFromHtml(matches[matches.length-1][1]);const fallback=String(chunk||'').match(/tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/i);return fallback?textFromHtml(fallback[1]):''}
function signalLike(text){return /черг|очеред|кордон|границ|кпп|пункт пропуск|авто|машин|територ|зелени|червон|проїх|проех|пройш|прошл|стої|стоим|стою|чека|жду|очіку/i.test(String(text||''))}

function parseTelegramHtml(html,source){const chunks=String(html||'').split(/tgme_widget_message_wrap/gi).slice(1);const out=[];for(const chunk of chunks){const post=(chunk.match(/data-post="([^"]+)"/i)||[])[1];const dt=(chunk.match(/<time[^>]+datetime="([^"]+)"/i)||[])[1];const text=extractBody(chunk);if(!post||!dt||!text)continue;const replyText=extractReply(chunk);const wholeContext=textFromHtml(chunk);const cp=source.kind==='checkpoint_chat'?source:findCheckpoint(`${text}\n${replyText}\n${wholeContext}`);if(!cp)continue;
    let direction=inferDirection(text),directionBasis=direction?'message':null;
    if(!direction&&replyText){direction=inferDirection(replyText);if(direction)directionBasis='reply'}
    if(!direction){direction=inferDirection(wholeContext);if(direction)directionBasis='context'}
    if(!direction)continue;
    const ts=Date.parse(dt);if(!Number.isFinite(ts))continue;const ageMin=Math.max(0,Math.round((Date.now()-ts)/60000));if(ageMin>MAX_AGE_MIN)continue;
    const waitMin=parseWaitMin(text);const queueCars=parseQueueCars(text);if(waitMin==null&&queueCars==null&&!signalLike(text))continue;
    const excerpt=text.replace(/\s+/g,' ').slice(0,260);const replyExcerpt=replyText.replace(/\s+/g,' ').slice(0,180);
    out.push({checkpoint:cp.checkpoint,country:cp.country,country_code:cp.countryCode,direction,wait_min:waitMin,queue_cars:queueCars,updated_at:new Date(ts).toISOString(),age_min:ageMin,note:excerpt,reply_context:replyExcerpt||null,direction_basis:directionBasis,source_label:source.label,source_url:`https://t.me/${post}`,source_channel:source.username,channel_url:source.channelUrl||`https://t.me/${source.username}`,source_kind:source.kind,kind:'human_report'})}
  return{items:out,previewMessages:chunks.length}}

async function fetchSource(source){const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),FETCH_TIMEOUT_MS);try{const r=await fetch(`https://t.me/s/${encodeURIComponent(source.username)}`,{headers:UA,signal:ctl.signal,redirect:'follow',cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);const html=await r.text();const parsed=parseTelegramHtml(html,source);return{source,items:parsed.items,previewMessages:parsed.previewMessages,status:'connected'}}catch(e){return{source,items:[],previewMessages:0,status:'error',error:String(e?.message||e)}}finally{clearTimeout(timer)}}

async function fetchInBatches(sources){const out=[];for(let i=0;i<sources.length;i+=CONCURRENCY){const batch=await Promise.all(sources.slice(i,i+CONCURRENCY).map(fetchSource));out.push(...batch)}return out}
function dedupe(items){const seen=new Set();return items.sort((a,b)=>(a.age_min??9999)-(b.age_min??9999)).filter(x=>{const k=[x.source_channel,x.source_url,x.checkpoint,x.direction].join('|');if(seen.has(k))return false;seen.add(k);return true})}

async function refresh(){const results=await fetchInBatches(SOURCES);const items=dedupe(results.flatMap(x=>x.items));const payload={ok:true,generatedAt:new Date().toISOString(),cacheMinutes:5,maxAgeMinutes:MAX_AGE_MIN,items,sources:results.map(x=>({channel:x.source.username,channelUrl:x.source.channelUrl||`https://t.me/${x.source.username}`,label:x.source.label,kind:x.source.kind,checkpoint:x.source.checkpoint||null,country:x.source.country||null,countryCode:x.source.countryCode||null,aliases:x.source.aliases||[],status:x.status,items:x.items.length,previewMessages:x.previewMessages||0,error:x.error||null}))};cache={ts:Date.now(),payload};const connected=payload.sources.filter(x=>x.status==='connected').length;console.log('[telegram-snapshot]',JSON.stringify({sources:payload.sources.length,connected,items:items.length,checkpointChats:CHAT_SOURCES.length}));return payload}

export async function getTelegramSnapshot(){if(cache.payload&&Date.now()-cache.ts<TTL_MS)return{...cache.payload,fromCache:true};if(!refreshPromise)refreshPromise=refresh().finally(()=>{refreshPromise=null});const payload=await refreshPromise;return{...payload,fromCache:false}}

export default async function handler(req,res){if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});const expected=process.env.TELEGRAM_READER_TOKEN;if(expected){const auth=String(req.headers?.authorization||'');if(auth!==`Bearer ${expected}`)return res.status(401).json({ok:false,error:'unauthorized'})}const payload=await getTelegramSnapshot();return res.status(200).json(payload)}
