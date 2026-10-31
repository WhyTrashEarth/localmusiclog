import {test} from 'node:test';
import assert from 'node:assert/strict';
let sharing, sharingError='',requests=[],failRevoke=false;
globalThis.chrome={
 storage:{session:{get:async()=>({sharing}),set:async v=>{sharing=v.sharing;},remove:async()=>{sharing=undefined;}},local:{get:async()=>({sharingError}),set:async v=>{sharingError=v.sharingError;}}},
 permissions:{contains:async()=>true},identity:{getRedirectURL:()=>`https://${'a'.repeat(32)}.chromiumapp.org/`,launchWebAuthFlow:async ({url})=>{assert.equal(new URL(url).searchParams.get('challenge').length,43);return `https://${'a'.repeat(32)}.chromiumapp.org/#code=single-use-code`;}}
};
globalThis.fetch=async(url,options)=>{
 requests.push({url,options});
 assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');
 if(url.endsWith('/api/exchange')){assert.equal(JSON.parse(options.body).verifier.length,64);return Response.json({token:'runtime-capability',channelId:'42',login:'broadcaster',expiresAt:Date.now()+60000});}
 if(url.endsWith('/api/revoke') && failRevoke)throw Error('Offline');
 return Response.json({ok:true});
};
const {publishNew,connectSharing,approveSharing,revokeSharing,sharingStatus}=await import('../dist/sharing.js');
const entry={title:'A',artist:'B',source:'https://music.youtube.com/watch?v=abc',id:crypto.randomUUID(),observedAt:new Date().toISOString()};
test('local-only makes no requests; OAuth connection is distinct from approval; only new explicitly supplied plays publish',async()=>{
 await publishNew(entry);assert.equal(requests.length,0);
 await assert.rejects(connectSharing('http://insecure.test'));
 await connectSharing('https://log.test');assert.equal(requests.length,1);assert.equal((await sharingStatus()).approved,false);
 assert.equal('token' in await sharingStatus(),false);
 await publishNew(entry);assert.equal(requests.length,1);
 await approveSharing();assert.deepEqual(JSON.parse(requests.at(-1).options.body),{approval:'share-new-metadata-v1'});
 await publishNew(entry);assert.equal(requests.at(-1).url,'https://log.test/api/plays');assert.equal(JSON.parse(requests.at(-1).options.body).kind,'youtube-music');
 sharing.expiresAt=Date.now()-1;const n=requests.length;await publishNew(entry);assert.equal(requests.length,n);
 sharing.expiresAt=Date.now()+60000;
});
test('failed remote revoke stops uploads locally and preserves retry capability; retry removes session',async()=>{
 failRevoke=true;await assert.rejects(revokeSharing());assert.equal(sharing.approved,false);
 const n=requests.length;await publishNew(entry);assert.equal(requests.length,n);
 failRevoke=false;await revokeSharing();assert.equal(sharing,undefined);
 await publishNew(entry);assert.equal(requests.length,n+1);
});

test('already expired remote session can be disconnected without trapping the user',async()=>{
 await connectSharing('https://log.test');
 const prior=globalThis.fetch;globalThis.fetch=async()=>new Response('{}',{status:401});
 try{await revokeSharing();assert.equal(sharing,undefined);}finally{globalThis.fetch=prior;}
});
