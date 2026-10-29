import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const code=await readFile('dist/observer.js','utf8');
test('observer probes on injection and reselection replaces existing timer',async()=>{
 const messages=[];const timers=new Map();let id=0;
 const context=vm.createContext({chrome:{runtime:{sendMessage:async m=>{messages.push(m);return {ok:true};}}},setInterval:fn=>{timers.set(++id,fn);return id;},clearInterval:i=>timers.delete(i)});
 vm.runInContext(code,context);await new Promise(setImmediate);
 assert.equal(messages[0].type,'probe');assert.equal(timers.size,1);
 vm.runInContext(code,context);await new Promise(setImmediate);
 assert.equal(messages.length,2);assert.equal(timers.size,1);
});
test('observer stops when tab is deselected',async()=>{
 const timers=new Map();
 const context=vm.createContext({chrome:{runtime:{sendMessage:async()=>({stop:true})}},setInterval:fn=>{timers.set(1,fn);return 1;},clearInterval:i=>timers.delete(i)});
 vm.runInContext(code,context);await new Promise(setImmediate);assert.equal(timers.size,0);
});
