import type { State } from './history.js';
const element = <T extends HTMLElement>(id:string) => document.getElementById(id) as T;
async function send(type:string) {
 try {
  const response = await chrome.runtime.sendMessage({type});
  if(response.error) throw new Error(response.error);
  render(response);
 } catch(error) { element('status').textContent = error instanceof Error ? error.message : 'Unable to load history.'; }
}
function render(state: State) {
 element('status').textContent = state.paused?'Logging paused. History remains on this device.':state.status;
 element('pause').textContent=state.paused?'Resume logging':'Pause logging';
 element('count').textContent=`(${state.history.length}/300)`;
 element('empty').hidden=state.history.length>0;
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
element('clear').addEventListener('click',()=>{if(confirm('Delete all local track history?'))void send('clear');});
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local' && changes.state?.newValue)render(changes.state.newValue);});
void send('state');
