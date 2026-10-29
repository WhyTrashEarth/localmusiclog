import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const code=await readFile('dist/observer.js','utf8');
test('observer ignores tab titles and waits for complete player metadata',async()=>{
 let title=null,artist=null;const messages=[];let tick;
 const context={URL,location:{href:'https://music.youtube.com/watch?v=abc'},document:{querySelector:selector=>selector==='video'?{paused:false,ended:false,readyState:4,currentTime:10,duration:300}:{querySelector:selector=>selector==='.title'?(title?{textContent:title}:null):selector.startsWith('a[href^=')?(artist?{textContent:artist}:null):null}},chrome:{runtime:{sendMessage:async m=>{messages.push(m);return {ok:true};}}},setInterval:fn=>{tick=fn;return 1;},clearInterval:()=>{}};
 vm.runInNewContext(code,context);assert.equal(messages[0].type,'waiting');
 title='Big Wheels';artist='Electric Light Orchestra';tick();
 assert.equal(messages[1].sample.title,title);assert.equal(messages[1].sample.artist,artist);assert.equal(messages[1].sample.playing,true);
 artist=null;tick();assert.equal(messages[2].type,'waiting');
});
