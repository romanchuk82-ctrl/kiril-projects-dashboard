const crossingList=document.getElementById('crossingList');
const openCrossings=new Set();

function telegramSummaryStatus(text){
  const value=String(text||'');
  if(value.includes('✅ Telegram підтвердив'))return{kind:'confirmed',label:'✅ Підтверджено Telegram'};
  if(value.includes('⚠️ Telegram не збігається'))return{kind:'conflict',label:'⚠️ Telegram не збігається'};
  if(value.includes('💬 Telegram:'))return{kind:'telegram',label:'💬 Лише дані Telegram'};
  return{kind:'unconfirmed',label:'⚠️ Не підтверджено Telegram'};
}

function compactCard(card){
  const head=card.querySelector(':scope > .crossing-head');
  const title=head?.querySelector('.crossing-title');
  const wait=head?.querySelector('.wait-pill');
  const sub=head?.querySelector('.crossing-sub');
  if(!head||!title||!wait)return;

  const key=title.textContent.trim();
  const status=telegramSummaryStatus(sub?.textContent);
  const details=document.createElement('details');
  details.className=`${card.className} crossing-collapsible`;
  details.dataset.compact='1';
  if(openCrossings.has(key))details.open=true;

  const summary=document.createElement('summary');
  summary.className='compact-crossing-summary';
  summary.innerHTML=`
    <div class="compact-crossing-main">
      <div class="compact-crossing-copy">
        <div class="crossing-title">${title.innerHTML}</div>
        <div class="compact-telegram-status ${status.kind}">${status.label}</div>
      </div>
      <div class="compact-crossing-right">
        <div class="wait-pill">${wait.textContent}</div>
        <span class="compact-chevron" aria-hidden="true">⌄</span>
      </div>
    </div>`;

  const body=document.createElement('div');
  body.className='compact-crossing-detail';
  if(sub)body.append(sub.cloneNode(true));
  [...card.children].forEach(child=>{
    if(child!==head)body.append(child);
  });

  details.append(summary,body);
  details.addEventListener('toggle',()=>{
    if(details.open)openCrossings.add(key);
    else openCrossings.delete(key);
  });
  card.replaceWith(details);
}

function compactAllCards(){
  if(!crossingList)return;
  crossingList.querySelectorAll(':scope > article.crossing-card').forEach(compactCard);
}

if(crossingList){
  const observer=new MutationObserver(compactAllCards);
  observer.observe(crossingList,{childList:true});
  compactAllCards();
}
