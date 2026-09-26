from pathlib import Path
import re

# Backend: replace trust model with two-level confirmation.
p=Path('api/aggregate.js')
s=p.read_text()
new_backend=r'''function telegramQualitativeSignal(src){
  const q=src?.queueCars!=null&&Number.isFinite(Number(src.queueCars))?Number(src.queueCars):null;
  const text=keyName(src?.note||'');
  const low=/(без черги|нема черги|немає черги|черги нема|черги немає|пусто|вільно|вільний|одразу|відразу|сразу|без очікування)/.test(text);
  const high=/(велика черга|довга черга|черга велика|черга довга|стоимо|стоїмо|чекаємо|ждемо|затор)/.test(text);
  if(low&&!high)return'low';
  if(high&&!low)return'high';
  if(q!=null){if(q<=3)return'low';if(q>=10)return'high';return'mid'}
  return null
}
export function applyTelegramTimeTrust(row){
  const out={...row,sources:[...(row.sources||[])]};
  const baseRaw=out.baseWaitMin!=null?Number(out.baseWaitMin):(out.waitMin!=null?Number(out.waitMin):null);
  const base=Number.isFinite(baseRaw)?Math.max(0,Math.round(baseRaw)):null;
  const fresh=out.sources.filter(src=>src?.source==='telegram'&&src.ageMin!=null&&Number(src.ageMin)>=0&&Number(src.ageMin)<=90);
  const numeric=fresh.filter(src=>src.value!=null&&Number.isFinite(Number(src.value)));
  const vals=numeric.map(src=>Math.max(0,Math.round(Number(src.value)))).sort((a,b)=>a-b);
  const median=vals.length?(vals.length%2?vals[(vals.length-1)/2]:Math.round((vals[vals.length/2-1]+vals[vals.length/2])/2)):null;
  const signals=fresh.map(telegramQualitativeSignal).filter(Boolean);
  const counts={low:signals.filter(x=>x==='low').length,mid:signals.filter(x=>x==='mid').length,high:signals.filter(x=>x==='high').length};
  out.baseWaitMin=base;
  out.telegramWaitMin=median;
  out.telegramTimeReports=vals.length;
  out.telegramFreshReports=fresh.length;
  out.telegramQualitative=counts;
  out.telegramTimeAgeMin=numeric.length?Math.min(...numeric.map(src=>Number(src.ageMin))):null;
  out.timeDeltaMin=base!=null&&median!=null?Math.abs(base-median):null;
  if(base==null){out.timeReliable=false;out.timeReliability='no_time';out.timeReliabilityReason='Немає незалежної базової оцінки часу';return out}
  if(vals.length){
    const spread=vals.length>1?vals[vals.length-1]-vals[0]:0;
    const spreadLimit=Math.max(30,Math.round((median||0)*0.5));
    if(spread>spreadLimit){out.waitMin=base;out.timeReliable=false;out.timeReliability='conflict';out.timeReliabilityReason='Свіжі повідомлення Telegram суперечать одне одному';out.confidence='low';return out}
    const tolerance=Math.max(20,Math.round(base*0.35));
    if(Math.abs(base-median)>tolerance){out.waitMin=base;out.timeReliable=false;out.timeReliability='conflict';out.timeReliabilityReason=`Telegram відрізняється від базового часу на ${Math.abs(base-median)} хв`;out.confidence='low';return out}
    const weight=vals.length>=2?0.45:0.35;
    out.waitMin=Math.max(0,Math.round(base*(1-weight)+median*weight));
    out.timeReliable=true;
    out.timeReliability='confirmed';
    out.timeReliabilityReason=`Telegram прямо підтвердив час (${vals.length} числових повідомлень)`;
    out.confidence='high';
    return out
  }
  let support=0,contradict=0;
  if(base<=20){support=counts.low;contradict=counts.high}
  else if(base>=60){support=counts.high;contradict=counts.low}
  else {support=counts.mid;contradict=(base>=45?counts.low:0)+(base<=35?counts.high:0)}
  if(contradict>0&&support===0){out.waitMin=base;out.timeReliable=false;out.timeReliability='conflict';out.timeReliabilityReason='Telegram описує іншу ситуацію з чергою, ніж базова оцінка';out.confidence='low';return out}
  if(support>=2){out.waitMin=base;out.timeReliable=true;out.timeReliability='supported';out.timeReliabilityReason=`Ситуацію підтверджують ${support} свіжі повідомлення Telegram`;out.confidence='medium';return out}
  out.waitMin=base;
  out.timeReliable=false;
  out.timeReliability='unconfirmed';
  out.timeReliabilityReason=fresh.length?'Telegram є, але недостатньо даних для підтвердження часу':'Немає свіжого підтвердження з Telegram за останні 90 хв';
  out.confidence='low';
  return out
}
function sort(rows)'''
s2,n=re.subn(r'export function applyTelegramTimeTrust\(row\)\{.*?\n\}\nfunction sort\(rows\)',lambda _m:new_backend,s,flags=re.S)
if n!=1: raise SystemExit(f'backend trust replacement count={n}')
p.write_text(s2)

# Frontend: mirror trust logic and make labels/provenance explicit.
p=Path('public/app.js')
s=p.read_text()
new_front=r'''function telegramQualitativeSignal(s){const q=s?.queueCars!=null&&Number.isFinite(Number(s.queueCars))?Number(s.queueCars):null,t=String(s?.note||'').toLowerCase().replace(/[–—-]/g,' ').replace(/[^\p{L}\p{N}]+/gu,' ').trim(),low=/(без черги|нема черги|немає черги|черги нема|черги немає|пусто|вільно|вільний|одразу|відразу|сразу|без очікування)/.test(t),high=/(велика черга|довга черга|черга велика|черга довга|стоимо|стоїмо|чекаємо|ждемо|затор)/.test(t);if(low&&!high)return'low';if(high&&!low)return'high';if(q!=null){if(q<=3)return'low';if(q>=10)return'high';return'mid'}return null}
function recomputeTimeTrust(r){const baseRaw=r.baseWaitMin!=null?Number(r.baseWaitMin):(r.waitMin!=null?Number(r.waitMin):null),base=Number.isFinite(baseRaw)?Math.max(0,Math.round(baseRaw)):null,fresh=(r.sources||[]).filter(s=>s?.source==='telegram'&&s.ageMin!=null&&Number(s.ageMin)>=0&&Number(s.ageMin)<=90),numeric=fresh.filter(s=>s.value!=null&&Number.isFinite(Number(s.value))),vals=numeric.map(s=>Math.max(0,Math.round(Number(s.value)))).sort((a,b)=>a-b),median=vals.length?(vals.length%2?vals[(vals.length-1)/2]:Math.round((vals[vals.length/2-1]+vals[vals.length/2])/2)):null,signals=fresh.map(telegramQualitativeSignal).filter(Boolean),counts={low:signals.filter(x=>x==='low').length,mid:signals.filter(x=>x==='mid').length,high:signals.filter(x=>x==='high').length};r.baseWaitMin=base;r.telegramWaitMin=median;r.telegramTimeReports=vals.length;r.telegramFreshReports=fresh.length;r.telegramQualitative=counts;r.telegramTimeAgeMin=numeric.length?Math.min(...numeric.map(s=>Number(s.ageMin))):null;r.timeDeltaMin=base!=null&&median!=null?Math.abs(base-median):null;if(base==null){r.timeReliable=false;r.timeReliability='no_time';r.timeReliabilityReason='Немає незалежної базової оцінки часу';return r}if(vals.length){const spread=vals.length>1?vals[vals.length-1]-vals[0]:0,spreadLimit=Math.max(30,Math.round((median||0)*.5));if(spread>spreadLimit){r.waitMin=base;r.timeReliable=false;r.timeReliability='conflict';r.timeReliabilityReason='Свіжі повідомлення Telegram суперечать одне одному';return r}const tolerance=Math.max(20,Math.round(base*.35));if(Math.abs(base-median)>tolerance){r.waitMin=base;r.timeReliable=false;r.timeReliability='conflict';r.timeReliabilityReason=`Telegram відрізняється від базового часу на ${Math.abs(base-median)} хв`;return r}const weight=vals.length>=2?.45:.35;r.waitMin=Math.max(0,Math.round(base*(1-weight)+median*weight));r.timeReliable=true;r.timeReliability='confirmed';r.timeReliabilityReason=`Telegram прямо підтвердив час (${vals.length})`;return r}let support=0,contradict=0;if(base<=20){support=counts.low;contradict=counts.high}else if(base>=60){support=counts.high;contradict=counts.low}else{support=counts.mid;contradict=(base>=45?counts.low:0)+(base<=35?counts.high:0)}if(contradict>0&&support===0){r.waitMin=base;r.timeReliable=false;r.timeReliability='conflict';r.timeReliabilityReason='Telegram описує іншу ситуацію з чергою, ніж базова оцінка';return r}if(support>=2){r.waitMin=base;r.timeReliable=true;r.timeReliability='supported';r.timeReliabilityReason=`Ситуацію підтверджують ${support} свіжі повідомлення Telegram`;return r}r.waitMin=base;r.timeReliable=false;r.timeReliability='unconfirmed';r.timeReliabilityReason=fresh.length?'Telegram є, але недостатньо даних для підтвердження часу':'Немає свіжого підтвердження з Telegram за останні 90 хв';return r}
function timeTrustText(r){if(r.timeReliability==='confirmed')return`✅ Telegram підтвердив час${r.telegramWaitMin!=null?` · TG ${fmtWait(r.telegramWaitMin)}`:''}`;if(r.timeReliability==='supported')return'✅ Telegram підтвердив ситуацію';if(r.timeReliability==='conflict')return`⚠️ Telegram не збігається${r.telegramWaitMin!=null?` · TG ${fmtWait(r.telegramWaitMin)}`:''}`;if(r.waitMin!=null)return'⚠️ Не підтверджено Telegram';return'—'}
function rankable(rows)'''
s2,n=re.subn(r'function recomputeTimeTrust\(r\)\{.*?\nfunction rankable\(rows\)',lambda _m:new_front,s,flags=re.S)
if n!=1: raise SystemExit(f'frontend trust replacement count={n}')
# Replace provenance function as a unit.
prov=r'''function provenance(r){const all=(r.sources||[]),nonTg=all.filter(s=>s.source!=='telegram'),main=mainSource(r);if(r.waitMin==null)return`<div class="provenance"><div class="prov-title">Звідки взявся очікуваний час</div><div class="prov-empty">Немає надійного числового джерела.</div></div>`;let mainText;if(r.timeReliability==='confirmed'&&r.baseWaitMin!=null&&r.telegramWaitMin!=null)mainText=`Фінальна оцінка <strong>${fmtWait(r.waitMin)}</strong>: базове джерело ${fmtWait(r.baseWaitMin)} + свіжий час Telegram ${fmtWait(r.telegramWaitMin)}.`;else if(r.timeReliability==='supported')mainText=`Показаний час <strong>${fmtWait(r.waitMin)}</strong> взято з базового джерела, а ситуацію незалежно підтверджено повідомленнями Telegram.`;else mainText=main?`Показаний час <strong>${fmtWait(r.waitMin)}</strong> взято з <strong>${esc(main.label||main.source)}</strong>${main.ageMin!=null?` · ${fmtAge(main.ageMin)}`:''}.`:`Показаний час <strong>${fmtWait(r.waitMin)}</strong>.`;const trust=` <span class="${r.timeReliable?'':'warn-text'}">${esc(timeTrustText(r))}</span>`;const rows=nonTg.map(s=>{const url=sourceUrl(s);return`<div class="prov-row ${main===s?'primary':''}"><div><span class="prov-source">${main===s?'Основне · ':''}${esc(s.label||s.source)}</span>${s.note?`<div class="prov-note">${esc(s.note)}</div>`:''}</div><div class="prov-right"><strong>${fmtSourceWait(s)||'без часу'}</strong>${s.ageMin!=null?`<span>${fmtAge(s.ageMin)}</span>`:''}${url?`<a href="${esc(url)}" target="_blank" rel="noopener">джерело ↗</a>`:''}</div></div>`}).join('');return`<div class="provenance"><div class="prov-title">Звідки взявся очікуваний час</div><div class="prov-summary">${mainText}${trust}${sourceConflict(r)?' <span class="warn-text">⚠️ Джерела помітно різняться.</span>':''}</div><div class="prov-list">${rows||'<div class="prov-empty">Додаткових джерел немає.</div>'}</div></div>`}
function directionBasisLabel'''
s3,n=re.subn(r'function provenance\(r\)\{.*?\nfunction directionBasisLabel',lambda _m:prov,s2,flags=re.S)
if n!=1: raise SystemExit(f'provenance replacement count={n}')
# Add trust label to hero note.
s3=s3.replace("${sourceConflict(best)?' · ⚠️ джерела різняться':''}</div>`", "${sourceConflict(best)?' · ⚠️ джерела різняться':''} · ${timeTrustText(best)}</div>`",1)
p.write_text(s3)
print('patched qualitative Telegram support')
