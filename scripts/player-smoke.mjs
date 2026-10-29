import {chromium} from 'playwright-core';
import {detectPlayer} from '../dist/detection.js';
import assert from 'node:assert/strict';
import {validSample,record,initialState} from '../dist/history.js';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try {
 const page=await browser.newPage();
 await page.route("https://fixture.test/**",route=>route.fulfill({body:"<!doctype html><html><body></body></html>",contentType:"text/html"}));
 await page.goto("https://fixture.test/");
 await page.setContent('<ytmusic-player-bar><span class="title">Big Wheels</span><span class="byline"><a href="browse/artist">Electric Light Orchestra</a></span></ytmusic-player-bar><div id="movie_player"><video></video></div>');
 await page.evaluate(()=>{
  document.querySelector('#movie_player').getVideoData=()=>({video_id:'example123',title:'Big Wheels',author:'Electric Light Orchestra'});
  const v=document.querySelector('video');
  Object.defineProperties(v,{paused:{value:false},readyState:{value:4},currentTime:{value:12},duration:{value:300}});
 });
 const result=await page.evaluate(detectPlayer);
 assert.equal(result.sample.artist,'Electric Light Orchestra');assert.equal(result.sample.playing,true);assert.equal(result.sample.source,'https://music.youtube.com/watch?v=example123');
 await page.evaluate(()=>document.querySelector('#movie_player').classList.add('ad-showing'));
 assert.equal((await page.evaluate(detectPlayer)).sample,null);
 await page.route('https://www.youtube.com/**',route=>route.fulfill({body:'<!doctype html><html><body></body></html>',contentType:'text/html'}));
 await page.goto('https://www.youtube.com/watch?v=regular123');
 await page.setContent('<div id="movie_player"><video></video></div>');
 await page.evaluate(()=>{
  document.querySelector('#movie_player').getVideoData=()=>({video_id:'regular123',title:'A video without verified song credits',author:'Uploader channel'});
  const v=document.querySelector('video');Object.defineProperties(v,{paused:{value:false},readyState:{value:4},currentTime:{value:12},duration:{value:300}});
 });
 const youtube=await page.evaluate(detectPlayer);
 assert.equal(validSample(youtube.sample),true);assert.equal(youtube.sample.artist,'');assert.equal(youtube.sample.channel,'Uploader channel');
 assert.equal(record(initialState(),youtube.sample).history[0].kind,'youtube-video');
 await page.evaluate(()=>document.querySelector('#movie_player').getVideoData=()=>({video_id:'different',title:'Stale video',author:'Uploader'}));
 assert.equal((await page.evaluate(detectPlayer)).sample,null);
 console.log('PASS: YouTube Music metadata and ad rejection; regular YouTube video/channel metadata with no inferred artist; navigation mismatch rejected in real Chromium. This is a fixture, not live YouTube Music.');
} finally {await browser.close();}
