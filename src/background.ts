import { initialState, record, validSample, type State } from './history.js';
let queue: Promise<unknown> = Promise.resolve();
async function getState(): Promise<State> { return (await chrome.storage.local.get('state')).state ?? initialState(); }
async function save(state: State) { await chrome.storage.local.set({state}); }
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
 const operation = async () => {
  const state = await getState();
  if(sender.tab) {
   if(sender.tab.id!==state.tabId || !sender.url?.startsWith('https://music.youtube.com/')) return {stop:true};
   if(message.type==='sample' && validSample(message.sample)) await save(record(state,message.sample));
   else if(message.type==='waiting' && !state.paused) await save({...state,status:'Waiting for track information. Nothing is recorded until title, artist, source and playback are available.'});
   return {ok:true};
  }
  if(sender.url!==chrome.runtime.getURL('popup.html')) throw new Error('Unsupported sender');
  switch(message.type) {
   case 'state': return state;
   case 'select': {
    const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
    if(!tab?.id || !tab.url || new URL(tab.url).origin!=='https://music.youtube.com') throw new Error('Open YouTube Music in the active tab, then select it here.');
    // Inject before saving selection; the observer retries on its next tick.
    await chrome.scripting.executeScript({target:{tabId:tab.id},files:['observer.js']});
    const next={...state,tabId:tab.id,last:state.tabId===tab.id?state.last:null,status:'Waiting for track information.'};
    await save(next); return next;
   }
   case 'pause': {const next={...state,paused:!state.paused,status:state.paused?'Waiting for playback.':'Logging paused.'};await save(next);return next;}
   case 'clear': {const next={...state,history:[]};await save(next);return next;}
   default: throw new Error('Unknown request');
  }
 };
 const result=queue.then(operation); queue=result.catch(()=>{});
 result.then(respond,error=>respond({error:error.message}));
 return true;
});
chrome.tabs.onRemoved.addListener(id=>{queue=queue.then(async()=>{const s=await getState();if(s.tabId===id)await save({...s,tabId:null,last:null,status:'Selected tab closed. Select a tab to continue.'});}).catch(()=>{});});
