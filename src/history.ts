export interface Track { title: string; artist: string; source: string; kind?: 'youtube-music' | 'youtube-video'; channel?: string }
export interface Sample extends Track { playing: boolean; position: number; duration: number; ended: boolean; playbackCycle?: string }
export interface Entry extends Track { observedAt: string; id: string }
export type RecordedPlayback = Track & { playbackCycle?: string };
export interface State { history: Entry[]; paused: boolean; tabId: number | null; last: Sample | null; status: string; diagnostics?: string; lastRecorded?: RecordedPlayback | null }
export const initialState = (): State => ({history:[], paused:false, tabId:null,last:null,status:'Choose a YouTube Music or YouTube tab to begin.'});
export function validSample(value: unknown): value is Sample {
 if (!value || typeof value !== 'object') return false;
 const s = value as Sample;
 const nonempty=(x: unknown): x is string=>typeof x==='string' && x.trim().length>0 && x.length<=500;
 try {
  const u=new URL(s.source);
  if(u.pathname!=='/watch' || !/^[A-Za-z0-9_-]{1,128}$/.test(u.searchParams.get('v') || ''))return false;
  if(u.origin==='https://music.youtube.com') {
   if((s.kind!==undefined && s.kind!=='youtube-music') || !nonempty(s.artist) || s.channel!==undefined)return false;
  } else if(['https://www.youtube.com','https://youtube.com'].includes(u.origin)) {
   if(s.kind!=='youtube-video' || s.artist!=='' || !nonempty(s.channel))return false;
  } else return false;
 } catch {return false;}
 return nonempty(s.title) && typeof s.playing==='boolean' && typeof s.ended==='boolean' && (s.playbackCycle===undefined || (typeof s.playbackCycle==='string' && s.playbackCycle.length<=100)) && Number.isFinite(s.position) && s.position>=0 && Number.isFinite(s.duration) && s.duration>=0;
}
export function record(state: State, s: Sample, now = new Date().toISOString()): State {
 if(state.paused) return state;
 const previous = state.last;
 // Keep the last observed sample separate from the last recorded playback.
 // Buffering probes must not consume a cycle that has not reached history.
 let lastRecorded=state.lastRecorded===undefined?previous:state.lastRecorded;
 const changed = !lastRecorded || lastRecorded.source!==s.source || lastRecorded.title!==s.title || lastRecorded.artist!==s.artist || lastRecorded.channel!==s.channel;
 // Event-derived cycle tokens survive gaps in one-second polling. Only compare
 // tokens from the same observer session; reinjection is not another play.
 const oldCycle=lastRecorded?.playbackCycle?.split(':');
 const newCycle=s.playbackCycle?.split(':');
 const cycleChanged=oldCycle && newCycle && oldCycle[0]===newCycle[0] && Number(newCycle[1])>Number(oldCycle[1]);
 const repeat = s.playing && (cycleChanged || (previous?.ended && s.position < 3));
 let history = state.history;
 if(s.playing && (changed || repeat)) {
  history = [...history,{title:s.title,artist:s.artist,source:s.source,kind:s.kind,channel:s.channel,observedAt:now,id:crypto.randomUUID()}].slice(-300);
  lastRecorded={title:s.title,artist:s.artist,source:s.source,kind:s.kind,channel:s.channel,playbackCycle:s.playbackCycle};
 } else if(!changed && newCycle && (!oldCycle || oldCycle[0]!==newCycle[0])) {
  // A new observer session establishes a baseline, not an extra play. Future
  // cycle increments in that session must still be eligible for recording.
  lastRecorded={...lastRecorded!,playbackCycle:s.playbackCycle};
 }
 // Do not consume a new track while it is paused/buffering before first playback.
 const last = !s.playing && changed ? previous : s;
 return {...state,history,last,lastRecorded,status:s.playing?(s.kind==='youtube-video'?'Recording the selected YouTube video.':'Listening to the selected tab.'):'Playback paused or buffering.'};
}
