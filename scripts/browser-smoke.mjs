import {chromium} from 'playwright-core';
import {resolve} from 'node:path';
import {mkdtemp,rm} from 'node:fs/promises';
import assert from 'node:assert/strict';
const profile=await mkdtemp('/tmp/localmusiclog-browser-');
let context;
try {
 context=await chromium.launchPersistentContext(profile,{executablePath:'/usr/bin/chromium',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging','--no-sandbox',`--disable-extensions-except=${resolve('dist')}`,`--load-extension=${resolve('dist')}`]});
 const bootstrap=await context.newPage();
 const cdp=await context.browser().newBrowserCDPSession();
 await cdp.send('Extensions.loadUnpacked',{path:resolve('dist')});
 const worker=context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker',{timeout:15000});
 const id=new URL(worker.url()).host;
 const page=await context.newPage();await page.goto(`chrome-extension://${id}/popup.html`);
 await page.getByText('Choose a YouTube Music tab to begin.').waitFor();
 await page.getByRole('button',{name:'Pause logging'}).click();
 await page.getByRole('button',{name:'Resume logging'}).waitFor();
 await page.reload();await page.getByRole('button',{name:'Resume logging'}).waitFor();
 await page.getByRole('button',{name:'Resume logging'}).click();
 await page.getByRole('button',{name:'Use this YouTube Music tab'}).click();
 await page.getByText('Open YouTube Music in the active tab, then select it here.').waitFor();
 const errors=await page.evaluate(()=>document.querySelectorAll('script:not([src])').length);
 assert.equal(errors,0);
 console.log('PASS: Chromium loads MV3 worker and popup; pause persists across reload; unsupported tab is rejected.');
} finally {await context?.close();await rm(profile,{recursive:true,force:true});}
