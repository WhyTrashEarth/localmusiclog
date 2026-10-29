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
