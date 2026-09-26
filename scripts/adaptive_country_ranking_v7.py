from pathlib import Path
import re
p=Path('public/app.js')
s=p.read_text()
new_render=r'''function comparisonFor(rows){
  const timed=rankable(rows);
  const queued=rows.filter(r=>displayQueue(r)!=null&&!r.stale).sort((a,b)=>displayQueue(a)-displayQueue(b));
  if(timed.length>=2)return{mode:'time',list:timed,best:timed[0],worst:timed[timed.length-1]};
  if(queued.length>=2)return{mode:'queue',list:queued,best:queued[0],worst:queued[queued.length-1]};
  if(timed.length===1)return{mode:'time_single',list:timed,best:timed[0],worst:null};
  if(queued.length===1)return{mode:'queue_single',list:queued,best:queued[0],worst:null};
  return{mode:'none',list:[],best:null,worst:null};
}
function render(){
  const raw=currentRows(),cmp=comparisonFor(raw);
  const rows=[...raw].sort((a,b)=>{if(cmp.mode==='queue'||cmp.mode==='queue_single'){const aq=displayQueue(a),bq=displayQueue(b);if(aq!=null&&bq!=null)return aq-bq;if(aq!=null)return-1;if(bq!=null)return 1}const at=displayTimeMin(a),bt=displayTimeMin(b);if(at!=null&&bt!=null)return at-bt;if(at!=null)return-1;if(bt!=null)return 1;const aq=displayQueue(a),bq=displayQueue(b);if(aq!=null&&bq!=null)return aq-bq;if(aq!=null)return-1;if(bq!=null)return 1;return String(a.name||'').localeCompare(String(b.name||''),'uk')});
  const best=cmp.best,worst=cmp.worst;
  $('countBadge').textContent=rows.length;$('emptyState').classList.toggle('hidden',rows.length>0);$('heroCard').classList.remove('skeleton');
  const labels=document.querySelectorAll('.summary-card .summary-label');if(labels[0])labels[0].textContent=cmp.mode==='queue'?'TOP-3 за чергою':'TOP-3 за часом';if(labels[1])labels[1].textContent=cmp.mode==='queue'?'Найбільша черга':'Найдовший час';
  if(cmp.mode==='time')$('heroCard').innerHTML=`<div class="hero-kicker">Найшвидше за наявними даними</div><div class="hero-main"><div><div class="hero-name">${flag(best.countryCode)} ${esc(best.name)}</div><div class="hero-meta">${esc(best.country)} · ${fmtAge(displayAgeMin(best))}</div></div><div class="hero-wait">${displayTimeText(best)}</div></div><div class="hero-note">${displayQueueText(best)} · ${timeTrustText(best)}</div>`;
  else if(cmp.mode==='queue')$('heroCard').innerHTML=`<div class="hero-kicker">Найменша черга зараз</div><div class="hero-main"><div><div class="hero-name">${flag(best.countryCode)} ${esc(best.name)}</div><div class="hero-meta">${esc(best.country)} · ${fmtAge(displayAgeMin(best))}</div></div><div class="hero-wait">${displayQueue(best)} авто</div></div><div class="hero-note">Порівняння за кількістю авто. Точного часу по більшості КПП поки немає.</div>`;
  else if(cmp.mode==='time_single')$('heroCard').innerHTML=`<div class="hero-kicker">Є фактичний час по одному КПП</div><div class="hero-main"><div><div class="hero-name">${flag(best.countryCode)} ${esc(best.name)}</div><div class="hero-meta">${esc(best.country)} · ${fmtAge(displayAgeMin(best))}</div></div><div class="hero-wait">${displayTimeText(best)}</div></div><div class="hero-note">Порівняти швидкість з іншими КПП поки неможливо.</div>`;
  else if(cmp.mode==='queue_single')$('heroCard').innerHTML=`<div class="hero-kicker">Є дані про чергу по одному КПП</div><div class="hero-main"><div><div class="hero-name">${flag(best.countryCode)} ${esc(best.name)}</div><div class="hero-meta">${esc(best.country)} · ${fmtAge(displayAgeMin(best))}</div></div><div class="hero-wait">${displayQueue(best)} авто</div></div><div class="hero-note">Порівняти з іншими КПП поки неможливо.</div>`;
  else $('heroCard').innerHTML=`<div class="hero-kicker">Дані по країні</div><div class="hero-empty">Поки немає достатньо даних, щоб порівняти КПП.</div>`;
  $('topThree').innerHTML=cmp.list.slice(0,3).map((r,i)=>`<div class="mini-row"><span>${i+1}. ${flag(r.countryCode)} ${esc(r.name)}</span><strong>${cmp.mode==='queue'?`${displayQueue(r)} авто`:displayTimeText(r)}</strong></div>`).join('')||'<span class="muted">—</span>';
  $('worstCrossing').innerHTML=worst?`<div class="mini-row"><span>${flag(worst.countryCode)} ${esc(worst.name)}</span><strong>${cmp.mode==='queue'?`${displayQueue(worst)} авто`:displayTimeText(worst)}</strong></div>`:'<span class="muted">—</span>';
  $('crossingList').innerHTML=rows.map(r=>`<article class="crossing-card ${r.stale?'stale':''}"><div class="crossing-head"><div><div class="crossing-title">${flag(r.countryCode)} ${esc(r.name)}</div><div class="crossing-sub">${esc(r.country)} · ${fmtAge(displayAgeMin(r))}${r.stale?' · застарілі дані':''}${sourceConflict(r)?' · ⚠️ розбіжність джерел':''} · ${timeTrustText(r)}</div></div><div class="wait-pill">${displayTimeText(r)}</div></div><div class="metrics"><div><span>Авто</span><strong>${displayQueue(r)??'—'}</strong></div><div><span>Тренд</span><strong>${trendIcon(r.trend)}${r.trendPercent!=null?` ${Math.round(r.trendPercent)}%`:''}</strong></div><div><span>Джерела</span><strong>${(r.sources||[]).length}</strong></div></div>${provenance(r)}${telegramBlock(r)}${actions(r)}</article>`).join('')
}
'''
pat=r'function render\(\)\{.*?\nfunction officialSummary'
if not re.search(pat,s,flags=re.S): raise SystemExit('render block not found')
s=re.sub(pat,new_render+'function officialSummary',s,count=1,flags=re.S)
p.write_text(s)
print('adaptive ranking applied')
