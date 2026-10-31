import {chromium} from 'playwright-core';
import {readFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const preferences={};let writes=0,failSave=false,failRead=false;
const launch=()=>chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
let browser=await launch();
async function fixture(browser){
 const context=await browser.newContext({viewport:{width:400,height:600},colorScheme:'light',reducedMotion:'reduce'});
 await context.exposeBinding('readAppearance',()=>{if(failRead)throw Error('storage unavailable');return {...preferences};});
 await context.exposeBinding('writeAppearance',(_,values)=>{if(failSave)throw Error('quota');writes++;Object.assign(preferences,values);});
 const requests=[];
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());requests.push(url.href);
  const name=url.pathname.slice(1);
  if(url.origin!=='https://popup.test' || !['popup.html','popup.css','popup.js','appearance.js','ui-strings.js','fonts/AtkinsonHyperlegibleNext.ttf'].includes(name))return route.abort();
  const contentType=name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.ttf')?'font/ttf':'text/html';
  await route.fulfill({body:await readFile(`dist/${name}`),contentType});
 });
 await context.addInitScript(()=>{
  const samples=[
   ['مرحبا بالعالم — أغنية عربية','فنان عربي'],
   ['שלום עולם — שיר','אמן'],
   ['東京の夜 🎵 日本語 한국어 中文','演奏者 · 아티스트'],
   ['Beyoncé · Jóga · Cafe\u0301','Sigur Rós'],
   ['Long title without losing metadata '.repeat(12),'Very long artist name '.repeat(15)]
  ];
  const history=samples.map(([title,artist],i)=>({id:String(i),title,artist,kind:'youtube-music',source:'https://music.youtube.com/watch?v=abc',observedAt:'2026-10-31T07:00:00Z'}));
  history.push({id:'video',title:'فيديو · 動画',kind:'youtube-video',channel:'قناة عربية — チャンネル',artist:'',source:'https://www.youtube.com/watch?v=abc',observedAt:'2026-10-31T07:00:00Z'});
  const state={history,paused:false,status:'Listening to the selected tab.',tabId:7,last:{playing:true}};
  const handlers=[];window.appearanceFixture={state,handlers,samples};
  window.chrome={storage:{local:{get:async()=>window.readAppearance(),set:async value=>{await window.writeAppearance(value);handlers.forEach(fn=>fn(Object.fromEntries(Object.entries(value).map(([k,newValue])=>[k,{newValue}])),'local'));}},onChanged:{addListener:fn=>handlers.push(fn)}},runtime:{sendMessage:async({type})=>type==='state'?state:{connected:false,approved:false}}};
 });
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('https://popup.test/popup.html');await page.locator('#appearance:enabled').waitFor();await page.locator('#history li').first().waitFor();await page.evaluate(()=>document.fonts.ready);
 return {context,page,requests,errors};
}
const background=p=>p.evaluate(()=>getComputedStyle(document.documentElement).backgroundColor);
function contrast(a,b){
 const lum=s=>{const parts=s.match(/[\d.]+/g).slice(0,3).map(Number).map(c=>c/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);return parts.reduce((s,c,i)=>s+c*[.2126,.7152,.0722][i],0);};
 const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}
async function checkContrast(page){
 const pairs=await page.evaluate(()=>{
  const root=getComputedStyle(document.documentElement);
  // Resolve light-dark token values through actual rendered color properties.
  const get=token=>{const el=document.createElement('i');el.style.color=`var(${token})`;document.body.append(el);const v=getComputedStyle(el).color;el.remove();return v;};
  return {text:get('--text'),muted:get('--muted'),bg:root.backgroundColor,surface:get('--surface'),accent:get('--accent'),accentInk:get('--accent-ink'),danger:get('--danger'),border:get('--border'),focus:get('--focus'),soft:get('--accent-soft')};
 });
 for(const [a,b] of [['text','bg'],['text','surface'],['muted','bg'],['muted','surface'],['accent','surface'],['accentInk','accent'],['danger','surface'],['text','soft']])assert.ok(contrast(pairs[a],pairs[b])>=4.5,`${a}/${b} text contrast: ${contrast(pairs[a],pairs[b])}`);
 for(const [a,b] of [['border','surface'],['border','bg'],['focus','bg'],['focus','surface']])assert.ok(contrast(pairs[a],pairs[b])>=3,`${a}/${b} control contrast`);
}
try {
 let {page,context,requests,errors}=await fixture(browser);
 assert.equal(await page.locator('#appearance').inputValue(),'system');assert.equal(writes,0);
 assert.equal(await background(page),'rgb(250, 248, 252)');await checkContrast(page);
 assert.equal(await page.evaluate(()=>document.fonts.check('16px "Atkinson Hyperlegible Next"')),true);
 assert.ok(requests.some(url=>url.endsWith('.ttf')),'Locally bundled font actually loaded');
 assert.ok(requests.every(url=>url.startsWith('https://popup.test/')),'No external font/application requests');
 await page.emulateMedia({colorScheme:'dark'});assert.equal(await background(page),'rgb(34, 33, 41)');assert.equal(writes,0);await checkContrast(page);
 await page.locator('#appearance').selectOption('light');await page.getByText('Appearance saved on this device.').waitFor();assert.equal(preferences.appearanceTheme,'light');assert.equal(await background(page),'rgb(250, 248, 252)');
 await page.reload();await page.locator('#appearance:enabled').waitFor();assert.equal(await page.locator('#appearance').inputValue(),'light');
 await page.emulateMedia({colorScheme:'dark'});assert.equal(await background(page),'rgb(250, 248, 252)');
 await page.locator('#appearance').selectOption('dark');await page.locator('#appearance:enabled').waitFor();await page.emulateMedia({colorScheme:'light'});assert.equal(await background(page),'rgb(34, 33, 41)');
 assert.deepEqual(Object.keys(preferences),['appearanceTheme'],'Theme storage does not touch history/sharing');
 await page.evaluate(()=>window.firstNode=document.querySelector('#history li'));
 await page.locator('#appearance').selectOption('system');await page.locator('#appearance:enabled').waitFor();
 assert.equal(await page.evaluate(()=>window.firstNode===document.querySelector('#history li')),true,'Theme changes retain history DOM');
 assert.equal(await page.evaluate(()=>window.appearanceFixture.handlers.length),3,'Theme changes add no storage listeners');
 const before=writes;await page.emulateMedia({colorScheme:'dark'});assert.equal(await background(page),'rgb(34, 33, 41)');assert.equal(writes,before);
 failSave=true;await page.locator('#appearance').selectOption('light');await page.getByText('Appearance could not be saved.',{exact:false}).waitFor();assert.equal(await page.locator('#appearance').inputValue(),'system');assert.equal(await background(page),'rgb(34, 33, 41)');failSave=false;
 for(const width of [360,400]){
  await page.setViewportSize({width,height:600});
  for(const theme of ['light','dark']){
   await page.locator('#appearance').selectOption(theme);await page.locator('#appearance:enabled').waitFor();await checkContrast(page);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No document overflow');
   assert.ok(await page.locator('main').evaluate(el=>el.scrollWidth<=el.clientWidth),'No inner scrolling/clipping');
   const actual=await page.locator('#history strong').allTextContents();
   assert.ok(actual.includes('Beyoncé · Jóga · Cafe\u0301'));assert.ok(actual.includes('مرحبا بالعالم — أغنية عربية'));
   assert.equal(await page.locator('#history strong[dir="auto"]').count(),6);assert.equal(await page.locator('#history bdi').count(),6);
   assert.equal(await page.locator('#history strong').filter({hasText:'مرحبا بالعالم'}).evaluate(el=>getComputedStyle(el).direction),'rtl');
   assert.ok(await page.locator('#history strong').filter({hasText:'Long title'}).evaluate(el=>el.scrollHeight===el.clientHeight),'Long metadata not truncated');
   await mkdir('artifacts',{recursive:true});await page.locator('main').evaluate(el=>el.scrollTop=0);await page.screenshot({path:`artifacts/popup-${theme}-${width}.png`});
  }
 }
 await page.locator('#appearance').focus();await page.keyboard.press('Home');await page.keyboard.press('ArrowDown');await page.locator('#appearance:enabled').waitFor();
 assert.equal(await page.locator('#appearance').inputValue(),'light','Theme selector works with keyboard');
 assert.equal(await page.locator('#appearance').evaluate(el=>getComputedStyle(el).outlineStyle),'solid');
 assert.equal(await page.getByRole('link',{name:'Contact WhyTrashEarth'}).getAttribute('href'),'mailto:WhyTrashEarth@protonmail.com');
 assert.equal(await page.locator('header').innerText(),'Local Music Log\n\nLocal-only by default. Sharing is optional.');
 assert.equal(await page.getByText('Recording selected tab',{exact:true}).count(),1);
 assert.equal(await page.locator('svg:not([aria-hidden="true"])').count(),0);
 assert.deepEqual(errors,[]);
 await page.locator('#appearance').selectOption('dark');await page.locator('#appearance:enabled').waitFor();
 await context.close();await browser.close();browser=await launch();
 ({page,context}=await fixture(browser));assert.equal(await page.locator('#appearance').inputValue(),'dark');assert.equal(await background(page),'rgb(34, 33, 41)');
 preferences.appearanceTheme='invalid-mode';await page.reload();await page.locator('#appearance:enabled').waitFor();assert.equal(await page.locator('#appearance').inputValue(),'system');
 failRead=true;await page.reload();await page.locator('#appearance:enabled').waitFor();await page.getByText('Appearance could not be restored.',{exact:false}).waitFor();assert.equal(await page.locator('#appearance').inputValue(),'system');
 console.log('PASS: System/Light/Dark, OS changes without writes, overrides, saved preference after reload/browser restart (mock storage), read/write failures, local font loading, WCAG AA token contrast, keyboard focus, 360/400px, Unicode/RTL, unchanged history DOM, no external requests. Chrome storage/runtime mocked.');
}finally{await browser.close();}
