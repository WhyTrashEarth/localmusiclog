import { initAppearance } from './appearance.js';
import { ui } from './ui-strings.js';
import type { State } from './history.js';
const element = <T extends HTMLElement>(id:string) => document.getElementById(id) as T;
void initAppearance();
const setText = (id:string,value:string) => {const node=element(id);if(node.textContent!==value)node.textContent=value;};
let displayedHistory: State['history'] = [];
async function send(type:string) {
 try {
  const response = await chrome.runtime.sendMessage({type});
  if(response.error) throw new Error(response.error);
  render(response);
  return true;
 } catch(error) { element('status').textContent = error instanceof Error ? error.message : ui.history.loadError; return false; }
}
function render(state: State) {
 setText('diagnostics',state.diagnostics || ui.history.noProbe);
 setText('status',state.paused?ui.history.paused:state.status);
 setText('pause-label',state.paused?ui.history.resume:ui.history.pause);
 element('pause-icon').setAttribute('href',state.paused?'#icon-play':'#icon-pause');
 const recording=state.paused?'paused':state.tabId!==null && state.last?.playing?'recording':'waiting';
 setText('recording-state',ui.recording[recording]);
 element('recording-icon').dataset.state=recording;
 element('recording-icon').querySelector('use')!.setAttribute('href',state.paused?'#icon-pause':'#icon-record');
 setText('count',`(${state.history.length}/300)`);
 element('empty').hidden=state.history.length>0;
 element<HTMLButtonElement>('clear').disabled=state.history.length===0;
 // Probe/status updates must not rebuild up to 300 unchanged history nodes every second.
 const fields = ['id','title','artist','source','kind','channel','observedAt'] as const;
 const unchanged=state.history.length===displayedHistory.length && state.history.every((entry,i)=>fields.every(key=>entry[key]===displayedHistory[i][key]));
 if(unchanged)return;
 displayedHistory=state.history;
 element('history').replaceChildren(...[...state.history].reverse().map(entry=>{
  const li=document.createElement('li');
  const title=document.createElement('strong');title.dir='auto';title.textContent=entry.title;
  const artist=document.createElement('span');artist.className='attribution';
  const name=document.createElement('bdi');name.dir='auto';name.textContent=entry.kind==='youtube-video'?(entry.channel || ui.history.unavailable):entry.artist;
  artist.append(entry.kind==='youtube-video'?ui.history.video:ui.history.music,name);
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
 button.textContent=ui.history.deleting;
 try {
  if(await send('clear')) {
   closeConfirmation();
   element('action-status').textContent=ui.history.cleared;
  } else {
   element('clear-error').hidden=false;
   element('clear-error').textContent=ui.history.clearError;
  }
 } finally {
  clearing=false;button.disabled=false;
  element<HTMLButtonElement>('cancel-clear').disabled=false;
  button.textContent=ui.history.delete;
 }
});
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local' && changes.state?.newValue)render(changes.state.newValue);});
void send('state');

async function sharingAction(type:string,origin?:string) {
 element('sharing-error').textContent='';
 try {
  const s=await chrome.runtime.sendMessage({type,origin});if(s.error && !('connected' in s))throw Error(s.error);
  element('sharing-error').textContent=s.error || '';
  if(s.expiresAt && s.expiresAt<=Date.now())element('sharing-error').textContent=ui.sharing.expired;
  element('sharing-status').textContent=s.connected?`${s.login}: ${s.approved?ui.sharing.publishing:ui.sharing.off}.`:ui.sharing.localOnly;
  element('sharing-consent').hidden=!s.connected || s.approved;
  element('revoke-sharing').hidden=!s.connected;
  element('public-page').hidden=!s.connected;
  if(s.connected)element<HTMLAnchorElement>('public-link').href=`${s.origin}/recent/${encodeURIComponent(s.login)}`;
  element<HTMLButtonElement>('connect-sharing').disabled=s.connected;
  element<HTMLInputElement>('backend').disabled=s.connected;
  element<HTMLInputElement>('sharing-checkbox').checked=false;
  element<HTMLButtonElement>('approve-sharing').disabled=true;
 }catch(error){element('sharing-error').textContent=(error instanceof Error?error.message:ui.sharing.failed)+(type==='sharing-revoke'?ui.sharing.revokeError:'');}
}
element('sharing-checkbox').addEventListener('change',()=>{element<HTMLButtonElement>('approve-sharing').disabled=!element<HTMLInputElement>('sharing-checkbox').checked;});
element('approve-sharing').addEventListener('click',()=>{if(element<HTMLInputElement>('sharing-checkbox').checked)void sharingAction('sharing-approve');});
element('revoke-sharing').addEventListener('click',()=>void sharingAction('sharing-revoke'));
element('connect-sharing').addEventListener('click',async()=>{
 try {
  const u=new URL(element<HTMLInputElement>('backend').value);
  if(u.protocol!=='https:' || u.username || u.password || u.pathname!=='/' || u.search || u.hash)throw Error(ui.sharing.invalidOrigin);
  // Request only the chosen host, in the direct user gesture.
  if(!await chrome.permissions.request({origins:[`${u.origin}/*`]}))throw Error(ui.sharing.permissionError);
  await sharingAction('sharing-connect',u.origin);
 }catch(error){element('sharing-error').textContent=error instanceof Error?error.message:ui.sharing.connectionError;}
});
chrome.storage.onChanged.addListener((changes,area)=>{if((area==='session' && changes.sharing) || (area==='local' && changes.sharingError))void sharingAction('sharing-status');});
void sharingAction('sharing-status');
