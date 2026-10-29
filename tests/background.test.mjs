import {test} from 'node:test';
import assert from 'node:assert/strict';
let listener,state,result,fail=false,calls=0;
globalThis.chrome={
 storage:{local:{get:async()=>({state}),set:async value=>{state=value.state;}}},
 runtime:{getURL:path=>`chrome-extension://test/${path}`,onMessage:{addListener:fn=>{listener=fn;}}},
 tabs:{query:async()=>[{id:7,url:'https://music.youtube.com/playlist?list=album'}],onRemoved:{addListener:()=>{}}},
 scripting:{executeScript:async options=>{
  if(options.files)return [];
  calls++;assert.equal(options.world,'MAIN');assert.equal(options.target.tabId,7);
  if(fail)throw Error('permission revoked');return [{result}];
 }}
};
await import('../dist/background.js');
const popup={url:'chrome-extension://test/popup.html'};
const tab={url:'https://music.youtube.com/playlist?list=album',tab:{id:7}};
const send=(message,sender=popup)=>new Promise(resolve=>listener(message,sender,resolve));
test('selection → probe → storage → pause → diagnostics',async()=>{
 await send({type:'select'});assert.equal(state.tabId,7);
 result={sample:{title:'Big Wheels',artist:'Electric Light Orchestra',source:'https://music.youtube.com/watch?v=abc',playing:true,position:10,duration:300,ended:false},status:'Playing'};
 await send({type:'probe'},tab);assert.equal(state.history.length,1);
 await send({type:'probe'},tab);assert.equal(state.history.length,1);
 const before=calls;
 assert.equal((await send({type:'probe'},{...tab,tab:{id:8}})).stop,true);assert.equal(calls,before);
 await send({type:'pause'});await send({type:'probe'},tab);assert.equal(calls,before);
 await send({type:'pause'});result={sample:null,status:'Waiting for artist. No track recorded.'};
 await send({type:'probe'},tab);assert.match(state.status,/artist/);assert.equal(state.history.length,1);
 fail=true;await send({type:'probe'},tab);assert.match(state.status,/Cannot read/);
 fail=false;
 const base={title:'Big Wheels',artist:'Electric Light Orchestra',source:'https://music.youtube.com/watch?v=abc',position:0,duration:300,ended:false};
 result={sample:{...base,playing:true,playbackCycle:'session:0'}};
 await send({type:'probe'},tab);
 assert.equal(state.history.length,1);
 result={sample:{...base,playing:false,playbackCycle:'session:1'}};
 await send({type:'probe'},tab);assert.equal(state.history.length,1);
 result={sample:{...base,playing:true,playbackCycle:'session:1'}};
 await send({type:'probe'},tab);assert.equal(state.history.length,2);
 await send({type:'probe'},tab);assert.equal(state.history.length,2);
 await send({type:'clear'});assert.equal(state.history.length,0);
 await send({type:'probe'},tab);assert.equal(state.history.length,0);
});
