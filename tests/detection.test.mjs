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
 return {probe,event,media,player,context,input:time=>{clock=time;docEvents.get('pointerdown')();}};
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
test('full-track duration stays stable while media stream duration grows',()=>{
 const f=eventFixture();
 f.player.getPlayerResponse=()=>({videoDetails:{videoId:'abc',lengthSeconds:'449'}});
 f.player.getCurrentTime=()=>215;
 f.media.duration=26;
 const first=f.probe();assert.equal(first.sample.duration,449);assert.equal(first.sample.position,215);
 assert.match(first.diagnostics,/Duration track metadata/);
 f.media.duration=449;
 assert.equal(f.probe().sample.duration,449);
});
test('ignores stale track duration and safely falls back to player duration',()=>{
 const f=eventFixture();
 f.player.getPlayerResponse=()=>({videoDetails:{videoId:'other',lengthSeconds:'449'}});
 f.player.getDuration=()=>100;
 assert.equal(f.probe().sample.duration,100);
});
test('old tracker is replaced on the same media element without duplicating a play',()=>{
 const f=eventFixture();let disposed=false;
 f.context.__localMusicLogCycle={media:f.media,token:'existing',cycle:2,source:'abc',endedSource:null,position:8,time:0,wasPlaying:true,inputAt:-Infinity,dispose:()=>{disposed=true;}};
 const result=f.probe();assert.equal(disposed,true);
 assert.equal(result.sample.playbackCycle,'existing:2');
 assert.match(result.diagnostics,/Tracker v5/);assert.doesNotMatch(result.diagnostics,/undefined/);
 f.event('timeupdate',9.8,1800);f.event('seeking',0,2000,true);f.event('playing',0.1,2100);
 assert.equal(f.probe().sample.playbackCycle,'existing:3');
});
test('boundary uses full track duration instead of growing raw media duration',()=>{
 const f=eventFixture();f.media.duration=26;
 f.player.getPlayerResponse=()=>({videoDetails:{videoId:'abc',lengthSeconds:'449'}});
 f.probe();f.event('timeupdate',448.8,440800);
 f.media.duration=900;
 f.event('seeking',0,441000,true);f.event('playing',0.1,441100);
 assert.match(f.probe().sample.playbackCycle,/:1$/);
});
