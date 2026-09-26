from pathlib import Path

p = Path('api/aggregate.js')
s = p.read_text()

old = "return out.map(x=>applyTelegramTimeTrust({...x,camera:x.camera||cameraFor(x)}))}"
new = r'''const trusted=out.map(x=>applyTelegramTimeTrust({...x,camera:x.camera||cameraFor(x)}));return trusted.filter((x,i,all)=>{if(!String(x.id||'').startsWith('tg-chat-'))return true;const ch=String(x.telegramChat?.channel||'').toLowerCase();if(!ch)return true;return !all.some((y,j)=>j!==i&&String(y.telegramChat?.channel||'').toLowerCase()===ch&&(y.waitMin!=null||(y.humanReports||0)>0||(y.sources||[]).some(src=>src.source!=='telegram')) )})}'''
if old not in s:
    raise SystemExit('mergeTelegram return target missing')
s = s.replace(old, new, 1)

old2 = "configured:Boolean(b?.sessionConfigured),authorized:Boolean(b?.authorized)"
new2 = "configured:Boolean(b?.credentialsConfigured||b?.sessionConfigured),authorized:Boolean(b?.authorized)"
if old2 not in s:
    raise SystemExit('telegram configured target missing')
s = s.replace(old2, new2, 1)

p.write_text(s)
print('duplicate placeholder filtering applied')
