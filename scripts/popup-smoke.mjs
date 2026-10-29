import {chromium} from 'playwright-core';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try {
 const context=await browser.newContext({viewport:{width:400,height:600}});
 await context.route('https://popup.test/**',async route=>{
  const name=new URL(route.request().url()).pathname.slice(1)||'popup.html';
  if(!['popup.html','popup.css','popup.js'].includes(name))return route.abort();
  await route.fulfill({body:await readFile(resolve('dist',name)),contentType:({'.html':'text/html','.css':'text/css','.js':'text/javascript'})[extname(name)]});
 });
 await context.addInitScript(()=>{
  const entry={title:'A very long song title '.repeat(8),artist:'Artist',source:'https://music.youtube.com/watch?v=abc',id:'a',observedAt:'2026-10-29T17:00:00Z'};
  let state={history:Array.from({length:300},(_,i)=>i===299?{...entry,id:String(i),kind:'youtube-video',artist:'',channel:'Uploader',source:'https://www.youtube.com/watch?v=abc'}:{...entry,id:String(i)}),paused:false,tabId:7,last:null,status:'Listening to the selected tab.'};
  const handlers=[];
  window.uiTest={requests:[],fail:false,push:()=>handlers.forEach(fn=>fn({state:{newValue:state}},'local'))};
  window.chrome={storage:{onChanged:{addListener:fn=>handlers.push(fn)}},runtime:{sendMessage:async({type})=>{
   window.uiTest.requests.push(type);
   if(type==='clear') {
    await new Promise(resolve=>setTimeout(resolve,60));
    if(window.uiTest.fail)return {error:'Simulated storage failure'};
    state={...state,history:[]};window.uiTest.push();
   }
   if(type==='pause')state={...state,paused:!state.paused};
   return state;
  }}};
 });
 const page=await context.newPage();
 let dialogs=0;page.on('dialog',async d=>{dialogs++;await d.dismiss();});
 await page.goto('https://popup.test/popup.html');
 await page.getByText('(300/300)',{exact:true}).waitFor();
 await page.getByText('YouTube video · Channel: Uploader',{exact:true}).waitFor();
 const clear=page.getByRole('button',{name:'Clear history',exact:true});
 await clear.click();
 await page.getByRole('heading',{name:'Clear local history?'}).waitFor();
 assert.equal(await page.evaluate(()=>document.activeElement.id),'cancel-clear');
 // Background storage updates must not close confirmation or steal focus.
 await page.evaluate(()=>window.uiTest.push());
 assert.equal(await page.evaluate(()=>document.activeElement.id),'cancel-clear');
 await page.keyboard.press('Escape');
 assert.equal(await page.locator('#clear-confirmation').isHidden(),true);
 assert.equal(await page.evaluate(()=>document.activeElement.id),'clear');
 assert.equal(await page.evaluate(()=>window.uiTest.requests.includes('clear')),false);
 await clear.click();await page.getByRole('button',{name:'Keep history'}).click();
 assert.equal(await page.evaluate(()=>window.uiTest.requests.includes('clear')),false);
 await clear.click();
 // Inline confirmation must allow interaction with another tab.
 const other=await context.newPage();await other.setContent('<label>Other tab<input></label>');
 await other.getByRole('textbox').fill('Browser remains usable');
 assert.equal(await other.getByRole('textbox').inputValue(),'Browser remains usable');
 await page.bringToFront();await page.getByRole('button',{name:'Keep history'}).click();
 await clear.focus();await page.keyboard.press('Enter');
 await page.keyboard.press('Tab');
 assert.equal(await page.evaluate(()=>document.activeElement.id),'confirm-clear');
 await page.evaluate(()=>window.uiTest.fail=true);
 await page.keyboard.press('Enter');
 await page.getByRole('alert').getByText('Could not clear history.',{exact:false}).waitFor();
 assert.equal(await page.locator('#history li').count(),300);
 assert.equal(await page.getByRole('button',{name:'Delete history'}).isEnabled(),true);
 await page.evaluate(()=>window.uiTest.fail=false);
 await page.getByRole('button',{name:'Delete history'}).click();
 await page.getByText('Local history cleared.',{exact:true}).waitFor();
 assert.equal(await page.locator('#history li').count(),0);
 assert.equal(await page.locator('#clear-confirmation').isHidden(),true);
 assert.equal(await page.evaluate(()=>document.activeElement.id),'select');
 assert.equal(await clear.isDisabled(),true);
 await page.getByRole('button',{name:'Pause logging'}).click();
 await page.getByRole('button',{name:'Resume logging'}).waitFor();
 assert.equal(dialogs,0,'No native blocking dialogs may open');
 for(const width of [360,400]) {
  await page.setViewportSize({width,height:600});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal clipping');
  assert.ok(await page.locator('h1').evaluate(el=>el.getBoundingClientRect().height<40),'Heading remains on one line');
 }
 await mkdir('artifacts',{recursive:true});
 await page.setViewportSize({width:400,height:600});
 await page.screenshot({path:'artifacts/popup-0.1.2.png'});
 console.log('PASS: inline clear/cancel/Escape/keyboard, cross-tab typing, live updates, storage failure/retry, successful deletion, pause, 300-entry rendering, 360/400px layout; zero native dialogs. Chrome APIs are mocked; this is not a loaded-extension test.');
} finally {await browser.close();}
