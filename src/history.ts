export interface Track { title: string; artist: string; source: string }
export interface Sample extends Track { playing: boolean; position: number; duration: number; ended: boolean; playbackCycle?: string }
export interface Entry extends Track { observedAt: string; id: string }
export interface State { history: Entry[]; paused: boolean; tabId: number | null; last: Sample | null; status: string; diagnostics?: string }
export const initialState = (): State => ({history:[], paused:false, tabId:null,last:null,status:'Choose a YouTube Music tab to begin.'});
export function validSample(value: unknown): value is Sample {
 if (!value || typeof value !== 'object') return false;
 const s = value as Sample;
 try { const u = new URL(s.source); if(u.origin !== 'https://music.youtube.com' || u.pathname !== '/watch' || !u.searchParams.get('v')) return false; } catch { return false; }
 return [s.title,s.artist].every(x=>typeof x==='string' && x.trim().length>0 && x.length<=500) && typeof s.playing==='boolean' && typeof s.ended==='boolean' && (s.playbackCycle===undefined || (typeof s.playbackCycle==='string' && s.playbackCycle.length<=100)) && Number.isFinite(s.position) && s.position>=0 && Number.isFinite(s.duration) && s.duration>=0;
}
export function record(state: State, s: Sample, now = new Date().toISOString()): State {
 if(state.paused) return state;
 const previous = state.last;
 const changed = !previous || previous.source!==s.source || previous.title!==s.title || previous.artist!==s.artist;
 // Event-derived cycle tokens survive gaps in one-second polling. Only compare
 // tokens from the same observer session; reinjection is not another play.
 const oldCycle=previous?.playbackCycle?.split(':');
 const newCycle=s.playbackCycle?.split(':');
 const cycleChanged=oldCycle && newCycle && oldCycle[0]===newCycle[0] && Number(newCycle[1])>Number(oldCycle[1]);
 const repeat = s.playing && (cycleChanged || (previous?.ended && s.position < 3));
 let history = state.history;
 if(s.playing && (changed || repeat)) history = [...history,{title:s.title,artist:s.artist,source:s.source,observedAt:now,id:crypto.randomUUID()}].slice(-300);
 // Do not consume a new track while it is paused/buffering before first playback.
 const last = !s.playing && changed ? previous : s;
 return {...state,history,last,status:s.playing?'Listening to the selected tab.':'Playback paused or buffering.'};
}
