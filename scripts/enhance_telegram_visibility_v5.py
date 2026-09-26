from pathlib import Path

# UI: show Telegram-only elapsed time and queue immediately on the card.
p=Path('public/app.js')
s=p.read_text()
needle="function rankable(rows){return rows.filter(r=>r.waitMin!=null&&!r.stale&&r.timeReliable===true).sort((a,b)=>a.waitMin-b.waitMin)}"
helper="function cardWaitText(r){if(r.waitMin!=null)return fmtWait(r.waitMin);if(r.telegramWaitMin!=null)return`TG ${fmtWait(r.telegramWaitMin)}`;return'немає даних'}\n"+needle
if 'function cardWaitText(r)' not in s:
    if needle not in s: raise SystemExit('rankable marker missing')
    s=s.replace(needle,helper,1)
old='<div class="wait-pill">${fmtWait(r.waitMin)}</div>'
new='<div class="wait-pill">${cardWaitText(r)}</div>'
if old in s:
    s=s.replace(old,new,1)
elif new not in s:
    raise SystemExit('wait pill target missing')
old="<div><span>Авто</span><strong>${r.queueCars??'—'}</strong></div>"
new="<div><span>Авто</span><strong>${r.queueCars!=null?r.queueCars:(r.telegramQueueCars!=null?`TG ${r.telegramQueueCars}`:'—')}</strong></div>"
if old in s:
    s=s.replace(old,new,1)
elif new not in s:
    raise SystemExit('cars metric target missing')
p.write_text(s)
print('app Telegram card visibility: ok')

# Lazy tgAtlas: all crossings of a specifically selected country are checked once per page/scope.
p=Path('public/tgatlas-ui.js')
s=p.read_text()
old='const candidates = [...timed, ...noTime].slice(0, 4);'
new="const candidates = [...timed, ...noTime].slice(0, state.country === 'ALL' ? 4 : visible.length);"
if old in s:
    s=s.replace(old,new,1)
elif new not in s:
    raise SystemExit('candidate limit target missing')
p.write_text(s)
print('country Telegram auto-load: ok')
