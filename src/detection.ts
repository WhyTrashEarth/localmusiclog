import type { Sample } from './history.js';
export interface Detection { sample: Sample | null; status: string }
// Executed in the selected page's MAIN world by chrome.scripting. Keep this
// function self-contained: browser serialization does not retain module scope.
export function detectPlayer(): Detection {
 const bar = document.querySelector('ytmusic-player-bar');
 const media = document.querySelector<HTMLMediaElement>('ytmusic-player video, #movie_player video, video');
 type VideoData = { video_id?: string; title?: string; author?: string; is_ad?: boolean };
 const player = document.querySelector('#movie_player') as (Element & { getVideoData?: () => VideoData; getAdState?: () => number }) | null;
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
 const playing = !media!.paused && !media!.ended && media!.readyState>=2;
 return {sample:{title,artist,source:`https://music.youtube.com/watch?v=${videoId}`,playing,position:media!.currentTime,duration:Number.isFinite(media!.duration)?media!.duration:0,ended:media!.ended},status:playing?'Listening to the selected tab.':'Playback paused or buffering.'};
}
