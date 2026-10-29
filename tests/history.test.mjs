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
