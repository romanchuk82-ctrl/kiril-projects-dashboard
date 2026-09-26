from pathlib import Path
p=Path('public/app.js')
s=p.read_text()

old="function rankable(rows){return rows.filter(r=>r.waitMin!=null&&!r.stale&&r.timeReliable===true).sort((a,b)=>a.waitMin-b.waitMin)}"
new="""function displayTimeMin(r){const v=r?.waitMin!=null?Number(r.waitMin):(r?.telegramWaitMin!=null?Number(r.telegramWaitMin):null);return Number.isFinite(v)?Math.max(0,Math.round(v)):null}
function displayTimeText(r){const v=displayTimeMin(r);if(v==null)return'часу немає';return r.waitMin!=null?fmtWait(v):`TG ${fmtWait(v)}`}
function displayQueue(r){const v=r?.queueCars!=null?Number(r.queueCars):(r?.telegramQueueCars!=null?Number(r.telegramQueueCars):null);return Number.isFinite(v)?Math.max(0,Math.round(v)):null}
function displayQueueText(r){const q=displayQueue(r);if(q==null)return'кількість авто не вказана';return `${q} авто в черзі${r.queueCars==null&&r.telegramQueueCars!=null?' · Telegram':''}`}
function displayAgeMin(r){if(r?.ageMin!=null&&Number.isFinite(Number(r.ageMin)))return Number(r.ageMin);const a=(r?.sources||[]).filter(s=>s?.source==='telegram'&&s.ageMin!=null&&Number.isFinite(Number(s.ageMin))).map(s=>Number(s.ageMin));return a.length?Math.min(...a):null}
function rankable(rows){return rows.filter(r=>displayTimeMin(r)!=null&&!r.stale).sort((a,b)=>displayTimeMin(a)-displayTimeMin(b))}"""
if old not in s: raise SystemExit('rankable target missing')
s=s.replace(old,new,1)

old="function telegramFallback(rows){const found=[];for(const r of rows){for(const src of (r.sources||[])){if(src?.source!=='telegram'||src.ageMin==null||Number(src.ageMin)>TG_TRUST_MAX_AGE)continue;const q=telegramQueueCount(src);if(q==null)continue;found.push({row:r,src,q,age:Number(src.ageMin)});break}}return found.sort((a,b)=>a.age-b.age)[0]||null}"
new="function telegramFallback(rows){const found=[];for(const r of rows){for(const src of (r.sources||[])){if(src?.source!=='telegram'||src.ageMin==null||Number(src.ageMin)>TG_TRUST_MAX_AGE)continue;const q=telegramQueueCount(src);if(q==null)continue;found.push({row:r,src,q,age:Number(src.ageMin)});break}}return found.sort((a,b)=>a.q-b.q||a.age-b.age)[0]||null}"
if old not in s: raise SystemExit('telegramFallback target missing')
s=s.replace(old,new,1)

old="function render(){const rows=currentRows(),good=rankable(rows),best=good[0],worst=[...good].sort((a,b)=>b.waitMin-a.waitMin)[0],tgFallback=telegramFallback(rows);"
new="function render(){const rows=[...currentRows()].sort((a,b)=>{const at=displayTimeMin(a),bt=displayTimeMin(b);if(at!=null&&bt!=null)return at-bt;if(at!=null)return-1;if(bt!=null)return 1;const aq=displayQueue(a),bq=displayQueue(b);if(aq!=null&&bq!=null)return aq-bq;if(aq!=null)return-1;if(bq!=null)return 1;return String(a.name||'').localeCompare(String(b.name||''),'uk')});const good=rankable(rows),best=good[0],worst=[...good].sort((a,b)=>displayTimeMin(b)-displayTimeMin(a))[0],tgFallback=telegramFallback(rows);"
if old not in s: raise SystemExit('render start target missing')
s=s.replace(old,new,1)

s=s.replace('<div class="hero-kicker">Найкращий перехід зараз</div>','<div class="hero-kicker">Найшвидше за наявними даними</div>')
s=s.replace('${fmtWait(best.waitMin)}</div></div><div class="hero-note">${best.queueCars!=null?`${best.queueCars} авто в черзі`:\'кількість авто не вказана\'}', '${displayTimeText(best)}</div></div><div class="hero-note">${displayQueueText(best)}')
s=s.replace('${esc(best.country)} · ${fmtAge(best.ageMin)}', '${esc(best.country)} · ${fmtAge(displayAgeMin(best))}')
s=s.replace("tgFallback?`<div class=\"hero-kicker\">Свіжий сигнал Telegram</div>", "tgFallback?`<div class=\"hero-kicker\">Найменша черга за Telegram</div>")
s=s.replace('Є актуальні дані від людей, але без надійного числового часу.','Орієнтир за кількістю авто. Точного часу проходження поки немає.')
s=s.replace("`<div class=\"mini-row\"><span>${i+1}. ${flag(r.countryCode)} ${esc(r.name)}</span><strong>${fmtWait(r.waitMin)}</strong></div>`", "`<div class=\"mini-row\"><span>${i+1}. ${flag(r.countryCode)} ${esc(r.name)}</span><strong>${displayTimeText(r)}</strong></div>`")
s=s.replace("`<div class=\"mini-row\"><span>${flag(worst.countryCode)} ${esc(worst.name)}</span><strong>${fmtWait(worst.waitMin)}</strong></div>`", "`<div class=\"mini-row\"><span>${flag(worst.countryCode)} ${esc(worst.name)}</span><strong>${displayTimeText(worst)}</strong></div>`")
s=s.replace('${fmtAge(r.ageMin)}${r.stale?', '${fmtAge(displayAgeMin(r))}${r.stale?')
old='${r.waitMin!=null?fmtWait(r.waitMin):(r.telegramQueueCars!=null?`TG ${r.telegramQueueCars} авто`:`немає часу`)}'
if old not in s: raise SystemExit('card wait target missing')
s=s.replace(old,'${displayTimeText(r)}',1)
old="${r.queueCars??'—'}"
if old not in s: raise SystemExit('queue metric target missing')
s=s.replace(old,"${displayQueue(r)??'—'}",1)

p.write_text(s)
print('country-first UI patch applied')
