from pathlib import Path


def rep(path, old, new, label, count=1):
    p = Path(path)
    s = p.read_text()
    n = s.count(old)
    if n < count:
        raise SystemExit(f'{label}: expected at least {count}, found {n}')
    s = s.replace(old, new, count)
    p.write_text(s)
    print(f'{label}: ok')

# 1) Backend: 3-hour trust window and one explicit queue report can corroborate conditions.
p = Path('api/aggregate.js')
s = p.read_text()
s = s.replace("Number(src.ageMin)<=90", "Number(src.ageMin)<=180")
s = s.replace("за останні 90 хв", "за останні 3 години")
s = s.replace("if(support>=2){", "if(support>=1){")

# Attach raw Telegram items to the checkpoint chat row first. This fixes spelling variants
# such as Будомєж / Будоміж creating duplicate cards.
old = "const countryCode=s(raw.country_code||raw.countryCode)||'';let f=out.find(x=>rowMatches(x,name,countryCode,[]));const rawWait="
new = "const countryCode=s(raw.country_code||raw.countryCode)||'';const sourceChannel=s(raw.source_channel||raw.sourceChannel);let f=out.find(x=>sourceChannel&&String(x.telegramChat?.channel||'').toLowerCase()===sourceChannel.toLowerCase())||out.find(x=>rowMatches(x,name,countryCode,[]));const rawWait="
if old not in s:
    raise SystemExit('aggregate channel-first match target missing')
s = s.replace(old, new, 1)
old2 = "const channelUrl=s(raw.channel_url||raw.channelUrl);const sourceChannel=s(raw.source_channel||raw.sourceChannel);const replyContext="
new2 = "const channelUrl=s(raw.channel_url||raw.channelUrl);const replyContext="
if old2 not in s:
    raise SystemExit('aggregate duplicate sourceChannel target missing')
s = s.replace(old2, new2, 1)
p.write_text(s)
print('aggregate fixes: ok')

# 2) Front-end mirrors the same 3-hour trust window and one concrete report threshold.
p = Path('public/app.js')
s = p.read_text()
s = s.replace("Number(s.ageMin)<=90", "Number(s.ageMin)<=180")
s = s.replace("за останні 90 хв", "за останні 3 години")
s = s.replace("if(support>=2){", "if(support>=1){")
p.write_text(s)
print('app trust fixes: ok')

# 3) Lazy loader: when a country is selected, also auto-check rows with no base wait time.
# Use direction+country as the once-per-view key so selecting Poland triggers its own checks.
p = Path('public/tgatlas-ui.js')
s = p.read_text()
old = "const dir = state.direction;\n    if (autoDone.has(dir) || autoRunning.has(dir)) return;\n    autoRunning.add(dir);"
new = "const dir = state.direction, scope = `${dir}:${state.country}`;\n    if (autoDone.has(scope) || autoRunning.has(scope)) return;\n    autoRunning.add(scope);"
if old not in s:
    raise SystemExit('tgatlas auto scope target missing')
s = s.replace(old, new, 1)
old = "const candidates = state.rows.filter(r => r.waitMin != null && !r.stale && r.telegramChat?.channel && r.timeReliable !== true).sort((a,b)=>a.waitMin-b.waitMin).slice(0,3);"
new = "const candidates = state.rows.filter(r => (state.country === 'ALL' || r.countryCode === state.country) && !r.stale && r.telegramChat?.channel && r.timeReliable !== true).sort((a,b)=>((a.waitMin==null)-(b.waitMin==null))||((a.waitMin??999999)-(b.waitMin??999999))).slice(0,3);"
if old not in s:
    raise SystemExit('tgatlas candidates target missing')
s = s.replace(old, new, 1)
old = "autoRunning.delete(dir);\n      autoDone.add(dir);"
new = "autoRunning.delete(scope);\n      autoDone.add(scope);"
if old not in s:
    raise SystemExit('tgatlas auto finish target missing')
s = s.replace(old, new, 1)
p.write_text(s)
print('tgatlas lazy visibility fixes: ok')

# 4) Telegram parser: derive elapsed crossing time only from two explicit clock timestamps
# and start/end wording. This catches messages such as 16:30 -> 21:15 = 285 min,
# without treating a single clock time as a duration.
p = Path('api/telegram.js')
s = p.read_text()
old = "  match = value.match(/(?:очікуван\\w*|чекал\\w*|стоял\\w*|пройшл\\w*|проход\\w*|перетнул\\w*|черга\\w*|очеред\\w*)[^\\n]{0,35}?(\\d{1,2})[:.](\\d{2})\\b/i);\n  if (match) return Number(match[1]) * 60 + Number(match[2]);\n  return null;"
new = "  const clocks = [...value.matchAll(/(?:^|[^\\d])([01]?\\d|2[0-3])[:.]([0-5]\\d)(?=$|[^\\d])/g)].map(m => Number(m[1]) * 60 + Number(m[2]));\n  const hasStart = /(під.?їх|під'їх|приїх|стали|став(?:ла|ли)?|заїх|прибул|подъех|приех|встал)/i.test(value);\n  const hasEnd = /(пройш|проїх|перетнул|виїх|закінчил|прошл|проех|пересек|выех)/i.test(value);\n  if (clocks.length >= 2 && hasStart && hasEnd) {\n    let elapsed = clocks[clocks.length - 1] - clocks[0];\n    if (elapsed < 0) elapsed += 24 * 60;\n    if (elapsed > 0 && elapsed <= 12 * 60) return elapsed;\n  }\n  return null;"
if old not in s:
    raise SystemExit('telegram elapsed parser target missing')
s = s.replace(old, new, 1)
p.write_text(s)
print('telegram elapsed parser: ok')
