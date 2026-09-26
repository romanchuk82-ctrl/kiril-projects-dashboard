from pathlib import Path
import re


def sub_once(text, pattern, repl, label, flags=0):
    new, n = re.subn(pattern, lambda m: repl, text, count=1, flags=flags)
    if n != 1:
        raise SystemExit(f'{label}: replacement count={n}')
    return new

# --- backend: attach Telegram items by channel first, then by fuzzy checkpoint name ---
p = Path('api/aggregate.js')
s = p.read_text()
old = "const countryCode=s(raw.country_code||raw.countryCode)||'';let f=out.find(x=>rowMatches(x,name,countryCode,[]));const rawWait="
new = "const countryCode=s(raw.country_code||raw.countryCode)||'';const sourceChannel=s(raw.source_channel||raw.sourceChannel);let f=out.find(x=>sourceChannel&&String(x.telegramChat?.channel||'').toLowerCase()===sourceChannel.toLowerCase());if(!f)f=out.find(x=>rowMatches(x,name,countryCode,[]));const rawWait="
if old not in s:
    raise SystemExit('aggregate raw item match target missing')
s = s.replace(old, new, 1)
old2 = "const sourceLabel=s(raw.source_label||raw.sourceLabel)||'Telegram';const channelUrl=s(raw.channel_url||raw.channelUrl);const sourceChannel=s(raw.source_channel||raw.sourceChannel);const replyContext="
new2 = "const sourceLabel=s(raw.source_label||raw.sourceLabel)||'Telegram';const channelUrl=s(raw.channel_url||raw.channelUrl);const replyContext="
if old2 not in s:
    raise SystemExit('aggregate duplicate sourceChannel target missing')
s = s.replace(old2, new2, 1)

backend = r'''const TG_TRUST_MAX_AGE=180;
function telegramQueueCount(src){
  const direct=src?.queueCars!=null?Number(src.queueCars):NaN;
  if(Number.isFinite(direct)&&direct>=0)return Math.round(direct);
  const raw=String(src?.note||'');
  let m=raw.match(/(\d{1,4})\s*[-–—]\s*(\d{1,4})\s*(?:авто|машин[\p{L}]*)/iu);
  if(m)return Math.max(Number(m[1]),Number(m[2]));
  m=raw.match(/(?:^|[^\d])(\d{1,4})\s*(?:авто|машин[\p{L}]*)(?=$|[^\p{L}\p{N}])/iu);
  return m?Number(m[1]):null
}
function telegramQualitativeSignal(src){
  const q=telegramQueueCount(src);
  if(q!=null){if(q<=3)return'low';if(q>=10)return'high';return'mid'}
  const raw=String(src?.note||'');
  if(/[?？]/.test(raw)||/(?:^|\s)(яка|який|які|скільки|підкажіть|підкажи|скажіть|скажи|хто знає)(?:\s|$)/iu.test(raw))return null;
  const text=keyName(raw);
  const low=/(без черги|нема черги|немає черги|черги нема|черги немає|пусто|вільно|вільний|одразу|відразу|сразу|без очікування)/.test(text);
  const high=/(велика черга|довга черга|черга велика|черга довга|стоимо|стоїмо|чекаємо|ждемо|затор)/.test(text);
  if(low&&!high)return'low';if(high&&!low)return'high';return null
}
export function applyTelegramTimeTrust(row){
  const out={...row,sources:[...(row.sources||[])]};
  const baseRaw=out.baseWaitMin!=null?Number(out.baseWaitMin):(out.waitMin!=null?Number(out.waitMin):null);
  const base=Number.isFinite(baseRaw)?Math.max(0,Math.round(baseRaw)):null;
  const fresh=out.sources.filter(src=>src?.source==='telegram'&&src.ageMin!=null&&Number(src.ageMin)>=0&&Number(src.ageMin)<=TG_TRUST_MAX_AGE);
  const numeric=fresh.filter(src=>src.value!=null&&Number.isFinite(Number(src.value)));
  const vals=numeric.map(src=>Math.max(0,Math.round(Number(src.value)))).sort((a,b)=>a-b);
  const median=vals.length?(vals.length%2?vals[(vals.length-1)/2]:Math.round((vals[vals.length/2-1]+vals[vals.length/2])/2)):null;
  const signalRows=fresh.map(src=>({src,signal:telegramQualitativeSignal(src)})).filter(x=>x.signal);
  const signals=signalRows.map(x=>x.signal);
  const counts={low:signals.filter(x=>x==='low').length,mid:signals.filter(x=>x==='mid').length,high:signals.filter(x=>x==='high').length};
  const queueRows=fresh.map(src=>({src,q:telegramQueueCount(src)})).filter(x=>x.q!=null).sort((a,b)=>Number(a.src.ageMin)-Number(b.src.ageMin));
  out.baseWaitMin=base;
  out.telegramWaitMin=median;
  out.telegramTimeReports=vals.length;
  out.telegramFreshReports=fresh.length;
  out.telegramQualitative=counts;
  out.telegramQueueCars=queueRows.length?queueRows[0].q:null;
  out.telegramQueueAgeMin=queueRows.length?Number(queueRows[0].src.ageMin):null;
  out.telegramTimeAgeMin=numeric.length?Math.min(...numeric.map(src=>Number(src.ageMin))):null;
  out.timeDeltaMin=base!=null&&median!=null?Math.abs(base-median):null;
  if(base==null){out.timeReliable=false;out.timeReliability='no_time';out.timeReliabilityReason=fresh.length?'Telegram має свіжі дані, але немає незалежної базової оцінки часу':'Немає незалежної базової оцінки часу';return out}
  if(vals.length){
    const spread=vals.length>1?vals[vals.length-1]-vals[0]:0;
    const spreadLimit=Math.max(30,Math.round((median||0)*0.5));
    if(spread>spreadLimit){out.waitMin=base;out.timeReliable=false;out.timeReliability='conflict';out.timeReliabilityReason='Свіжі повідомлення Telegram суперечать одне одному';out.confidence='low';return out}
    const tolerance=Math.max(20,Math.round(base*0.35));
    if(Math.abs(base-median)>tolerance){out.waitMin=base;out.timeReliable=false;out.timeReliability='conflict';out.timeReliabilityReason=`Telegram відрізняється від базового часу на ${Math.abs(base-median)} хв`;out.confidence='low';return out}
    const weight=vals.length>=2?0.45:0.35;
    out.waitMin=Math.max(0,Math.round(base*(1-weight)+median*weight));
    out.timeReliable=true;out.timeReliability='confirmed';out.timeReliabilityReason=`Telegram прямо підтвердив час (${vals.length})`;out.confidence='high';return out
  }
  let support=0,contradict=0;
  if(base<=20){support=counts.low;contradict=counts.high}
  else if(base>=60){support=counts.high;contradict=counts.low}
  else {support=counts.mid;contradict=(base>=45?counts.low:0)+(base<=35?counts.high:0)}
  if(contradict>0&&support===0){out.waitMin=base;out.timeReliable=false;out.timeReliability='conflict';out.timeReliabilityReason='Telegram описує іншу ситуацію з чергою, ніж базова оцінка';out.confidence='low';return out}
  if(support>=1){out.waitMin=base;out.timeReliable=true;out.timeReliability='supported';out.timeReliabilityReason=`Ситуацію підтверджує ${support} пряме повідомлення Telegram`;out.confidence='medium';return out}
  out.waitMin=base;out.timeReliable=false;out.timeReliability='unconfirmed';out.timeReliabilityReason=fresh.length?'Telegram є, але немає прямого підтвердження ситуації':'Немає свіжого підтвердження з Telegram за останні 3 години';out.confidence='low';return out
}
function sort(rows)'''
s = sub_once(s, r'const TG_TRUST_MAX_AGE=180;.*?\nfunction sort\(rows\)|function telegramQualitativeSignal\(src\)\{.*?\nfunction sort\(rows\)', backend, 'backend trust block', re.S)
p.write_text(s)

# --- frontend trust mirror + visible Telegram fallback ---
p = Path('public/app.js')
s = p.read_text()
front = r'''const TG_TRUST_MAX_AGE=180;
function telegramQueueCount(s){const d=s?.queueCars!=null?Number(s.queueCars):NaN;if(Number.isFinite(d)&&d>=0)return Math.round(d);const raw=String(s?.note||'');let m=raw.match(/(\d{1,4})\s*[-–—]\s*(\d{1,4})\s*(?:авто|машин[\p{L}]*)/iu);if(m)return Math.max(Number(m[1]),Number(m[2]));m=raw.match(/(?:^|[^\d])(\d{1,4})\s*(?:авто|машин[\p{L}]*)(?=$|[^\p{L}\p{N}])/iu);return m?Number(m[1]):null}
function telegramQualitativeSignal(s){const q=telegramQueueCount(s);if(q!=null){if(q<=3)return'low';if(q>=10)return'high';return'mid'}const raw=String(s?.note||'');if(/[?？]/.test(raw)||/(?:^|\s)(яка|який|які|скільки|підкажіть|підкажи|скажіть|скажи|хто знає)(?:\s|$)/iu.test(raw))return null;const t=raw.toLowerCase().replace(/[–—-]/g,' ').replace(/[^\p{L}\p{N}]+/gu,' ').trim(),low=/(без черги|нема черги|немає черги|черги нема|черги немає|пусто|вільно|вільний|одразу|відразу|сразу|без очікування)/.test(t),high=/(велика черга|довга черга|черга велика|черга довга|стоимо|стоїмо|чекаємо|ждемо|затор)/.test(t);if(low&&!high)return'low';if(high&&!low)return'high';return null}
function recomputeTimeTrust(r){const baseRaw=r.baseWaitMin!=null?Number(r.baseWaitMin):(r.waitMin!=null?Number(r.waitMin):null),base=Number.isFinite(baseRaw)?Math.max(0,Math.round(baseRaw)):null,fresh=(r.sources||[]).filter(s=>s?.source==='telegram'&&s.ageMin!=null&&Number(s.ageMin)>=0&&Number(s.ageMin)<=TG_TRUST_MAX_AGE),numeric=fresh.filter(s=>s.value!=null&&Number.isFinite(Number(s.value))),vals=numeric.map(s=>Math.max(0,Math.round(Number(s.value)))).sort((a,b)=>a-b),median=vals.length?(vals.length%2?vals[(vals.length-1)/2]:Math.round((vals[vals.length/2-1]+vals[vals.length/2])/2)):null,signals=fresh.map(telegramQualitativeSignal).filter(Boolean),counts={low:signals.filter(x=>x==='low').length,mid:signals.filter(x=>x==='mid').length,high:signals.filter(x=>x==='high').length},queueRows=fresh.map(s=>({s,q:telegramQueueCount(s)})).filter(x=>x.q!=null).sort((a,b)=>Number(a.s.ageMin)-Number(b.s.ageMin));r.baseWaitMin=base;r.telegramWaitMin=median;r.telegramTimeReports=vals.length;r.telegramFreshReports=fresh.length;r.telegramQualitative=counts;r.telegramQueueCars=queueRows.length?queueRows[0].q:null;r.telegramQueueAgeMin=queueRows.length?Number(queueRows[0].s.ageMin):null;r.telegramTimeAgeMin=numeric.length?Math.min(...numeric.map(s=>Number(s.ageMin))):null;r.timeDeltaMin=base!=null&&median!=null?Math.abs(base-median):null;if(base==null){r.timeReliable=false;r.timeReliability='no_time';r.timeReliabilityReason=fresh.length?'Telegram має свіжі дані, але немає незалежної базової оцінки часу':'Немає незалежної базової оцінки часу';return r}if(vals.length){const spread=vals.length>1?vals[vals.length-1]-vals[0]:0,spreadLimit=Math.max(30,Math.round((median||0)*.5));if(spread>spreadLimit){r.waitMin=base;r.timeReliable=false;r.timeReliability='conflict';r.timeReliabilityReason='Свіжі повідомлення Telegram суперечать одне одному';return r}const tolerance=Math.max(20,Math.round(base*.35));if(Math.abs(base-median)>tolerance){r.waitMin=base;r.timeReliable=false;r.timeReliability='conflict';r.timeReliabilityReason=`Telegram відрізняється від базового часу на ${Math.abs(base-median)} хв`;return r}const weight=vals.length>=2?.45:.35;r.waitMin=Math.max(0,Math.round(base*(1-weight)+median*weight));r.timeReliable=true;r.timeReliability='confirmed';r.timeReliabilityReason=`Telegram прямо підтвердив час (${vals.length})`;return r}let support=0,contradict=0;if(base<=20){support=counts.low;contradict=counts.high}else if(base>=60){support=counts.high;contradict=counts.low}else{support=counts.mid;contradict=(base>=45?counts.low:0)+(base<=35?counts.high:0)}if(contradict>0&&support===0){r.waitMin=base;r.timeReliable=false;r.timeReliability='conflict';r.timeReliabilityReason='Telegram описує іншу ситуацію з чергою, ніж базова оцінка';return r}if(support>=1){r.waitMin=base;r.timeReliable=true;r.timeReliability='supported';r.timeReliabilityReason=`Ситуацію підтверджує ${support} пряме повідомлення Telegram`;return r}r.waitMin=base;r.timeReliable=false;r.timeReliability='unconfirmed';r.timeReliabilityReason=fresh.length?'Telegram є, але немає прямого підтвердження ситуації':'Немає свіжого підтвердження з Telegram за останні 3 години';return r}
function timeTrustText(r){if(r.timeReliability==='confirmed')return`✅ Telegram підтвердив час${r.telegramWaitMin!=null?` · TG ${fmtWait(r.telegramWaitMin)}`:''}`;if(r.timeReliability==='supported')return'✅ Telegram підтвердив ситуацію';if(r.timeReliability==='conflict')return`⚠️ Telegram не збігається${r.telegramWaitMin!=null?` · TG ${fmtWait(r.telegramWaitMin)}`:''}`;if(r.waitMin!=null)return'⚠️ Не підтверджено Telegram';if(r.telegramQueueCars!=null)return`💬 Telegram: ${r.telegramQueueCars} авто · часу немає`;return'—'}
function rankable(rows)'''
s = sub_once(s, r'(?:const TG_TRUST_MAX_AGE=180;\n)?function telegramQualitativeSignal\(s\)\{.*?\nfunction rankable\(rows\)', front, 'frontend trust block', re.S)

# Improve no-time provenance with Telegram evidence.
s = s.replace("if(r.waitMin==null)return`<div class=\"provenance\"><div class=\"prov-title\">Звідки взявся очікуваний час</div><div class=\"prov-empty\">Немає надійного числового джерела.</div></div>`;",
              "if(r.waitMin==null)return`<div class=\"provenance\"><div class=\"prov-title\">Звідки взявся очікуваний час</div><div class=\"prov-empty\">Числового часу поки немає.${r.telegramQueueCars!=null?` Telegram повідомляє приблизно ${r.telegramQueueCars} авто.`:''}</div></div>`;",1)

# Add a fallback helper before render.
render_marker = "function render(){const rows=currentRows(),good=rankable(rows),best=good[0],worst=[...good].sort((a,b)=>b.waitMin-a.waitMin)[0];"
render_new = "function telegramFallback(rows){const found=[];for(const r of rows){for(const src of (r.sources||[])){if(src?.source!=='telegram'||src.ageMin==null||Number(src.ageMin)>TG_TRUST_MAX_AGE)continue;const q=telegramQueueCount(src);if(q==null)continue;found.push({row:r,src,q,age:Number(src.ageMin)});break}}return found.sort((a,b)=>a.age-b.age)[0]||null}\nfunction render(){const rows=currentRows(),good=rankable(rows),best=good[0],worst=[...good].sort((a,b)=>b.waitMin-a.waitMin)[0],tgFallback=telegramFallback(rows);"
if render_marker not in s:
    raise SystemExit('render marker missing')
s = s.replace(render_marker, render_new, 1)

# Replace empty hero fallback with fresh Telegram evidence when present.
empty_hero = "`<div class=\"hero-kicker\">Найкращий перехід зараз</div><div class=\"hero-empty\">Немає часу, підтвердженого Telegram. Перевір КПП нижче.</div>`"
hero_with_tg = "(tgFallback?`<div class=\"hero-kicker\">Свіжий сигнал Telegram</div><div class=\"hero-main\"><div><div class=\"hero-name\">${flag(tgFallback.row.countryCode)} ${esc(tgFallback.row.name)}</div><div class=\"hero-meta\">${fmtAge(tgFallback.age)} · час ще не підтверджений</div></div><div class=\"hero-wait\">${tgFallback.q} авто</div></div><div class=\"hero-note\">Є актуальні дані від людей, але без надійного числового часу.</div>`:`<div class=\"hero-kicker\">Найкращий перехід зараз</div><div class=\"hero-empty\">Немає часу, підтвердженого Telegram. Перевір КПП нижче.</div>`)"
if empty_hero not in s:
    raise SystemExit('empty hero target missing')
s = s.replace(empty_hero, hero_with_tg, 1)

# Show Telegram queue count in the card pill when there is no time.
s = s.replace('<div class="wait-pill">${fmtWait(r.waitMin)}</div>', '<div class="wait-pill">${r.waitMin!=null?fmtWait(r.waitMin):(r.telegramQueueCars!=null?`TG ${r.telegramQueueCars} авто`:`немає часу`)}</div>', 1)
p.write_text(s)

# --- lazy UI: re-run per country+direction; auto-fetch up to 4 visible chats, including no-time PL rows ---
p = Path('public/tgatlas-ui.js')
s = p.read_text()
auto = r'''  async function autoConfirmBest() {
    const key = `${state.direction}:${state.country}`;
    if (autoDone.has(key) || autoRunning.has(key)) return;
    autoRunning.add(key);
    try {
      const visible = (typeof currentRows === 'function' ? currentRows() : state.rows).filter(r => !r.stale && r.telegramChat?.channel && r.timeReliable !== true);
      const timed = visible.filter(r => r.waitMin != null).sort((a,b)=>a.waitMin-b.waitMin);
      const noTime = visible.filter(r => r.waitMin == null);
      const candidates = [...timed, ...noTime].slice(0, 4);
      for (const row of candidates) await loadTelegram(row.telegramChat.channel, null, true);
    } finally {
      autoRunning.delete(key);
      autoDone.add(key);
    }
  }

  render = function()'''
s = sub_once(s, r'  async function autoConfirmBest\(\) \{.*?\n  \}\n\n  render = function\(\)', auto, 'autoConfirmBest', re.S)
p.write_text(s)

print('telegram visibility/trust v3 patch applied')
