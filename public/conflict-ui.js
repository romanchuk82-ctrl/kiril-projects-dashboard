const CONFLICT_LOW_TEXT='Telegram: черги немає / майже немає';
const CONFLICT_HIGH_TEXT='Telegram: повідомляють про значну чергу';

function cleanPrimarySource(card){
  const raw=card.querySelector('.prov-row.primary .prov-source')?.textContent?.trim()||'';
  return raw.replace(/^Основне\s*·\s*/i,'')||'базове джерело';
}

function patchConflictCard(card){
  if(!(card instanceof HTMLElement)||card.dataset.conflictUiPatched==='1')return;
  const note=card.querySelector('.data-note.conflict-note');
  const cue=card.querySelector('.telegram-cue');
  if(!note||!cue)return;

  const cueText=(cue.textContent||'').toLowerCase();
  const telegramLow=cueText.includes('черги майже немає');
  const telegramHigh=cueText.includes('значну чергу');
  if(!telegramLow&&!telegramHigh)return;

  card.dataset.conflictUiPatched='1';
  card.classList.add('source-conflict-card');

  const status=card.querySelector('.human-status');
  if(status){
    status.classList.remove('tone-green','tone-yellow','tone-orange','tone-red','tone-gray');
    status.classList.add('tone-conflict');
    status.textContent='⚠️ Джерела розходяться';
  }

  const waitPill=card.querySelector('.wait-pill');
  const waitText=waitPill?.textContent?.trim()||'часу немає';
  if(waitPill){
    waitPill.classList.add('conflict-wait');
    waitPill.innerHTML=`<span>${waitText}</span><small>базова оцінка</small>`;
  }

  const tgMeta=card.querySelector('.telegram-simple-meta')?.textContent?.trim()||'';
  const source=cleanPrimarySource(card);
  const sources=document.createElement('div');
  sources.className='conflict-sources';
  sources.innerHTML=`
    <div class="conflict-source-row conflict-source-base">
      <span class="conflict-source-label">${source}</span>
      <strong>${waitText}</strong>
    </div>
    <div class="conflict-source-row conflict-source-telegram">
      <span class="conflict-source-label">Telegram</span>
      <strong>${telegramLow?CONFLICT_LOW_TEXT.replace('Telegram: ',''):CONFLICT_HIGH_TEXT.replace('Telegram: ','')}</strong>
      ${tgMeta?`<small>${tgMeta}</small>`:''}
    </div>`;

  const head=card.querySelector('.crossing-head');
  if(head)head.insertAdjacentElement('afterend',sources);
  else card.prepend(sources);

  const quickFact=card.querySelector('.quick-facts span:first-child');
  if(quickFact)quickFact.textContent=telegramLow?'💬 Telegram: черги немає / майже немає':'💬 Telegram: повідомляють про значну чергу';

  note.textContent='⚠️ Свіжий Telegram суперечить базовій оцінці. Показуємо обидва сигнали окремо, без єдиного кольорового висновку.';
}

function patchAllConflictCards(){
  document.querySelectorAll('.crossing-card').forEach(patchConflictCard);
}

let scheduled=false;
function schedulePatch(){
  if(scheduled)return;
  scheduled=true;
  requestAnimationFrame(()=>{
    scheduled=false;
    patchAllConflictCards();
  });
}

const list=document.getElementById('crossingList');
if(list){
  new MutationObserver(schedulePatch).observe(list,{childList:true,subtree:true});
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedulePatch,{once:true});
else schedulePatch();
