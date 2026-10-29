import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {detectPlayer} from '../dist/detection.js';
function detect({data,artist=null,title=null,url='https://music.youtube.com/playlist?list=album',metadata=null,ad=false}={}) {
 const bar={querySelector:s=>s==='.title'?title&&{textContent:title}:s.includes('channel/')?artist&&{textContent:artist}:null};
 const media={addEventListener:()=>{},removeEventListener:()=>{},paused:false,ended:false,readyState:4,currentTime:20,duration:300};
 const player={getVideoData:()=>data};
 return vm.runInNewContext(`(${detectPlayer.toString()})()`,{URL,crypto,performance,location:{href:url},navigator:{mediaSession:{metadata}},document:{addEventListener:()=>{},removeEventListener:()=>{},querySelector:s=>s==='ytmusic-player-bar'?bar:s==='#movie_player'?player:s==='#movie_player.ad-showing'?ad?{}:null:media}});
}
test('player data identifies track while viewing an album page',()=>{
 const result=detect({data:{video_id:'abc_123',title:'Big Wheels',author:'Electric Light Orchestra'}});
 assert.equal(result.sample.title,'Big Wheels');assert.equal(result.sample.source,'https://music.youtube.com/watch?v=abc_123');
});
test('supports browse artist links through DOM fallback',()=>{
 const result=detect({title:'Song',artist:'Artist',url:'https://music.youtube.com/watch?v=abc'});
 assert.equal(result.sample.artist,'Artist');
});
test('uses available media session metadata with a verified player ID',()=>{
 const result=detect({data:{video_id:'abc'},metadata:{title:'Song',artist:'Artist'}});
 assert.equal(result.sample.title,'Song');assert.equal(result.sample.artist,'Artist');
});
test('missing ID produces actionable status rather than recording album title',()=>{
 const result=detect({title:'Album',artist:'Artist'});
 assert.equal(result.sample,null);assert.match(result.status,/track ID/);
});
test('missing artist remains unrecorded',()=>{
 const result=detect({data:{video_id:'abc',title:'Song'}});
 assert.equal(result.sample,null);assert.match(result.status,/artist/);
});
test('advertisements are not recorded',()=>{
 assert.equal(detect({data:{video_id:'abc',title:'Ad',author:'Ad'},ad:true}).sample,null);
});
function eventFixture() {
 let clock=0;const mediaEvents=new Map(),docEvents=new Map();
 const media={paused:false,ended:false,readyState:4,currentTime:8,duration:10,playbackRate:1,loop:false,addEventListener:(n,fn)=>mediaEvents.set(n,fn),removeEventListener:()=>{}};
 const player={getVideoData:()=>({video_id:'abc',title:'Song',author:'Artist'})};
 const context=vm.createContext({URL,crypto,performance:{now:()=>clock},location:{href:'https://music.youtube.com/'},navigator:{},document:{addEventListener:(n,fn)=>docEvents.set(n,fn),removeEventListener:()=>{},querySelector:s=>s==='ytmusic-player-bar'?{querySelector:()=>null}:s==='#movie_player'?player:s==='#movie_player.ad-showing'?null:media}});
 const probe=()=>vm.runInContext(`(${detectPlayer.toString()})()`,context);
 const event=(name,position,time,paused=false)=>{media.currentTime=position;media.paused=paused;clock=time;mediaEvents.get(name)?.({type:name,target:media});};
 return {probe,event,media,input:time=>{clock=time;docEvents.get('pointerdown')();}};
}
test('site-style rewind counts after transient pause even without native loop',()=>{
 const f=eventFixture();f.probe();f.event('timeupdate',9.8,1800);
 f.event('seeking',0,2000,true);f.event('playing',0.1,2100);
 assert.match(f.probe().sample.playbackCycle,/:1$/);
 f.event('timeupdate',0.5,2500);assert.match(f.probe().sample.playbackCycle,/:1$/);
});
test('manual seek near the end is suppressed when user input was observed',()=>{
 const f=eventFixture();f.probe();f.event('timeupdate',9.8,1800);
 f.input(1990);f.event('seeking',0,2000);f.event('playing',0.1,2100);
 assert.match(f.probe().sample.playbackCycle,/:0$/);
});
test('programmatic seek before predicted completion does not count',()=>{
 const f=eventFixture();f.probe();f.event('timeupdate',9.5,1500);
 f.event('seeking',0,1510);f.event('playing',0.1,1520);
 assert.match(f.probe().sample.playbackCycle,/:0$/);
});
