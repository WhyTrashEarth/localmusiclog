import type { State } from './history.js';
const element = <T extends HTMLElement>(id:string) => document.getElementById(id) as T;
async function send(type:string) {
 try {
  const response = await chrome.runtime.sendMessage({type});
  if(response.error) throw new Error(response.error);
  render(response);
  return true;
 } catch(error) { element('status').textContent = error instanceof Error ? error.message : 'Unable to load history.'; return false; }
}
function render(state: State) {
 element('diagnostics').textContent=state.diagnostics || 'No playback probe received yet.';
 element('status').textContent = state.paused?'Logging paused. History remains on this device.':state.status;
 element('pause').textContent=state.paused?'Resume logging':'Pause logging';
 element('count').textContent=`(${state.history.length}/300)`;
 element('empty').hidden=state.history.length>0;
 element<HTMLButtonElement>('clear').disabled=state.history.length===0;
 element('history').replaceChildren(...[...state.history].reverse().map(entry=>{
  const li=document.createElement('li');
  const title=document.createElement('strong');title.textContent=entry.title;
  const artist=document.createElement('span');artist.textContent=entry.artist;
  const time=document.createElement('time');time.dateTime=entry.observedAt;time.textContent=new Date(entry.observedAt).toLocaleString();
  li.append(title,artist,time);return li;
 }));
}
element('select').addEventListener('click',()=>void send('select'));
element('pause').addEventListener('click',()=>void send('pause'));
let clearing = false;
function closeConfirmation() {
 element('clear-confirmation').hidden=true;
 element('clear').setAttribute('aria-expanded','false');
 // Clear becomes disabled after successful deletion; return to a usable control.
 (element<HTMLButtonElement>('clear').disabled ? element('select') : element('clear')).focus();
}
element('clear').addEventListener('click',()=>{
 element('clear-confirmation').hidden=false;
 element('clear').setAttribute('aria-expanded','true');
 element('clear-error').hidden=true;
 element('action-status').textContent='';
 element('cancel-clear').focus();
});
element('cancel-clear').addEventListener('click',closeConfirmation);
document.addEventListener('keydown',event=>{
 if(event.key==='Escape' && !element('clear-confirmation').hidden && !clearing) {
  event.preventDefault();closeConfirmation();
 }
});
element('confirm-clear').addEventListener('click',async()=>{
 if(clearing)return;
 clearing=true;
 const button=element<HTMLButtonElement>('confirm-clear');
 button.disabled=true;
 element<HTMLButtonElement>('cancel-clear').disabled=true;
 button.textContent='Deleting…';
 try {
  if(await send('clear')) {
   closeConfirmation();
   element('action-status').textContent='Local history cleared.';
  } else {
   element('clear-error').hidden=false;
   element('clear-error').textContent='Could not clear history. Try again or keep your history.';
  }
 } finally {
  clearing=false;button.disabled=false;
  element<HTMLButtonElement>('cancel-clear').disabled=false;
  button.textContent='Delete history';
 }
});
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local' && changes.state?.newValue)render(changes.state.newValue);});
void send('state');
