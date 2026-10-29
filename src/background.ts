import { detectPlayer } from './detection.js';
import { initialState, record, validSample, type State } from './history.js';
let queue: Promise<unknown> = Promise.resolve();
function supported(url?: string) {try{return ['https://music.youtube.com','https://www.youtube.com','https://youtube.com'].includes(new URL(url || '').origin);}catch{return false;}}
async function getState(): Promise<State> { return (await chrome.storage.local.get('state')).state ?? initialState(); }
async function save(state: State) { await chrome.storage.local.set({state}); }
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
 const operation = async () => {
  const state = await getState();
  if(sender.tab) {
   if(sender.tab.id!==state.tabId || !supported(sender.url)) return {stop:true};
   if(message.type==='probe' && !state.paused) {
    try {
     const [result] = await chrome.scripting.executeScript({target:{tabId:state.tabId!},world:'MAIN',func:detectPlayer});
     const detection=result?.result;
     if(detection?.sample && validSample(detection.sample)) await save({...record(state,detection.sample),diagnostics:detection.diagnostics});
     else await save({...state,status:detection?.status || 'Player returned no usable metadata. Select the tab again.'});
    } catch { await save({...state,status:'Cannot read the selected player. Refresh the selected YouTube page, then select this tab again.'}); }
   }
   return {ok:true};
  }
  if(sender.url!==chrome.runtime.getURL('popup.html')) throw new Error('Unsupported sender');
  switch(message.type) {
   case 'state': return state;
   case 'select': {
    const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
    if(!tab?.id || !supported(tab.url)) throw new Error('Open YouTube Music or a YouTube watch page in the active tab, then select it here.');
    // Probe messages are queued after this operation, so selection is saved first.
    await chrome.scripting.executeScript({target:{tabId:tab.id},files:['observer.js']});
    const next={...state,tabId:tab.id,last:state.tabId===tab.id?state.last:null,lastRecorded:state.tabId===tab.id?state.lastRecorded:null,status:'Waiting for track information.',diagnostics:undefined};
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
chrome.tabs.onRemoved.addListener(id=>{queue=queue.then(async()=>{const s=await getState();if(s.tabId===id)await save({...s,tabId:null,last:null,lastRecorded:null,status:'Selected tab closed. Select a tab to continue.'});}).catch(()=>{});});
