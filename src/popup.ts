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
  const artist=document.createElement('span');artist.textContent=entry.kind==='youtube-video'?`YouTube video · Channel: ${entry.channel || 'Unavailable'}`:`YouTube Music · ${entry.artist}`;
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

async function sharingAction(type:string,origin?:string) {
 element('sharing-error').textContent='';
 try {
  const s=await chrome.runtime.sendMessage({type,origin});if(s.error && !('connected' in s))throw Error(s.error);
  element('sharing-error').textContent=s.error || '';
  if(s.expiresAt && s.expiresAt<=Date.now())element('sharing-error').textContent='Session expired. Disconnect and reconnect.';
  element('sharing-status').textContent=s.connected?`${s.login}: ${s.approved?'Publishing new plays':'Sharing is off'}.`:'Sharing is off. Local-only operation.';
  element('sharing-consent').hidden=!s.connected || s.approved;
  element('revoke-sharing').hidden=!s.connected;
  element('public-page').hidden=!s.connected;
  if(s.connected)element<HTMLAnchorElement>('public-link').href=`${s.origin}/recent/${encodeURIComponent(s.login)}`;
  element<HTMLButtonElement>('connect-sharing').disabled=s.connected;
  element<HTMLInputElement>('backend').disabled=s.connected;
  element<HTMLInputElement>('sharing-checkbox').checked=false;
  element<HTMLButtonElement>('approve-sharing').disabled=true;
 }catch(error){element('sharing-error').textContent=(error instanceof Error?error.message:'Sharing failed.')+(type==='sharing-revoke'?' Uploads are stopped locally. Retry to remove public plays immediately; otherwise they expire within 24 hours.':'');}
}
element('sharing-checkbox').addEventListener('change',()=>{element<HTMLButtonElement>('approve-sharing').disabled=!element<HTMLInputElement>('sharing-checkbox').checked;});
element('approve-sharing').addEventListener('click',()=>{if(element<HTMLInputElement>('sharing-checkbox').checked)void sharingAction('sharing-approve');});
element('revoke-sharing').addEventListener('click',()=>void sharingAction('sharing-revoke'));
element('connect-sharing').addEventListener('click',async()=>{
 try {
  const u=new URL(element<HTMLInputElement>('backend').value);
  if(u.protocol!=='https:' || u.username || u.password || u.pathname!=='/' || u.search || u.hash)throw Error('Enter an HTTPS backend origin without a path.');
  // Request only the chosen host, in the direct user gesture.
  if(!await chrome.permissions.request({origins:[`${u.origin}/*`]}))throw Error('Backend access was not granted.');
  await sharingAction('sharing-connect',u.origin);
 }catch(error){element('sharing-error').textContent=error instanceof Error?error.message:'Connection failed.';}
});
chrome.storage.onChanged.addListener((changes,area)=>{if((area==='session' && changes.sharing) || (area==='local' && changes.sharingError))void sharingAction('sharing-status');});
void sharingAction('sharing-status');
