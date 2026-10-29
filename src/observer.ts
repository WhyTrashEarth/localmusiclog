(() => {
 const scope = globalThis as typeof globalThis & { localMusicLogStop?: () => void };
 // Reselecting always replaces the old observer, including one that stopped.
 scope.localMusicLogStop?.();
 let stopped = false;
 let pending = false;
 const stop = () => { stopped=true; clearInterval(timer); };
 const sample = async () => {
  if(stopped || pending) return;
  pending=true;
  try { const response=await chrome.runtime.sendMessage({type:'probe'}); if(response?.stop)stop(); }
  catch { stop(); }
  finally { pending=false; }
 };
 const timer=setInterval(()=>void sample(),1000);
 scope.localMusicLogStop=stop;
 void sample();
})();
