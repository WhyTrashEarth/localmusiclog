const HOUR = 3600000, DAY = 24 * HOUR;
const headers = {'Cache-Control':'no-store', 'Referrer-Policy':'no-referrer', 'X-Content-Type-Options':'nosniff', 'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"};
const json = (data, status=200) => new Response(JSON.stringify(data), {status,headers:{...headers,'Content-Type':'application/json'}});
const fail = (status,message) => { throw Object.assign(new Error(message),{status}); };
const random = () => [...crypto.getRandomValues(new Uint8Array(32))].map(x=>x.toString(16).padStart(2,'0')).join('');
export async function hash(s) {return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');}
async function body(r) {
 if(!r.headers.get('Content-Type')?.startsWith('application/json')) fail(415,'JSON required');
 const reader=r.body?.getReader(); let bytes=0, chunks=[];
 if(reader) {while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>4096){await reader.cancel();fail(413,'Request too large');}chunks.push(value);}}
 try {const data=JSON.parse(new TextDecoder().decode(Uint8Array.from(chunks.flatMap(v=>[...v]))));if(!data || typeof data!=='object' || Array.isArray(data))throw Error();return data;}catch{fail(400,'Invalid JSON');}
}
const escape = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function page(channel,plays) {
 return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Recent plays · Local Music Log</title><style>body{font:1rem system-ui;max-width:48rem;margin:3rem auto;padding:1rem}li{margin:1.5rem 0}small{display:block}</style><h1>${escape(channel)} · Recent plays</h1><p>Broadcaster-shared metadata, not verified music credits. Newest 50 plays from the last 24 hours. Refresh for updates.</p><ol>${plays.map(p=>`<li><strong>${escape(p.title)}</strong><small>${escape(p.kind==='youtube-video'?`YouTube video · Channel: ${p.channel}`:`YouTube Music · ${p.artist}`)}</small><small>${escape(p.observedAt)}</small><a href="${escape(p.source)}" rel="noreferrer">Source</a></li>`).join('')}</ol>${plays.length?'':'<p>No shared plays.</p>'}<p>No viewer login or tracking. Revocation removes this list.</p></html>`,{headers:{...headers,'Content-Type':'text/html; charset=utf-8'}});
}
export default {async fetch(request,env) {
 const url=new URL(request.url);
 if(url.protocol!=='https:' && !['127.0.0.1','localhost'].includes(url.hostname))return json({error:'HTTPS required'},400);
 if(url.pathname==='/health') return json({ok:true});
 // A single coordinator gives OAuth consumption, rate limits and revocation linear ordering.
 return env.LOG.get(env.LOG.idFromName('coordinator')).fetch(request);
}};
export class MusicLog {
 constructor(ctx,env){this.ctx=ctx;this.env=env;this.store=ctx.storage;}
 async fetch(r){return this.ctx.blockConcurrencyWhile(async()=>{
  try{return await this.handle(r);}catch(e){return json({error:e.status?e.message:'Request failed'},e.status || 502);}
 });}
 async put(key,value,ttl){await this.store.put(key,{...value,expires:Date.now()+ttl});if(!await this.store.getAlarm())await this.store.setAlarm(Date.now()+60000);}
 async get(key){const value=await this.store.get(key);if(value && value.expires<=Date.now()){await this.store.delete(key);return undefined;}return value;}
 async alarm(){const rows=await this.store.list();for(const [key,value] of rows){if(value.expires<=Date.now())await this.store.delete(key);else if(key.startsWith('channel:')){value.plays=value.plays.filter(p=>Date.parse(p.observedAt)>Date.now()-DAY);await this.store.put(key,value);}}if((await this.store.list({limit:1})).size)await this.store.setAlarm(Date.now()+60000);}
 async limit(key,max,ms){const k=`rate:${key}:${Math.floor(Date.now()/ms)}`,v=await this.get(k);if((v?.count || 0)>=max)fail(429,'Rate limit exceeded');await this.put(k,{count:(v?.count || 0)+1},ms*2);}
 configured(){if(!this.env.TWITCH_CLIENT_ID || !this.env.TWITCH_CLIENT_SECRET || !/^[a-p]{32}$/.test(this.env.EXTENSION_ID || '') || !this.env.PUBLIC_ORIGIN?.startsWith('https://'))fail(503,'OAuth is not configured');}
 async twitch(path,options){return fetch(`https://id.twitch.tv/oauth2/${path}`,{...options,signal:AbortSignal.timeout(5000)});}
 async handle(r){
 const u=new URL(r.url),path=u.pathname;
 // Browsers cannot use cookies or ambient authorization for any mutation.
 if(r.headers.has('Origin') && r.headers.get('Origin')!==`chrome-extension://${this.env.EXTENSION_ID}`)fail(403,'Origin rejected');
 const ip=await hash(r.headers.get('CF-Connecting-IP') || 'local');
 if(path!=='/api/revoke')await this.limit(`ip:${ip}`,120,60000);
 if(path==='/oauth/start' && r.method==='GET'){
  this.configured();await this.limit(`oauth:${ip}`,10,60000);
  const challenge=u.searchParams.get('challenge');if(!/^[A-Za-z0-9_-]{43}$/.test(challenge || ''))fail(400,'PKCE challenge required');
  const state=random(),binding=random();
  await this.put(`oauth:${state}`,{challenge,binding:await hash(binding)},600000);
  const dest=new URL('https://id.twitch.tv/oauth2/authorize');
  dest.search=new URLSearchParams({client_id:this.env.TWITCH_CLIENT_ID,redirect_uri:`${this.env.PUBLIC_ORIGIN}/oauth/callback`,response_type:'code',scope:'',state,force_verify:'true'}).toString();
  return new Response(null,{status:302,headers:{...headers,Location:dest.href,'Set-Cookie':`oauth_binding=${binding}; Secure; HttpOnly; SameSite=Lax; Path=/oauth; Max-Age=600`}});
 }
 if(path==='/oauth/callback' && r.method==='GET'){
  this.configured();const state=u.searchParams.get('state') || '', pending=await this.get(`oauth:${state}`);
  const binding=r.headers.get('Cookie')?.match(/(?:^|;\s*)oauth_binding=([a-f0-9]{64})(?:;|$)/)?.[1];
  if(!pending || !binding || pending.binding!==await hash(binding))fail(400,'Invalid OAuth state');
  await this.store.delete(`oauth:${state}`);
  if(u.searchParams.has('error') || !u.searchParams.get('code'))fail(400,'Twitch authorization cancelled');
  const response=await this.twitch('token',{method:'POST',body:new URLSearchParams({client_id:this.env.TWITCH_CLIENT_ID,client_secret:this.env.TWITCH_CLIENT_SECRET,code:u.searchParams.get('code'),grant_type:'authorization_code',redirect_uri:`${this.env.PUBLIC_ORIGIN}/oauth/callback`})});
  if(!response.ok)fail(502,'Twitch token exchange failed');const tokens=await response.json();
  if(typeof tokens.access_token!=='string')fail(502,'Invalid Twitch token');
  let identity;
  try {const valid=await this.twitch('validate',{headers:{Authorization:`OAuth ${tokens.access_token}`}});if(!valid.ok)fail(401,'Twitch validation failed');identity=await valid.json();}
  finally {try {await this.twitch('revoke',{method:'POST',body:new URLSearchParams({client_id:this.env.TWITCH_CLIENT_ID,token:tokens.access_token})});}catch{/* Never retain upstream tokens, including on failed revocation. */}}
  if(identity.client_id!==this.env.TWITCH_CLIENT_ID || !/^\d+$/.test(identity.user_id || '') || !/^[a-z0-9_]{1,25}$/.test(identity.login || ''))fail(401,'Invalid Twitch identity');
  const code=random();await this.put(`code:${await hash(code)}`,{challenge:pending.challenge,id:identity.user_id,login:identity.login},60000);
  return new Response(null,{status:302,headers:{...headers,Location:`https://${this.env.EXTENSION_ID}.chromiumapp.org/#code=${code}`,'Set-Cookie':'oauth_binding=; Secure; HttpOnly; SameSite=Lax; Path=/oauth; Max-Age=0'}});
 }
 if(path==='/api/exchange' && r.method==='POST'){
  const b=await body(r),key=`code:${await hash(String(b.code))}`,code=await this.get(key);
  if(!code || typeof b.verifier!=='string' || !/^[A-Za-z0-9_-]{43,128}$/.test(b.verifier) || code.challenge!==await hash(b.verifier))fail(401,'Invalid exchange');
  await this.store.delete(key);
  const token=random();await this.put(`channel:${code.id}`,{login:code.login,tokenHash:await hash(token),approved:false,plays:[]},7*DAY);
  return json({token,channelId:code.id,login:code.login,expiresAt:Date.now()+7*DAY});
 }
 const publicMatch=path.match(/^\/(?:api\/recent|recent)\/([a-z0-9_]{1,25})$/);
 if(publicMatch && r.method==='GET'){
  // IDs are indexed by login only for public discovery; no credentials or history outside retention leave storage.
  const index=await this.get(`login:${publicMatch[1]}`),c=index?await this.get(`channel:${index.id}`):undefined;
  const plays=c?.approved && c.login===publicMatch[1]?c.plays.filter(p=>Date.parse(p.observedAt)>Date.now()-DAY).slice(-50).reverse():[];
  return path.startsWith('/api/')?json({plays}):page(publicMatch[1],plays);
 }
 if(['/api/approve','/api/revoke','/api/plays','/api/session'].includes(path)){
  const token=r.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  const id=r.headers.get('X-Channel-ID');if(!token || !/^\d+$/.test(id || ''))fail(401,'Authentication required');
  const key=`channel:${id}`,c=await this.get(key);if(!c || c.tokenHash!==await hash(token)){if(path==='/api/revoke')await this.limit(`ip:${ip}`,120,60000);fail(401,'Session expired or revoked');}
  if(path==='/api/revoke' && r.method==='POST'){await this.store.delete([key,`login:${c.login}`]);return json({revoked:true});}
  if(path==='/api/session' && r.method==='GET')return json({login:c.login,approved:c.approved,expiresAt:c.expires});
  if(path==='/api/approve' && r.method==='POST'){
   const b=await body(r);if(b.approval!=='share-new-metadata-v1' || Object.keys(b).length!==1)fail(400,'Explicit metadata approval required');
   c.approved=true;await this.store.put(key,c);await this.put(`login:${c.login}`,{id},7*DAY);return json({approved:true});
  }
  if(path==='/api/plays' && r.method==='POST'){
   if(!c.approved)fail(403,'Sharing approval required');await this.limit(`publish:${id}`,12,60000);
   const b=await body(r),allowed=['id','title','artist','channel','kind','source','observedAt'];
   if(Object.keys(b).some(k=>!allowed.includes(k)))fail(400,'Unexpected metadata');
   const text=x=>typeof x==='string' && x.trim().length>0 && x.length<=500 && !/[\u0000-\u001f]/.test(x);
   if(!/^[a-f0-9-]{36}$/.test(b.id || '') || !text(b.title) || !text(b.observedAt) || Math.abs(Date.now()-Date.parse(b.observedAt))>300000 || !Number.isFinite(Date.parse(b.observedAt)))fail(400,'Invalid play');
   let source;try{source=new URL(b.source);}catch{fail(400,'Invalid source');}
   if(source.pathname!=='/watch' || !/^[A-Za-z0-9_-]{1,128}$/.test(source.searchParams.get('v') || ''))fail(400,'Invalid source');
   if(b.kind==='youtube-music'){if(source.origin!=='https://music.youtube.com' || !text(b.artist) || b.channel!==undefined)fail(400,'Invalid music metadata');}
   else if(b.kind==='youtube-video'){if(!['https://www.youtube.com','https://youtube.com'].includes(source.origin) || b.artist!=='' || !text(b.channel))fail(400,'Invalid video metadata');}
   else fail(400,'Invalid source kind');
   const play={id:b.id,title:b.title,artist:b.artist,kind:b.kind,...(b.channel?{channel:b.channel}:{}),source:`${source.origin}/watch?v=${source.searchParams.get('v')}`,observedAt:new Date().toISOString()};
   c.plays=c.plays.filter(p=>Date.parse(p.observedAt)>Date.now()-DAY);
   if(!c.plays.some(p=>p.id===play.id))c.plays.push(play);c.plays=c.plays.slice(-50);await this.store.put(key,c);return json({ok:true},201);
  }
  fail(405,'Method not allowed');
 }
 return json({error:'Not found'},404);
 }
}
