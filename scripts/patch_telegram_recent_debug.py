from pathlib import Path
p=Path('api/telegram.js')
text=p.read_text(encoding='utf-8')
old="""    const result = {\n      source, items, status: 'connected', messagesScanned: messages.length,\n      newestMessageAt: timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null,\n      peerId: peer.id\n    };\n"""
new="""    const result = {\n      source, items, status: 'connected', messagesScanned: messages.length,\n      newestMessageAt: timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null,\n      peerId: peer.id,\n      recentMessages: [...messages].sort((a,b)=>messageTimestampMs(b)-messageTimestampMs(a)).slice(0,20).map(m=>({id:m.id,date:Number.isFinite(messageTimestampMs(m))?new Date(messageTimestampMs(m)).toISOString():null,text:messageText(m),replyToMsgId:m.replyToMsgId||null}))\n    };\n"""
if old not in text: raise SystemExit('result block not found')
text=text.replace(old,new,1)
old2="""    requested,\n    items,\n    sources: allResults.map(result => sourceMeta(result, configured ? 'available' : 'missing_credentials')),\n    quota: quotaState.remaining == null ? null : quotaState\n"""
new2="""    requested,\n    items,\n    sources: allResults.map(result => sourceMeta(result, configured ? 'available' : 'missing_credentials')),\n    ...(requested && requested !== 'full' ? { recentMessages: byUser.get(String(requested).toLowerCase())?.recentMessages || [] } : {}),\n    quota: quotaState.remaining == null ? null : quotaState\n"""
if old2 not in text: raise SystemExit('payload block not found')
text=text.replace(old2,new2,1)
p.write_text(text,encoding='utf-8')
print('Added per-source recent Telegram diagnostic messages')
