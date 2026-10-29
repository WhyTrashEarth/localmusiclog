import type { Sample } from './history.js';
export interface Detection { sample: Sample | null; status: string; diagnostics?: string }
// Executed in the selected page's MAIN world by chrome.scripting. Keep this
// function self-contained: browser serialization does not retain module scope.
export function detectPlayer(): Detection {
 const bar = document.querySelector('ytmusic-player-bar');
 const media = document.querySelector<HTMLMediaElement>('ytmusic-player video, #movie_player video, video');
 type VideoData = { video_id?: string; title?: string; author?: string; is_ad?: boolean };
 const player = document.querySelector('#movie_player') as (Element & { getVideoData?: () => VideoData; getCurrentTime?: () => number; getDuration?: () => number; getPlayerResponse?: () => { videoDetails?: {videoId?: string; lengthSeconds?: string | number} } }) | null;
 let data: VideoData | undefined;
 try { data = player?.getVideoData?.(); } catch { /* DOM fallback below */ }
 if (data?.is_ad || document.querySelector('#movie_player.ad-showing')) return {sample:null,status:'Advertisement detected. Waiting for music.'};
 const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
 const metadata = navigator.mediaSession?.metadata;
 const title = text(data?.title) || text(bar?.querySelector('.title')?.textContent) || text(metadata?.title);
 // YouTube Music artist links may use /browse/ rather than /channel/.
 const artistLink = bar?.querySelector('a[href*="channel/"], .byline a[href*="browse/"], .subtitle a[href*="browse/"]');
 const artist = text(data?.author) || text(artistLink?.textContent) || text(metadata?.artist);
 let videoId = text(data?.video_id);
 if(!videoId) {
  const link = bar?.querySelector<HTMLAnchorElement>('a[href*="watch?v="], a[href*="watch?"][href*="v="]');
  try {
   const url = new URL(link?.href || location.href,location.href);
   if(url.origin==='https://music.youtube.com' && url.pathname==='/watch') videoId=text(url.searchParams.get('v'));
  } catch { /* Missing identity must not produce a fabricated track. */ }
 }
 const missing = [!bar && 'player bar',!title && 'title',!artist && 'artist',!videoId && 'track ID',!media && 'playback element'].filter(Boolean);
 if(missing.length) return {sample:null,status:`Waiting for ${missing.join(', ')}. No track recorded.`};
 if(!/^[A-Za-z0-9_-]{1,128}$/.test(videoId)) return {sample:null,status:'Waiting for a valid track ID. No track recorded.'};
 // MediaSource duration may describe a growing stream rather than the song.
 // Prefer identity-matched full-track metadata and the player's playback clock.
 const timing=()=>{
  let position=media!.currentTime, duration=0, durationSource='unknown', clockSource='media';
  try {const value=player?.getCurrentTime?.();if(typeof value==='number' && Number.isFinite(value) && value>=0){position=value;clockSource='player';}} catch {}
  try {
   const details=player?.getPlayerResponse?.()?.videoDetails;
   const length=Number(details?.lengthSeconds);
   const currentId=text(player?.getVideoData?.()?.video_id) || videoId;
   if(details?.videoId===currentId && Number.isFinite(length) && length>0){duration=length;durationSource='track metadata';}
  } catch {}
  if(!duration)try {const value=player?.getDuration?.();if(typeof value==='number' && Number.isFinite(value) && value>0){duration=value;durationSource='player';}} catch {}
  if(!duration && Number.isFinite(media!.duration) && media!.duration>0){duration=media!.duration;durationSource='media fallback';}
  return {position,duration,durationSource,clockSource};
 };
 const observed=timing();
 // Install event listeners once per media element. Polling alone can miss the
 // ended → playing transition entirely, especially with repeat-one enabled.
 type CycleTracker = { version: number; sample: () => void; media: HTMLMediaElement; token: string; cycle: number; source: string; endedSource: string | null; position: number; time: number; wasPlaying: boolean; inputAt: number; lastEvent: string; restartReason: string; dispose: () => void };
 const scope=globalThis as typeof globalThis & { __localMusicLogCycle?: CycleTracker };
 let tracker=scope.__localMusicLogCycle;
 if(tracker?.media!==media || tracker?.version!==5) {
  const previous=tracker;
  previous?.dispose?.();
  const compatible=previous?.source===videoId && typeof previous?.token==='string';
  const t: CycleTracker={version:5,sample:()=>{},media:media!,token:compatible?previous.token:crypto.randomUUID(),cycle:compatible?previous.cycle:0,source:videoId,endedSource:compatible?previous.endedSource:null,position:compatible?previous.position:observed.position,time:compatible?previous.time:performance.now(),wasPlaying:compatible?previous.wasPlaying:false,inputAt:compatible?previous.inputAt:-Infinity,lastEvent:'attached v5',restartReason:'none observed',dispose:()=>{}};
  const identity=()=>{
   try { return text(player?.getVideoData?.()?.video_id) || t.source; } catch { return t.source; }
  };
  const input=()=>{t.inputAt=performance.now();};
  const ended=(event: Event)=>{if(event.target===t.media){t.endedSource=identity();t.lastEvent='ended';}};
  const update=(event: Event)=>{
   if(event.type!=='probe')t.lastEvent=event.type;
   const now=performance.now(), {position,duration}=timing(), id=identity();
   const active=!t.media.paused && !t.media.ended;
   const elapsed=(now-t.time)/1000;
   const same=id===t.source;
   const restarted=same && t.endedSource===id && active && position<3;
   // Sites may implement repeat by seeking instead of setting media.loop.
   // Recognize only a rewind at the predicted finish time, without recent user
   // input. A transient pause/seeking state must not consume that evidence.
   // Programmatic seeks timed exactly at completion are inherently ambiguous.
   const remaining=duration-t.position;
   const wrapped=same && t.wasPlaying &&
    Number.isFinite(duration) && duration>0 && position<t.position && position<Math.min(2,duration/2) &&
    remaining>=0 && remaining<Math.min(1,duration/2) && elapsed>0 && elapsed<2 &&
    remaining<=elapsed*t.media.playbackRate+0.05 && now-t.inputAt>1500;
   if(wrapped)t.endedSource=id;
   if(restarted || (wrapped && active)) {t.cycle++;t.endedSource=null;t.restartReason=wrapped?'end-boundary rewind':'completion then playback';}
   if(!same)t.endedSource=null;
   t.source=id;t.position=position;t.time=now;t.wasPlaying=active;
  };
  t.sample=()=>update({type:'probe'} as Event);
  for(const event of ['timeupdate','playing','pause','seeking','seeked'])media!.addEventListener(event,update);
  document.addEventListener('ended',ended,true);
  for(const event of ['pointerdown','keydown'])document.addEventListener(event,input,true);
  t.dispose=()=>{
   for(const event of ['timeupdate','playing','pause','seeking','seeked'])t.media.removeEventListener(event,update);
   document.removeEventListener('ended',ended,true);
   for(const event of ['pointerdown','keydown'])document.removeEventListener(event,input,true);
  };
  scope.__localMusicLogCycle=t;tracker=t;
 }
 tracker.sample();
 // Reconcile a track change even if no media event fired during that transition.
 if(tracker.source!==videoId){tracker.source=videoId;tracker.endedSource=null;}
 const playing = !media!.paused && !media!.ended && media!.readyState>=2;
 return {sample:{title,artist,source:`https://music.youtube.com/watch?v=${videoId}`,playing,position:observed.position,duration:observed.duration,ended:media!.ended,playbackCycle:`${tracker.token}:${tracker.cycle}`},status:playing?'Listening to the selected tab.':'Playback paused or buffering.',diagnostics:`Tracker v${tracker.version} · Position ${observed.position.toFixed(1)} / ${observed.duration?observed.duration.toFixed(1):'?'} seconds · Clock ${observed.clockSource} · Duration ${observed.durationSource} · Raw media duration ${Number.isFinite(media!.duration)?media!.duration.toFixed(1):'?'} · Native loop ${media!.loop?'on':'off'} · Restarts ${tracker.cycle} · Last event ${tracker.lastEvent} · ${tracker.restartReason}`};
}
