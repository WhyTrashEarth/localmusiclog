import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialState,record,validSample} from '../dist/history.js';
const sample=(overrides={})=>({title:'Big Wheels',artist:'Electric Light Orchestra',source:'https://music.youtube.com/watch?v=example',playing:true,position:10,duration:300,ended:false,...overrides});
test('requires real title, artist, source and finite playback data',()=>{
 assert.equal(validSample(sample()),true);
 for(const change of [{artist:''},{title:''},{source:'https://evil.example/watch?v=x'},{position:NaN},{playing:'yes'}])assert.equal(validSample(sample(change)),false);
});
test('continuous playback, seeking, pause and resume do not duplicate',()=>{
 let s=record(initialState(),sample());
 for(const update of [{position:11},{position:0},{playing:false},{playing:true}])s=record(s,sample(update));
 assert.equal(s.history.length,1);
});
test('records track changes and return plays',()=>{
 let s=record(initialState(),sample());
 s=record(s,sample({title:'Other',source:'https://music.youtube.com/watch?v=other'}));
 s=record(s,sample());assert.equal(s.history.length,3);
});
test('counts observed completion followed by restart',()=>{
 let s=record(initialState(),sample());s=record(s,sample({ended:true,playing:false,position:300}));
 s=record(s,sample({position:0}));assert.equal(s.history.length,2);
});
test('does not log a track until it starts playing',()=>{
 let s=record(initialState(),sample({playing:false}));assert.equal(s.history.length,0);
 s=record(s,sample());assert.equal(s.history.length,1);
});
test('pause prevents writes and clear does not duplicate current track',()=>{
 const s=record(initialState(),sample());
 assert.deepEqual(record({...s,paused:true},sample({title:'Other'})),{...s,paused:true});
 assert.equal(record({...s,history:[]},sample()).history.length,0);
});
test('rolling history retains newest 300 events',()=>{
 let s=initialState();for(let i=0;i<305;i++)s=record(s,sample({source:`https://music.youtube.com/watch?v=${i}`}));
 assert.equal(s.history.length,300);assert.equal(s.history[0].source,'https://music.youtube.com/watch?v=5');
});
test('event cycles count consecutive repeats even when polling never sees ended',()=>{
 let s=record(initialState(),sample({playbackCycle:'session:0'}));
 s=record(s,sample({position:0.5,playbackCycle:'session:1'}));
 s=record(s,sample({position:1.5,playbackCycle:'session:1'}));
 s=record(s,sample({position:0.2,playbackCycle:'session:2'}));
 assert.equal(s.history.length,3);
});
test('observer restart and backward/stale cycle tokens do not invent plays',()=>{
 let s=record(initialState(),sample({playbackCycle:'old:3'}));
 s=record(s,sample({playbackCycle:'new:0'}));
 s=record(s,sample({playbackCycle:'new:0',position:0}));
 assert.equal(s.history.length,1);
});
test('a repeat detected while buffering is recorded when playback becomes ready',()=>{
 let s=record(initialState(),sample({playbackCycle:'session:0'}));
 s=record(s,sample({position:0,playing:false,playbackCycle:'session:1'}));
 assert.equal(s.history.length,1);
 s=record(s,sample({position:0.2,playing:true,playbackCycle:'session:1'}));
 assert.equal(s.history.length,2);
 s=record(s,sample({position:1,playing:true,playbackCycle:'session:1'}));
 assert.equal(s.history.length,2);
});
test('repeat remains eligible after a new observer session and buffering probes',()=>{
 let s=record(initialState(),sample({playbackCycle:'old:3'}));
 s=record(s,sample({playbackCycle:'new:0'}));
 s=record(s,sample({playbackCycle:'new:1',playing:false}));
 s=record(s,sample({playbackCycle:'new:1',playing:false}));
 s=record(s,sample({playbackCycle:'new:1',playing:true}));
 assert.equal(s.history.length,2);
});
test('legacy stored state migrates without duplicating its current playback',()=>{
 let s=record(initialState(),sample({playbackCycle:'session:0'}));
 delete s.lastRecorded;
 s=record(s,sample({playbackCycle:'session:0'}));assert.equal(s.history.length,1);
 s=record(s,sample({playbackCycle:'session:1',playing:false}));
 s=record(s,sample({playbackCycle:'session:1',playing:true}));assert.equal(s.history.length,2);
});
