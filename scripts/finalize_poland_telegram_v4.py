from pathlib import Path

# Backend aggregation: remove inherited tg-chat placeholders when a real row already owns the same chat.
p = Path('api/aggregate.js')
s = p.read_text()
helper = """function dropDuplicateChatPlaceholders(rows){
  const realChannels=new Set(rows.filter(r=>!String(r.id||'').startsWith('tg-chat-')&&r.telegramChat?.channel).map(r=>String(r.telegramChat.channel).toLowerCase()));
  return rows.filter(r=>{if(!String(r.id||'').startsWith('tg-chat-'))return true;const ch=String(r.telegramChat?.channel||'').toLowerCase();return !ch||!realChannels.has(ch)})
}
"""
if 'function dropDuplicateChatPlaceholders(rows)' not in s:
    marker = 'export function mergeTelegram(crossings,items,direction,chatSources=[])'
    if marker not in s:
        raise SystemExit('mergeTelegram marker missing')
    s = s.replace(marker, helper + marker, 1)
old = 'return out.map(x=>applyTelegramTimeTrust({...x,camera:x.camera||cameraFor(x)}))}'
new = 'return dropDuplicateChatPlaceholders(out).map(x=>applyTelegramTimeTrust({...x,camera:x.camera||cameraFor(x)}))}'
if old in s:
    s = s.replace(old, new, 1)
elif new not in s:
    raise SystemExit('mergeTelegram return target missing')
p.write_text(s)
print('aggregate placeholder dedupe: ok')

# Telegram parser: understand completed crossing reports expressed as two clock times.
p = Path('api/telegram.js')
s = p.read_text()
old = """  match = value.match(/(?:очікуван\\w*|чекал\\w*|стоял\\w*|пройшл\\w*|проход\\w*|перетнул\\w*|черга\\w*|очеред\\w*)[^\\n]{0,35}?(\\d{1,2})[:.](\\d{2})\\b/i);
  if (match) return Number(match[1]) * 60 + Number(match[2]);
  return null;"""
new = """  const clocks = [...value.matchAll(/(?:^|[^\\d])([01]?\\d|2[0-3])[:.]([0-5]\\d)(?=$|[^\\d])/g)].map(m => Number(m[1]) * 60 + Number(m[2]));
  const hasStart = /(під.?їх|приїх|прибул|стал|заїх|подъех|приех|прибыл|встал)/i.test(value);
  const hasEnd = /(пройш|проїх|перетнул|виїх|закінчил|прошл|проех|пересек|выех)/i.test(value);
  if (clocks.length >= 2 && hasStart && hasEnd) {
    let elapsed = clocks[clocks.length - 1] - clocks[0];
    if (elapsed < 0) elapsed += 24 * 60;
    if (elapsed > 0 && elapsed <= 12 * 60) return elapsed;
  }
  return null;"""
if old in s:
    s = s.replace(old, new, 1)
elif 'const clocks = [...value.matchAll' not in s:
    raise SystemExit('parseWaitMin clock target missing')
p.write_text(s)
print('elapsed Telegram time parser: ok')

# UI: surface direct Telegram-only time even when there is no independent base estimate.
p = Path('public/app.js')
s = p.read_text()
old = "if(r.waitMin!=null)return'⚠️ Не підтверджено Telegram';if(r.telegramQueueCars!=null)return`💬 Telegram: ${r.telegramQueueCars} авто · часу немає`;return'—'"
new = "if(r.waitMin!=null)return'⚠️ Не підтверджено Telegram';if(r.telegramWaitMin!=null)return`💬 Telegram: ${fmtWait(r.telegramWaitMin)} · лише людський звіт`;if(r.telegramQueueCars!=null)return`💬 Telegram: ${r.telegramQueueCars} авто · часу немає`;return'—'"
if old in s:
    s = s.replace(old, new, 1)
elif 'лише людський звіт' not in s:
    raise SystemExit('timeTrustText target missing')
old2 = "if(r.waitMin==null)return`<div class=\"provenance\"><div class=\"prov-title\">Звідки взявся очікуваний час</div><div class=\"prov-empty\">Числового часу поки немає.${r.telegramQueueCars!=null?` Telegram повідомляє приблизно ${r.telegramQueueCars} авто.`:''}</div></div>`;"
new2 = "if(r.waitMin==null)return`<div class=\"provenance\"><div class=\"prov-title\">Звідки взявся очікуваний час</div><div class=\"prov-empty\">${r.telegramWaitMin!=null?`Telegram повідомляє фактичний час проходження <strong>${fmtWait(r.telegramWaitMin)}</strong>, але незалежного джерела для підтвердження немає.`:`Числового часу поки немає.${r.telegramQueueCars!=null?` Telegram повідомляє приблизно ${r.telegramQueueCars} авто.`:''}`}</div></div>`;"
if old2 in s:
    s = s.replace(old2, new2, 1)
elif 'Telegram повідомляє фактичний час проходження' not in s:
    raise SystemExit('provenance no-time target missing')
p.write_text(s)
print('UI Telegram-only time: ok')
