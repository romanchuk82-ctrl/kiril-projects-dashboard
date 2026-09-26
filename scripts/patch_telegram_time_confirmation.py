from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'missing patch target: {label}')
    return text.replace(old, new, 1)

# 1) Backend reliability model
p = Path('api/aggregate.js')
s = p.read_text()
marker = "function sort(rows){return[...rows].sort((a,b)=>(a.stale?1:0)-(b.stale?1:0)||(a.waitMin??999999)-(b.waitMin??999999)||(a.ageMin??9999)-(b.ageMin??9999))}"
helper = r'''export function applyTelegramTimeTrust(row){
  const out={...row,sources:[...(row.sources||[])]};
  const baseRaw=out.baseWaitMin!=null?Number(out.baseWaitMin):(out.waitMin!=null?Number(out.waitMin):null);
  const base=Number.isFinite(baseRaw)?Math.max(0,Math.round(baseRaw)):null;
  const tg=out.sources.filter(src=>src?.source==='telegram'&&src.value!=null&&Number.isFinite(Number(src.value))&&src.ageMin!=null&&Number(src.ageMin)>=0&&Number(src.ageMin)<=90);
  const vals=tg.map(src=>Math.max(0,Math.round(Number(src.value)))).sort((a,b)=>a-b);
  const median=vals.length?(vals.length%2?vals[(vals.length-1)/2]:Math.round((vals[vals.length/2-1]+vals[vals.length/2])/2)):null;
  const newest=tg.length?Math.min(...tg.map(src=>Number(src.ageMin))):null;
  out.baseWaitMin=base;
  out.telegramWaitMin=median;
  out.telegramTimeReports=vals.length;
  out.telegramTimeAgeMin=newest;
  out.timeDeltaMin=base!=null&&median!=null?Math.abs(base-median):null;
  if(base==null){out.timeReliable=false;out.timeReliability='no_time';out.timeReliabilityReason='Немає незалежної базової оцінки часу';return out}
  if(!vals.length){out.waitMin=base;out.timeReliable=false;out.timeReliability='unconfirmed';out.timeReliabilityReason='Немає свіжого числового часу з Telegram за останні 90 хв';out.confidence='low';return out}
  const spread=vals.length>1?vals[vals.length-1]-vals[0]:0;
  const spreadLimit=Math.max(30,Math.round((median||0)*0.5));
  if(spread>spreadLimit){out.waitMin=base;out.timeReliable=false;out.timeReliability='conflict';out.timeReliabilityReason='Свіжі повідомлення Telegram суперечать одне одному';out.confidence='low';return out}
  const tolerance=Math.max(20,Math.round(base*0.35));
  if(Math.abs(base-median)>tolerance){out.waitMin=base;out.timeReliable=false;out.timeReliability='conflict';out.timeReliabilityReason=`Telegram відрізняється від базового часу на ${Math.abs(base-median)} хв`;out.confidence='low';return out}
  const weight=vals.length>=2?0.45:0.35;
  out.waitMin=Math.max(0,Math.round(base*(1-weight)+median*weight));
  out.timeReliable=true;
  out.timeReliability='confirmed';
  out.timeReliabilityReason=`Підтверджено ${vals.length} свіжим${vals.length===1?'':'и'} повідомленням${vals.length===1?'':'и'} Telegram`;
  out.confidence='high';
  return out
}
function sort(rows){return[...rows].sort((a,b)=>(a.timeReliable===true?0:1)-(b.timeReliable===true?0:1)||(a.stale?1:0)-(b.stale?1:0)||(a.waitMin??999999)-(b.waitMin??999999)||(a.ageMin??9999)-(b.ageMin??9999))}'''
s = replace_once(s, marker, helper, 'aggregate helper insertion')
old = "return out.map(x=>({...x,camera:x.camera||cameraFor(x)}))}\nfunction sort(rows)"
new = "return out.map(x=>applyTelegramTimeTrust({...x,camera:x.camera||cameraFor(x)}))}\nfunction sort(rows)"
# marker changed because helper sits between mergeTelegram and sort; patch the actual mergeTelegram return separately via last occurrence
needle = "return out.map(x=>({...x,camera:x.camera||cameraFor(x)}))}"
pos = s.rfind(needle)
if pos < 0:
    raise SystemExit('missing patch target: mergeTelegram return')
s = s[:pos] + "return out.map(x=>applyTelegramTimeTrust({...x,camera:x.camera||cameraFor(x)}))}" + s[pos+len(needle):]
p.write_text(s)

# 2) Main UI: confirmed times only in ranking + explicit trust state
p = Path('public/app.js')
s = p.read_text()
s = replace_once(s,
"function rankable(rows){return rows.filter(r=>r.waitMin!=null&&!r.stale).sort((a,b)=>a.waitMin-b.waitMin)}",
r'''function recomputeTimeTrust(r){const baseRaw=r.baseWaitMin!=null?Number(r.baseWaitMin):(r.waitMin!=null?Number(r.waitMin):null),base=Number.isFinite(baseRaw)?Math.max(0,Math.round(baseRaw)):null,tg=(r.sources||[]).filter(s=>s?.source==='telegram'&&s.value!=null&&Number.isFinite(Number(s.value))&&s.ageMin!=null&&Number(s.ageMin)>=0&&Number(s.ageMin)<=90),vals=tg.map(s=>Math.max(0,Math.round(Number(s.value)))).sort((a,b)=>a-b),median=vals.length?(vals.length%2?vals[(vals.length-1)/2]:Math.round((vals[vals.length/2-1]+vals[vals.length/2])/2)):null;r.baseWaitMin=base;r.telegramWaitMin=median;r.telegramTimeReports=vals.length;r.telegramTimeAgeMin=tg.length?Math.min(...tg.map(s=>Number(s.ageMin))):null;r.timeDeltaMin=base!=null&&median!=null?Math.abs(base-median):null;if(base==null){r.timeReliable=false;r.timeReliability='no_time';r.timeReliabilityReason='Немає незалежної базової оцінки часу';return r}if(!vals.length){r.waitMin=base;r.timeReliable=false;r.timeReliability='unconfirmed';r.timeReliabilityReason='Немає свіжого числового часу з Telegram за останні 90 хв';return r}const spread=vals.length>1?vals[vals.length-1]-vals[0]:0,spreadLimit=Math.max(30,Math.round((median||0)*.5));if(spread>spreadLimit){r.waitMin=base;r.timeReliable=false;r.timeReliability='conflict';r.timeReliabilityReason='Свіжі повідомлення Telegram суперечать одне одному';return r}const tolerance=Math.max(20,Math.round(base*.35));if(Math.abs(base-median)>tolerance){r.waitMin=base;r.timeReliable=false;r.timeReliability='conflict';r.timeReliabilityReason=`Telegram відрізняється від базового часу на ${Math.abs(base-median)} хв`;return r}const weight=vals.length>=2?.45:.35;r.waitMin=Math.max(0,Math.round(base*(1-weight)+median*weight));r.timeReliable=true;r.timeReliability='confirmed';r.timeReliabilityReason=`Підтверджено Telegram (${vals.length})`;return r}
function timeTrustText(r){if(r.timeReliability==='confirmed')return`✅ Telegram підтвердив${r.telegramWaitMin!=null?` · TG ${fmtWait(r.telegramWaitMin)}`:''}`;if(r.timeReliability==='conflict')return`⚠️ Telegram не збігається${r.telegramWaitMin!=null?` · TG ${fmtWait(r.telegramWaitMin)}`:''}`;if(r.waitMin!=null)return'⚠️ Не підтверджено Telegram';return'—'}
function rankable(rows){return rows.filter(r=>r.waitMin!=null&&!r.stale&&r.timeReliable===true).sort((a,b)=>a.waitMin-b.waitMin)}''',
'app trust helpers')
s = s.replace("`<div class=\"hero-kicker\">Найкращий перехід зараз</div><div class=\"hero-empty\">Немає достатньо свіжих даних для рейтингу</div>`", "`<div class=\"hero-kicker\">Найкращий перехід зараз</div><div class=\"hero-empty\">Немає часу, підтвердженого Telegram. Перевір КПП нижче.</div>`")
s = replace_once(s,
"${esc(r.country)} · ${fmtAge(r.ageMin)}${r.stale?' · застарілі дані':''}${sourceConflict(r)?' · ⚠️ розбіжність джерел':''}",
"${esc(r.country)} · ${fmtAge(r.ageMin)}${r.stale?' · застарілі дані':''}${sourceConflict(r)?' · ⚠️ розбіжність джерел':''} · ${timeTrustText(r)}",
'app card trust text')
p.write_text(s)

# 3) Lazy Telegram UI: recalc after fetch + auto-check up to 3 best candidates until one confirms
p = Path('public/tgatlas-ui.js')
s = p.read_text()
s = replace_once(s,
"  const baseRender = render;\n",
"  const baseRender = render;\n  const autoDone = new Set();\n  const autoRunning = new Set();\n",
'auto state')
s = replace_once(s,
"  async function loadTelegram(channel, button) {\n    if (!channel || button.dataset.loading === '1') return;\n    button.dataset.loading = '1';\n    button.disabled = true;\n    button.textContent = 'Перевіряю…';",
"  async function loadTelegram(channel, button = null, silent = false) {\n    if (!channel || button?.dataset?.loading === '1') return false;\n    if (button) { button.dataset.loading = '1'; button.disabled = true; button.textContent = 'Перевіряю…'; }",
'loadTelegram signature')
s = replace_once(s,
"      row.humanSignal = fresh.length > 1 ? 'corroborated' : fresh.length === 1 ? 'reported' : null;\n",
"      row.humanSignal = fresh.length > 1 ? 'corroborated' : fresh.length === 1 ? 'reported' : null;\n      if (typeof recomputeTimeTrust === 'function') recomputeTimeTrust(row);\n",
'recompute trust after fetch')
s = replace_once(s,
"      render();\n    } catch (error) {\n      button.disabled = false;\n      button.dataset.loading = '0';\n      button.textContent = 'Повторити Telegram';\n      console.warn('[telegram-ui]', String(error?.message || error));\n    }\n  }\n",
"      render();\n      return Boolean(row.timeReliable);\n    } catch (error) {\n      if (button) { button.disabled = false; button.dataset.loading = '0'; button.textContent = 'Повторити Telegram'; }\n      if (!silent) console.warn('[telegram-ui]', String(error?.message || error));\n      return false;\n    }\n  }\n\n  async function autoConfirmBest() {\n    const dir = state.direction;\n    if (autoDone.has(dir) || autoRunning.has(dir)) return;\n    autoRunning.add(dir);\n    try {\n      const candidates = state.rows.filter(r => r.waitMin != null && !r.stale && r.telegramChat?.channel && r.timeReliable !== true).sort((a,b)=>a.waitMin-b.waitMin).slice(0,3);\n      for (const row of candidates) {\n        const ok = await loadTelegram(row.telegramChat.channel, null, true);\n        if (ok) break;\n      }\n    } finally {\n      autoRunning.delete(dir);\n      autoDone.add(dir);\n    }\n  }\n",
'auto confirm function')
s = replace_once(s,
"    document.querySelectorAll('.tg-load-btn').forEach(button => {\n      button.addEventListener('click', () => loadTelegram(button.dataset.channel, button), { once: true });\n    });\n  };",
"    document.querySelectorAll('.tg-load-btn').forEach(button => {\n      button.addEventListener('click', () => loadTelegram(button.dataset.channel, button), { once: true });\n    });\n    setTimeout(autoConfirmBest, 0);\n  };",
'auto confirm render hook')
p.write_text(s)

print('patched Telegram-confirmed time reliability')
