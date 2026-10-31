import {chromium} from 'playwright-core';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try {
 const context=await browser.newContext();
 await context.route('https://popup.test/**',async route=>{
  const name=new URL(route.request().url()).pathname.slice(1);
  if(!['popup.html','popup.css','popup.js','appearance.js','ui-strings.js','fonts/AtkinsonHyperlegibleNext.ttf'].includes(name))return route.abort();
  await route.fulfill({body:await readFile(`dist/${name}`),contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.ttf')?'font/ttf':'text/html'});
 });
 await context.addInitScript(()=>{
  let sharing={connected:false,approved:false};
  window.check={requests:[],permissions:[],offline:false};
  window.chrome={permissions:{request:async x=>{window.check.permissions.push(x);return true;}},storage:{local:{get:async()=>({}),set:async()=>{}},onChanged:{addListener:()=>{}}},runtime:{sendMessage:async m=>{
   window.check.requests.push(m.type);
   if(m.type==='state')return {history:[],paused:false,status:'Local history',diagnostics:''};
   if(m.type==='sharing-connect')sharing={connected:true,approved:false,origin:m.origin,login:'broadcaster',expiresAt:Date.now()+60000};
   if(m.type==='sharing-approve')sharing.approved=true;
   if(m.type==='sharing-revoke'){
    sharing.approved=false;if(window.check.offline)return {error:'Offline'};
    sharing={connected:false,approved:false};
   }
   return {...sharing};
  }}};
 });
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('https://popup.test/popup.html');
 await page.locator('#sharing-panel summary').click();
 await page.getByText('Sharing is off. Local-only operation.',{exact:true}).waitFor();
 assert.equal(await page.locator('#sharing-consent').isHidden(),true);
 await page.locator('#backend').fill('https://log.test');await page.locator('#connect-sharing').click();
 await page.getByText('broadcaster: Sharing is off.',{exact:true}).waitFor();
 assert.equal(await page.locator('#approve-sharing').isDisabled(),true);
 assert.deepEqual(await page.evaluate(()=>window.check.permissions),[{origins:['https://log.test/*']}]);
 assert.equal(await page.evaluate(()=>window.check.requests.includes('sharing-approve')),false);
 await page.locator('#sharing-checkbox').check();await page.locator('#approve-sharing').click();
 await page.getByText('broadcaster: Publishing new plays.',{exact:true}).waitFor();
 assert.equal(await page.locator('#public-link').getAttribute('href'),'https://log.test/recent/broadcaster');
 await page.evaluate(()=>window.check.offline=true);await page.locator('#revoke-sharing').click();
 await page.locator('#sharing-error').getByText('Uploads are stopped locally.',{exact:false}).waitFor();
 await page.evaluate(()=>window.check.offline=false);await page.locator('#revoke-sharing').click();
 await page.getByText('Sharing is off. Local-only operation.',{exact:true}).waitFor();
 assert.equal(await page.locator('#sharing-checkbox').isChecked(),false);
 assert.deepEqual(errors,[]);
 console.log('PASS: local-only default, chosen-host permission, login separate from checkbox approval, public page link, offline deletion warning and retry. Browser APIs mocked.');
}finally{await browser.close();}
