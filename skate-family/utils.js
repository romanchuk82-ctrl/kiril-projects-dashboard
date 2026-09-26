import { PROFILES, JUMPS } from './config.js';

export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function median(arr){ if(!arr.length)return 0; const a=[...arr].sort((x,y)=>x-y); const m=Math.floor(a.length/2); return a.length%2?a[m]:(a[m-1]+a[m])/2; }
export const mean=arr=>arr.length?arr.reduce((a,b)=>a+b,0)/arr.length:0;
export function sd(arr){ if(arr.length<2)return 0; const m=mean(arr); return Math.sqrt(mean(arr.map(x=>(x-m)**2))); }
export const esc=(s='')=>String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
export const fmtDate=ts=>new Intl.DateTimeFormat('uk-UA',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(ts));
export const profileById=id=>PROFILES.find(p=>p.id===id)||PROFILES[2];
export const jumpById=id=>JUMPS.find(j=>j.id===id)||JUMPS[0];
export const standalone=()=>window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;
export const historyKey=id=>`skate.history.${id}`;
export function getHistory(id){ try{return JSON.parse(localStorage.getItem(historyKey(id))||'[]')}catch{return []} }
export function saveHistory(id,item){ const h=getHistory(id); h.unshift(item); localStorage.setItem(historyKey(id),JSON.stringify(h.slice(0,100))); }
