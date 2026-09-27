const COUNTRY={PL:'🇵🇱 Польща',SK:'🇸🇰 Словаччина',HU:'🇭🇺 Угорщина',RO:'🇷🇴 Румунія',MD:'🇲🇩 Молдова'};
const DOW={1:'понеділок',2:'вівторок',3:'середа',4:'четвер',5:'п’ятниця',6:'субота',7:'неділя'};
const MODEL_URL='https://raw.githubusercontent.com/romanchuk82-ctrl/kiril-projects-dashboard/border-history-data/history-model.json';
const CACHE_KEY='border-history-read-model-v1';
const state={catalog:[],direction:'UA_EU',country:'ALL',crossing:'',days:30,model:null,fromCache:false};
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>Number.isFinite(Number(v))?Number(v):null;

function fmtWait(v){v=num(v);if(v==null)return'—';if(v<60)return`${Math.round(v)} хв`;const h=Math.floor(v/60),m=Math.round(v%60);return m?`${h} год ${m} хв`:`${h} год`}
function fmtDate(value){if(!value)return'—';const d=new Date(value);if(Number.isNaN(d.getTime()))return'—';return new Intl.DateTimeFormat('uk-UA',{timeZone:'Europe/Kyiv',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(d)}
function datasetKey(direction,crossing,days){return`${direction}|${crossing}|${days}`}
function validModel(value){return value&&Array.isArray(value.catalog)&&value.datasets&&typeof value.datasets==='object'}

async function loadModel(){
  try{
    const response=await fetch(`${MODEL_URL}?v=${Date.now()}`,{cache:'no-store',headers:{Accept:'application/json'}});
    if(!response.ok)throw new Error(`model_${response.status}`);
    const fresh=await response.json();
    if(!validModel(fresh))throw new Error('invalid_model');
    state.model=fresh;state.fromCache=false;
    try{localStorage.setItem(CACHE_KEY,JSON.stringify(fresh))}catch{}
    return fresh;
  }catch(error){
    try{
      const cached=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');
      if(validModel(cached)){state.model=cached;state.fromCache=true;return cached}
    }catch{}
    throw error;
  }
}

function visibleCatalog(){return state.catalog.filter(x=>x.direction===state.direction&&(state.country==='ALL'||x.country_code===state.country))}
function updateCountryOptions(){const select=$('#countryFilter'),previous=state.country;const codes=[...new Set(state.catalog.filter(x=>x.direction===state.direction).map(x=>x.country_code).filter(Boolean))].sort();select.innerHTML='<option value="ALL">Усі країни</option>'+codes.map(code=>`<option value="${esc(code)}">${esc(COUNTRY[code]||code)}</option>`).join('');state.country=codes.includes(previous)?previous:'ALL';select.value=state.country}
function updateCrossingOptions(preferred=''){const select=$('#crossingFilter');const rows=visibleCatalog().slice().sort((a,b)=>String(a.country_code||'').localeCompare(String(b.country_code||''),'uk')||String(a.name||'').localeCompare(String(b.name||''),'uk'));if(!rows.length){select.innerHTML='<option value="">Немає даних</option>';state.crossing='';select.disabled=true;return}select.disabled=false;select.innerHTML=rows.map(x=>`<option value="${esc(x.crossing_key)}">${esc(COUNTRY[x.country_code]||x.country_code||'')} · ${esc(x.name)}</option>`).join('');const candidate=rows.find(x=>x.crossing_key===preferred)||rows.find(x=>x.crossing_key===state.crossing)||rows[0];state.crossing=candidate.crossing_key;select.value=state.crossing}
function renderCatalogStatus(){const relevant=state.catalog.filter(x=>x.direction===state.direction);const lastTimes=relevant.map(x=>Date.parse(x.last_at||'')).filter(Number.isFinite);const newest=lastTimes.length?new Date(Math.max(...lastTimes)).toISOString():null;$('#historyStatusBadge').textContent=relevant.length?'ЗБИРАЄМО':'СТАРТ';const cacheNote=state.fromCache?' · резервна локальна копія':'';$('#historyStatusNote').textContent=relevant.length?`В архіві ${relevant.length} КПП для цього напрямку. Останній зріз: ${fmtDate(newest)}${cacheNote}.`:'Перший центральний зріз ще готується.'}
function resetMetrics(){for(const id of ['metricSnapshots','metricAvg','metricMedian','metricP90'])$('#'+id).textContent='—';$('#seriesCount').textContent='0 точок';$('#historyList').innerHTML='<div class="empty">Немає історичних даних для цього фільтра.</div>';$('#recommendations').innerHTML='<div class="recommend-empty">Потрібно накопичити достатньо спостережень.</div>'}
function renderSeries(series){$('#seriesCount').textContent=`${series.length} ${series.length===1?'точка':'точок'}`;const box=$('#historyList');if(!series.length){box.innerHTML='<div class="empty">Історія для цього КПП ще накопичується.</div>';return}const display=series.slice(-72).reverse();const max=Math.max(20,...display.map(r=>num(r.wait_min)||0));box.innerHTML=display.map(r=>{const w=num(r.wait_min),q=num(r.queue_cars),pct=w==null?0:Math.min(100,Math.round(w/max*100));return `<div class="history-row"><div><div class="history-name">${esc(fmtDate(r.bucket_at))}</div><div class="history-meta">${q!=null?`${Math.round(q)} авто`:'авто —'} · ${Number(r.reliable_count||0)>0?'є підтвердження':'оцінка'}</div><div class="bar"><i style="width:${pct}%"></i></div></div><div class="history-wait">${esc(fmtWait(w))}</div></div>`}).join('')}
function renderInsights(insights){const samples=Number(insights?.sampleCount||0);$('#metricSnapshots').textContent=String(samples);$('#metricAvg').textContent=fmtWait(insights?.avgWaitMin);$('#metricMedian').textContent=fmtWait(insights?.medianWaitMin);$('#metricP90').textContent=fmtWait(insights?.p90WaitMin);const box=$('#recommendations');if(samples<48){box.innerHTML=`<div class="recommend-empty">Є ${samples} ${samples===1?'спостереження':'спостережень'} по цьому КПП. Для поради за годинами потрібно приблизно 48 погодинних точок. Поки показуємо історію без передчасних висновків.</div>`;return}const cards=[];if(insights.bestHour!=null&&insights.bestHourAvgWaitMin!=null){const h=String(insights.bestHour).padStart(2,'0');cards.push(`<div class="rec-item good"><b>Найспокійніша година</b><p>Близько <strong>${h}:00</strong> середнє очікування було ${esc(fmtWait(insights.bestHourAvgWaitMin))}.</p></div>`)}if(insights.worstHour!=null&&insights.worstHourAvgWaitMin!=null){const h=String(insights.worstHour).padStart(2,'0');cards.push(`<div class="rec-item warn"><b>Час із більшим навантаженням</b><p>Близько <strong>${h}:00</strong> середнє очікування було ${esc(fmtWait(insights.worstHourAvgWaitMin))}.</p></div>`)}if(samples>=336&&insights.bestIsoDow!=null&&insights.bestDowAvgWaitMin!=null)cards.push(`<div class="rec-item"><b>День тижня</b><p>За накопиченою історією найспокійнішим був <strong>${esc(DOW[insights.bestIsoDow]||String(insights.bestIsoDow))}</strong> · ${esc(fmtWait(insights.bestDowAvgWaitMin))} у середньому.</p></div>`);cards.push(`<div class="rec-item"><b>Наскільки це надійно</b><p>Висновок базується на ${samples} спостереженнях за обраний період. Це статистичний орієнтир, а не гарантія черги в конкретний день.</p></div>`);box.innerHTML=`<div class="recommendation">${cards.join('')}</div>`}

async function loadSelection(){if(!state.crossing||!state.model){resetMetrics();return}const status=$('#loadStatus');status.textContent='Читаю історію КПП…';const item=state.model.datasets[datasetKey(state.direction,state.crossing,state.days)]||{};renderSeries(Array.isArray(item.series)?item.series:[]);renderInsights(item.insights||{});const source=state.fromCache?'локальна резервна копія':'центральний read-model';status.textContent=`Період: ${state.days===365?'1 рік':state.days===730?'2 роки':`${state.days} днів`} · ${source} · модель ${fmtDate(state.model.generatedAt)}`}
async function loadCatalog(){const status=$('#loadStatus');status.textContent='Завантажую центральний архів…';try{const model=await loadModel();state.catalog=model.catalog;updateCountryOptions();updateCrossingOptions();renderCatalogStatus();await loadSelection()}catch(error){console.error(error);state.catalog=[];updateCountryOptions();updateCrossingOptions();resetMetrics();$('#historyStatusBadge').textContent='НЕДОСТУПНО';$('#historyStatusNote').textContent='Історичний read-model тимчасово недоступний.';status.textContent='Live при цьому не змінено і продовжує працювати окремо.'}}

$('#directionFilter').addEventListener('change',async e=>{state.direction=e.target.value==='EU_UA'?'EU_UA':'UA_EU';state.country='ALL';updateCountryOptions();updateCrossingOptions();renderCatalogStatus();await loadSelection()});
$('#countryFilter').addEventListener('change',async e=>{state.country=e.target.value||'ALL';updateCrossingOptions();await loadSelection()});
$('#crossingFilter').addEventListener('change',async e=>{state.crossing=e.target.value||'';await loadSelection()});
$('#periodFilter').addEventListener('change',async e=>{state.days=Math.max(1,Math.min(730,Number(e.target.value)||30));await loadSelection()});
loadCatalog();
