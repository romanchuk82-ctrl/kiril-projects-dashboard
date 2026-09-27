from pathlib import Path

p=Path('public/app.js')
text=p.read_text(encoding='utf-8')

old="const t=raw.toLowerCase().replace(/[–—-]/g,' ').replace(/[^\\p{L}\\p{N}]+/gu,' ').trim(),low=/(без черги|нема черги|немає черги|черги нема|черги немає|пусто|вільно|вільний|одразу|відразу|сразу|без очікування)/.test(t),high=/(велика черга|довга черга|черга велика|черга довга|стоимо|стоїмо|чекаємо|ждемо|затор)/.test(t);if(low&&!high)return'low';if(high&&!low)return'high';return null}"
new="const t=raw.toLowerCase().replace(/[–—-]/g,' ').replace(/[^\\p{L}\\p{N}]+/gu,' ').trim(),reply=String(s?.replyContext||'').toLowerCase().replace(/[–—-]/g,' ').replace(/[^\\p{L}\\p{N}]+/gu,' ').trim(),shortNegative=/^(нема|немає|нет|ні|нікого|пусто|нуль|0)$/.test(t)&&/(черг|очеред|авто|машин)/.test(reply),low=shortNegative||/(без черги|нема черги|немає черги|черги нема|черги немає|пусто|вільно|вільний|одразу|відразу|сразу|без очікування)/.test(t),high=/(велика черга|довга черга|черга велика|черга довга|стоимо|стоїмо|чекаємо|ждемо|затор)/.test(t);if(low&&!high)return'low';if(high&&!low)return'high';return null}"
if old not in text:
    raise SystemExit('telegram qualitative fragment not found')
text=text.replace(old,new,1)

lines=text.splitlines()
start=next((i for i,l in enumerate(lines) if "if(cmp.mode==='time')$('heroCard')" in l),None)
end=next((i for i,l in enumerate(lines) if "else $('heroCard').innerHTML=`<div class=\"hero-kicker\">Дані по країні" in l),None)
if start is None or end is None or end < start:
    raise SystemExit('hero block not found')
hero=r'''  if(best){const hs=humanQueueState(best),heroValue=displayTimeMin(best)!=null?estimateText(best):queueRankText(best),q=displayQueue(best),limited=rankingIncomplete?'Порівняння лише за переходами, де є свіжі дані.':'';$('heroCard').innerHTML=`<div class="hero-kicker">Швидкий орієнтир зараз</div><div class="hero-main"><div><div class="hero-name">${flag(best.countryCode)} ${esc(best.name)}</div><div class="hero-meta">${esc(best.country)} · оновлено ${fmtAge(displayAgeMin(best))}</div></div><div class="hero-wait">${heroValue}</div></div><div class="hero-note"><strong>${hs.icon} ${hs.label}</strong>${q!=null?` · ${q} авто перед КПП`:''}${limited?`<br>${limited}`:''}</div>`}else $('heroCard').innerHTML=`<div class="hero-kicker">Дані по країні</div><div class="hero-empty">Поки немає достатньо свіжих даних. Відкрий картки КПП нижче або спробуй інший напрямок.</div>`;'''
lines=lines[:start]+[hero]+lines[end+1:]
text='\n'.join(lines)+('\n' if text.endswith('\n') else '')
p.write_text(text,encoding='utf-8')
print('first-time UI polish applied')
