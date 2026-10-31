import {test,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare,createFetchMock} from 'miniflare';
import {hash,MusicLog} from '../worker/index.js';
const extension='a'.repeat(32), origin='https://log.test', verifier='v'.repeat(64);
const fetchMock=createFetchMock();fetchMock.disableNetConnect();
const twitch=fetchMock.get('https://id.twitch.tv');
twitch.intercept({path:'/oauth2/token',method:'POST'}).reply(200,{access_token:'mock-twitch-token',refresh_token:'discarded-test-token'}).persist();
twitch.intercept({path:'/oauth2/validate',method:'GET'}).reply(200,{client_id:'test-client',user_id:'42',login:'broadcaster'}).persist();
twitch.intercept({path:'/oauth2/revoke',method:'POST'}).reply(200,{}).persist();
let mf;
beforeEach(()=>{mf=new Miniflare({modules:true,scriptPath:'worker/index.js',compatibilityDate:'2026-03-17',durableObjects:{LOG:{className:'MusicLog',useSQLite:true}},bindings:{TWITCH_CLIENT_ID:'test-client',TWITCH_CLIENT_SECRET:'test-only-not-a-secret',EXTENSION_ID:extension,PUBLIC_ORIGIN:origin},fetchMock});});
afterEach(()=>mf.dispose());
let ip=0;
async function request(path,options={}){return mf.dispatchFetch(origin+path,{...options,credentials:'omit',redirect:'manual',headers:{'CF-Connecting-IP':`192.0.2.${++ip}`,...options.headers}});}
const post=(data,session)=>({method:'POST',headers:{'Content-Type':'application/json',...(session?{Authorization:`Bearer ${session.token}`,'X-Channel-ID':session.channelId}:{})},body:JSON.stringify(data)});
async function auth(){
 const start=await request(`/oauth/start?challenge=${await hash(verifier)}`);assert.equal(start.status,302);
 const cookie=start.headers.get('set-cookie').split(';')[0],state=new URL(start.headers.get('location')).searchParams.get('state');
 const callback=await request(`/oauth/callback?code=twitch-code&state=${state}`,{headers:{Cookie:cookie}});assert.equal(callback.status,302);
 const location=new URL(callback.headers.get('location'));assert.equal(location.origin,`https://${extension}.chromiumapp.org`);
 const code=new URLSearchParams(location.hash.slice(1)).get('code');
 return {code,cookie,state};
}
async function session(){const {code}=await auth();const r=await request('/api/exchange',post({code,verifier}));assert.equal(r.status,200);return r.json();}
const play=()=>({id:crypto.randomUUID(),title:'<script>alert(1)</script>',artist:'Artist',kind:'youtube-music',source:'https://music.youtube.com/watch?v=abc&private=discard',observedAt:new Date().toISOString()});
test('OAuth binds state to browser, consumes state/code once, checks PKCE and channel identity',async()=>{
 const start=await request(`/oauth/start?challenge=${await hash(verifier)}`), state=new URL(start.headers.get('location')).searchParams.get('state');
 assert.equal((await request(`/oauth/callback?code=x&state=${state}`)).status,400);
 const {code,cookie,state:s}=await auth();
 assert.equal((await request(`/oauth/callback?code=x&state=${s}`,{headers:{Cookie:cookie}})).status,400);
 assert.equal((await request('/api/exchange',post({code,verifier:'x'.repeat(64)}))).status,401);
 const exchanged=await request('/api/exchange',post({code,verifier}));const c=await exchanged.json();assert.equal(c.channelId,'42');assert.equal(c.login,'broadcaster');
 assert.equal((await request('/api/exchange',post({code,verifier}))).status,401);
 assert.equal((await request('/api/plays',post(play(),{...c,channelId:'43'}))).status,401);
 assert.equal((await request('/api/approve',{...post({approval:'share-new-metadata-v1'},c),headers:{...post({},c).headers,Origin:'https://evil.test'}})).status,403);
});
test('explicit approval, strict metadata, safe public reads, deduplication and immediate revocation',async()=>{
 const c=await session();
 assert.equal((await request('/api/plays',post(play(),c))).status,403);
 assert.equal((await request('/api/approve',post({approved:true},c))).status,400);
 assert.equal((await request('/api/approve',post({approval:'share-new-metadata-v1'},c))).status,200);
 assert.equal((await request('/api/plays',post({...play(),channelId:'43'},c))).status,400);
 assert.equal((await request('/api/plays',post({...play(),kind:'youtube-video'},c))).status,400);
 const p=play();assert.equal((await request('/api/plays',post(p,c))).status,201);assert.equal((await request('/api/plays',post(p,c))).status,201);
 const publicData=await (await request('/api/recent/broadcaster')).json();assert.equal(publicData.plays.length,1);assert.equal(publicData.plays[0].source,'https://music.youtube.com/watch?v=abc');assert.equal(JSON.stringify(publicData).includes(c.token),false);
 const html=await request('/recent/broadcaster');assert.match(await html.text(),/&lt;script&gt;/);assert.equal(html.headers.get('cache-control'),'no-store');assert.match(html.headers.get('content-security-policy'),/frame-ancestors 'none'/);
 assert.equal((await request('/api/revoke',post({},c))).status,200);
 assert.deepEqual((await (await request('/api/recent/broadcaster')).json()).plays,[]);
 assert.equal((await request('/api/plays',post(play(),c))).status,401);
});
test('reauth invalidates old publishing session and requires fresh approval; limits writes',async()=>{
 const old=await session(),c=await session();assert.equal((await request('/api/approve',post({approval:'share-new-metadata-v1'},old))).status,401);
 assert.equal((await request('/api/plays',post(play(),c))).status,403);
 await request('/api/approve',post({approval:'share-new-metadata-v1'},c));
 for(let i=0;i<12;i++)assert.equal((await request('/api/plays',post(play(),c))).status,201);
 assert.equal((await request('/api/plays',post(play(),c))).status,429);
 for(let i=0;i<120;i++)await request('/api/recent/broadcaster',{headers:{'CF-Connecting-IP':'198.51.100.99'}});
 assert.equal((await request('/api/recent/broadcaster',{headers:{'CF-Connecting-IP':'198.51.100.99'}})).status,429);
 assert.equal((await request('/api/revoke',{...post({},c),headers:{...post({},c).headers,'CF-Connecting-IP':'198.51.100.99'}})).status,200);
 assert.deepEqual((await (await request('/api/recent/broadcaster')).json()).plays,[]);
});
test('short retention excludes old plays, caps at 50, and alarm physically removes expired records',async()=>{
 const rows=new Map(),storage={get:async k=>rows.get(k),put:async(k,v)=>rows.set(k,v),delete:async k=>{for(const x of Array.isArray(k)?k:[k])rows.delete(x);},list:async()=>new Map(rows),getAlarm:async()=>1,setAlarm:async()=>{}};
 const app=new MusicLog({storage,blockConcurrencyWhile:fn=>fn()},{});
 const token='a'.repeat(64),channel={login:'broadcaster',approved:true,tokenHash:await hash(token),expires:Date.now()+60000,plays:[{...play(),observedAt:new Date(Date.now()-86400001).toISOString()}]};
 rows.set('channel:42',channel);rows.set('login:broadcaster',{id:'42',expires:Date.now()+60000});
 const req=(path,options={})=>app.fetch(new Request(origin+path,options));
 assert.deepEqual((await (await req('/api/recent/broadcaster')).json()).plays,[]);
 await app.alarm();assert.equal(rows.get('channel:42').plays.length,0);
 channel.plays=Array.from({length:60},()=>play());rows.set('channel:42',channel);
 assert.equal((await (await req('/api/recent/broadcaster')).json()).plays.length,50);
 channel.expires=Date.now()-1;rows.set('channel:42',channel);
 assert.equal((await req('/api/session',{headers:post({},{token,channelId:'42'}).headers})).status,401);
 rows.set('oauth:expired',{expires:Date.now()-1});await app.alarm();assert.equal(rows.has('oauth:expired'),false);
});
test('request size, malformed JSON and IP limits fail closed',async()=>{
 assert.equal((await request('/api/exchange',{method:'POST',headers:{'Content-Type':'application/json'},body:'x'.repeat(4097)})).status,413);
 assert.equal((await request('/api/exchange',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'})).status,400);
 assert.equal((await request('/api/exchange',{method:'POST',body:'{}'})).status,415);
 for(let i=0;i<120;i++)assert.equal((await request('/api/recent/unknown',{headers:{'CF-Connecting-IP':'198.51.100.1'}})).status,200);
 assert.equal((await request('/api/recent/unknown',{headers:{'CF-Connecting-IP':'198.51.100.1'}})).status,429);
});
