import {chromium} from 'playwright-core';
import {detectPlayer} from '../dist/detection.js';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try {
 const page=await browser.newPage();
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
 console.log('PASS: serialized detector reads real Chromium DOM and page player metadata; ads are rejected. This is a fixture, not live YouTube Music.');
} finally {await browser.close();}
