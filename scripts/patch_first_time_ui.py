from pathlib import Path

p = Path('public/app.js')
text = p.read_text(encoding='utf-8')

marker = "function displayTimeMin(r){"
helpers = r'''function humanQueueState(r){
  const t=displayTimeMin(r),q=displayQueue(r),noQueue=qualitativeNoQueue(r)||q===0;
  if(noQueue&&(t==null||t<=20))return{tone:'tone-green',icon:'🟢',label:'Черги майже немає'};
  if(t!=null){if(t<=20)return{tone:'tone-green',icon:'🟢',label:'Черги майже немає'};if(t<=45)return{tone:'tone-yellow',icon:'🟡',label:'Невелика черга'};if(t<=90)return{tone:'tone-orange',icon:'🟠',label:'Є черга'};return{tone:'tone-red',icon:'🔴',label:'Велика черга'}}
  if(q!=null){if(q<=3)return{tone:'tone-green',icon:'🟢',label:'Черги майже немає'};if(q<=10)return{tone:'tone-yellow',icon:'🟡',label:'Невелика черга'};if(q<=25)return{tone:'tone-orange',icon:'🟠',label:'Є черга'};return{tone:'tone-red',icon:'🔴',label:'Велика черга'}}
  return{tone:'tone-gray',icon:'⚪️',label:'Стан черги уточнюється'}
}
function estimateText(r){const v=displayTimeMin(r);return v==null?'часу немає':`≈ ${fmtWait(v)}`}
function humanConflictNote(r){if(r.timeReliability==='conflict'||sourceConflict(r))return'ℹ️ Дані джерел відрізняються. Показуємо найсвіжіший обережний орієнтир.';if(r.timeReliability==='confirmed'||r.timeReliability==='supported')return'✓ Ситуація додатково підтверджена Telegram.';return''}
'''
if 'function humanQueueState(r)' not in text:
    if marker not in text:
        raise SystemExit('displayTimeMin marker not found')
    text = text.replace(marker, helpers + marker, 1)

start = text.find('function telegramBlock(r){')
end = text.find('function telegramFallback(rows){', start)
if start < 0 or end < 0:
    raise SystemExit('telegramBlock/functions boundary not found')
new_tg = r'''function telegramBlock(r){
  const tg=(r.sources||[]).filter(s=>s.source==='telegram'&&s.ageMin!=null&&Number(s.ageMin)>=0&&Number(s.ageMin)<=TG_TRUST_MAX_AGE).sort((a,b)=>{const ta=Date.parse(a.updatedAt||''),tb=Date.parse(b.updatedAt||'');if(Number.isFinite(ta)&&Number.isFinite(tb)&&ta!==tb)return tb-ta;return(a.ageMin??9999)-(b.ageMin??9999)}),chat=r.telegramChat||null;
  if(!tg.length){const target=chat?.url||null;return`<div class="telegram-box no-tg"><div class="telegram-title">💬 Що пишуть зараз</div><div class="telegram-empty">Немає свіжого релевантного повідомлення про цей КПП.</div>${target?`<div class="telegram-simple-actions"><a href="${esc(target)}" target="_blank" rel="noopener">Відкрити Telegram ↗</a></div>`:''}</div>`}
  const latest=tg[0],target=latest.sourceUrl||chat?.url||null,signal=telegramQualitativeSignal(latest),cue=signal==='low'?'🟢 За повідомленням черги майже немає':signal==='high'?'🔴 Повідомляють про значну чергу':'Свіже повідомлення від водіїв';
  return`<div class="telegram-box"><div class="telegram-title">💬 Що пишуть зараз</div><div class="telegram-simple"><div class="telegram-cue">${cue}</div>${latest.note?`<div class="telegram-quote">“${esc(latest.note)}”</div>`:''}<div class="telegram-simple-meta">${latest.ageMin!=null?fmtAge(latest.ageMin):''}${latest.replyContext?' · відповідь на питання про чергу':''}</div>${latest.replyContext?`<div class="telegram-reply-simple">↩️ ${esc(latest.replyContext)}</div>`:''}</div>${target?`<div class="telegram-simple-actions"><a href="${esc(target)}" target="_blank" rel="noopener">Відкрити в Telegram ↗</a></div>`:''}</div>`
}
function actions(r){return''}
'''
text = text[:start] + new_tg + text[end:]

lines = text.splitlines()
replaced_card = False
for i,line in enumerate(lines):
    if "$('crossingList').innerHTML=rows.map" in line:
        lines[i] = r'''  $('crossingList').innerHTML=rows.map(r=>{const s=humanQueueState(r),q=displayQueue(r),note=humanConflictNote(r);return`<article class="crossing-card ${r.stale?'stale':''}"><div class="crossing-head"><div><div class="crossing-title">${flag(r.countryCode)} ${esc(r.name)}</div><div class="human-status ${s.tone}">${s.icon} ${s.label}</div><div class="crossing-sub">${esc(r.country)} · оновлено ${fmtAge(displayAgeMin(r))}${r.stale?' · дані застарілі':''}</div></div><div class="wait-pill">${estimateText(r)}</div></div><div class="quick-facts"><span>🚗 ${q!=null?`${q} авто перед КПП`:qualitativeNoQueue(r)?'черги не повідомляють':'кількість авто невідома'}</span><span>🕒 ${fmtAge(displayAgeMin(r))}</span></div>${note?`<div class="data-note ${r.timeReliability==='conflict'||sourceConflict(r)?'conflict-note':'confirmed-note'}">${note}</div>`:''}<details class="explain-details"><summary>ⓘ Як розраховано</summary>${provenance(r)}</details>${telegramBlock(r)}</article>`}).join('')'''
        replaced_card = True
        break
if not replaced_card:
    raise SystemExit('crossing card render line not found')
text = '\n'.join(lines) + ('\n' if text.endswith('\n') else '')

old = "$('sourceText').textContent=`Nakordoni: ${nk==='connected'?'✓':nk==='missing_key'?'немає ключа':nk||'—'} · Kordon/ДПСУ: ${kt} · Офіційні: ${officialSummary(data.sourceStatus?.official)} · Камери: ✓ · Telegram: ${telegramStatusLabel(tg,td)}`;"
new = "$('sourceText').textContent=`Nakordoni ${nk==='connected'?'✓':nk==='missing_key'?'—':nk||'—'} · ДПСУ/Kordon.info ${kt} · Офіційні ${officialSummary(data.sourceStatus?.official)} · Telegram ${telegramStatusLabel(tg,td)}`;"
if old not in text:
    raise SystemExit('sourceText line not found')
text = text.replace(old, new, 1)

p.write_text(text, encoding='utf-8')
print('first-time visitor UI app patch applied')
