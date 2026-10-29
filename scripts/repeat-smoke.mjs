import {chromium} from 'playwright-core';
import {detectPlayer} from '../dist/detection.js';
import {record,initialState} from '../dist/history.js';
import assert from 'node:assert/strict';
// Generate a local silent PCM WAV. No network, recording or external media.
const rate=8000,frames=rate*2,wav=Buffer.alloc(44+frames*2);
wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(frames*2,40);
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
try {
 const page=await browser.newPage();
 await page.route("https://fixture.test/**",route=>route.fulfill({body:"<!doctype html><html><body></body></html>",contentType:"text/html"}));
 await page.goto("https://fixture.test/");
 await page.setContent('<ytmusic-player-bar></ytmusic-player-bar><div id="movie_player"><video muted></video></div><button id="seek">Seek to start</button>');
 await page.evaluate(src=>{
  document.querySelector('#movie_player').getPlayerResponse=()=>({videoDetails:{videoId:'repeatTest',lengthSeconds:'2'}});
  document.querySelector('#movie_player').getVideoData=()=>({video_id:'repeatTest',title:'Fixture track',author:'Fixture artist'});
  const v=document.querySelector('video');v.src=src;
  document.querySelector('#seek').onclick=()=>{v.currentTime=0;};
 },`data:audio/wav;base64,${wav.toString('base64')}`);
 await page.waitForFunction(()=>document.querySelector('video').readyState>=2);
 const firstProbe=await page.evaluate(detectPlayer);
 await page.evaluate(()=>{delete window.__localMusicLogCycle.version;delete window.__localMusicLogCycle.lastEvent;});
 const upgraded=await page.evaluate(detectPlayer);
 assert.equal(upgraded.sample.playbackCycle,firstProbe.sample.playbackCycle);
 assert.match(upgraded.diagnostics,/Tracker v5/);assert.doesNotMatch(upgraded.diagnostics,/undefined/);
 await page.evaluate(()=>{const v=document.querySelector('video');v.loop=true;return v.play();});
 let state=initialState();
 const probe=async()=>{const d=await page.evaluate(detectPlayer);assert.ok(d.sample);state=record(state,d.sample);return d.sample;};
 await probe();
 // Poll slower than the ended transition, as the real worker does.
 const deadline=Date.now()+10000;
 while(state.history.length<3 && Date.now()<deadline){await page.waitForTimeout(500);await probe();}
 assert.equal(state.history.length,3,'Three real native-loop plays must yield three entries');
 await page.evaluate(()=>{const v=document.querySelector('video');v.loop=false;v.pause();});
 await probe();
 const count=state.history.length;
 await page.getByRole('button',{name:'Seek to start'}).click();
 await page.evaluate(()=>document.querySelector('video').play());await page.waitForTimeout(200);await probe();
 assert.equal(state.history.length,count,'Seeking before completion must not create another entry');
 // A natural ended event followed by Replay must count without an ended poll.
 await page.waitForFunction(()=>document.querySelector('video').ended);
 await page.evaluate(()=>{const v=document.querySelector('video');v.currentTime=0;return v.play();});
 await page.waitForTimeout(100);await probe();
 assert.equal(state.history.length,count+1,'Replay after completion must count even if ended was never polled');
 // Model a site that rewinds before ended without enabling HTML native loop.
 await page.evaluate(()=>{
  const v=document.querySelector('video');v.pause();v.currentTime=0;
  Object.defineProperty(v,'duration',{configurable:true,get:()=>window.rawDuration??26});
  window.siteLoops=0;
  window.siteTimer=setInterval(()=>{
   if(!v.paused && v.currentTime>=2-0.025){window.siteLoops++;v.currentTime=0;void v.play();}
  },10);
 });
 await page.waitForTimeout(100);
 await page.evaluate(()=>document.querySelector('video').play());
 await page.waitForTimeout(100);await probe();
 const beforeSite=state.history.length;
 assert.equal((await probe()).duration,2);
 await page.evaluate(()=>window.rawDuration=449);
 assert.equal((await probe()).duration,2);
 const siteDeadline=Date.now()+10000;
 while(state.history.length<beforeSite+2 && Date.now()<siteDeadline){await page.waitForTimeout(500);await probe();}
 assert.ok(await page.evaluate(()=>window.siteLoops>=2),'Site-style loop fixture actually executed');
 assert.equal(state.history.length,beforeSite+2,'Site-style rewind without native loop/ended must count');
 await page.evaluate(()=>clearInterval(window.siteTimer));
 console.log('PASS: real Chromium tracker upgrade, stable full-track duration despite growing stream duration, native loops, site-style near-completion rewinds without native loop, seek/pause deduplication, and replay after completion. Local fixture, not live YouTube Music.');

} finally {await browser.close();}
