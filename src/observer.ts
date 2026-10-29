(() => {
 const scope = globalThis as typeof globalThis & { localMusicLogObserver?: boolean };
 if(scope.localMusicLogObserver) return;
 scope.localMusicLogObserver = true;
 let stopped = false;
 const sample = () => {
  if(stopped) return;
  const player = document.querySelector('ytmusic-player-bar');
  const title = player?.querySelector('.title')?.textContent?.trim();
  // Use an explicit artist link, never infer the artist from album or tab text.
  const artist = player?.querySelector('a[href^="channel/"], a[href^="/channel/"], a[href*="music.youtube.com/channel/"]')?.textContent?.trim();
  const media = document.querySelector<HTMLVideoElement>('video');
  const link = player?.querySelector<HTMLAnchorElement>('a[href*="watch?v="]');
  let source: string | null = null;
  try { const u = new URL(link?.href || location.href); const id = u.searchParams.get('v'); if(id && u.pathname==='/watch') source = `https://music.youtube.com/watch?v=${encodeURIComponent(id)}`; } catch {}
  const message = title && artist && source && media ? {type:'sample',sample:{title,artist,source,playing:!media.paused && !media.ended && media.readyState>=2,position:media.currentTime,duration:Number.isFinite(media.duration)?media.duration:0,ended:media.ended}} : {type:'waiting'};
  chrome.runtime.sendMessage(message).then(response => { if(response?.stop) { stopped=true; scope.localMusicLogObserver=false; clearInterval(timer); } }).catch(()=>{stopped=true;scope.localMusicLogObserver=false;clearInterval(timer);});
 };
 const timer = setInterval(sample,1000);
 sample();
})();
