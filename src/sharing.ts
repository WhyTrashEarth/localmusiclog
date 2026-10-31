import type { Entry } from './history.js';
interface Connection { origin:string; token:string; channelId:string; login:string; expiresAt:number; approved:boolean }
async function connection():Promise<Connection | undefined>{return (await chrome.storage.session.get('sharing')).sharing;}
async function api(c:Connection,path:string,data?:unknown){
 const r=await fetch(`${c.origin}/api/${path}`,{method:data===undefined?'GET':'POST',headers:{Authorization:`Bearer ${c.token}`,'X-Channel-ID':c.channelId,'Content-Type':'application/json'},...(data===undefined?{}:{body:JSON.stringify(data)}),credentials:'omit',redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw Object.assign(new Error(r.status===401?'Sharing session expired or revoked. Disconnect and reconnect.':`Sharing request failed (${r.status}).`),{status:r.status});
 return r.json();
}
function origin(value:unknown){const u=new URL(String(value));if(u.protocol!=='https:' || u.username || u.password || u.pathname!=='/' || u.search || u.hash)throw Error('Enter an HTTPS backend origin without a path.');return u.origin;}
export async function sharingStatus(){const c=await connection();const error=(await chrome.storage.local.get('sharingError')).sharingError || '';return c?{connected:true,login:c.login,approved:c.approved && c.expiresAt>Date.now(),origin:c.origin,expiresAt:c.expiresAt,error}:{connected:false,approved:false,error:''};}
export async function connectSharing(value:unknown){
 const base=origin(value);
 if(!await chrome.permissions.contains({origins:[`${base}/*`]}))throw Error('Backend permission is required.');
 if(await connection())throw Error('Disconnect the current channel before reconnecting.');
 const verifier=[...crypto.getRandomValues(new Uint8Array(32))].map(x=>x.toString(16).padStart(2,'0')).join('');
 const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier)));
 const challenge=btoa(String.fromCharCode(...digest)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
 const callback=await chrome.identity.launchWebAuthFlow({url:`${base}/oauth/start?challenge=${challenge}`,interactive:true});
 if(!callback || new URL(callback).origin!==new URL(chrome.identity.getRedirectURL()).origin)throw Error('Unexpected OAuth redirect.');
 const code=new URLSearchParams(new URL(callback).hash.slice(1)).get('code');if(!code)throw Error('Authorization cancelled.');
 const r=await fetch(`${base}/api/exchange`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code,verifier}),credentials:'omit',redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw Error('Could not complete authentication.');const session=await r.json();
 await chrome.storage.session.set({sharing:{...session,origin:base,approved:false}});await chrome.storage.local.set({sharingError:''});return sharingStatus();
}
export async function approveSharing(){const c=await connection();if(!c)throw Error('Connect Twitch first.');await api(c,'approve',{approval:'share-new-metadata-v1'});await chrome.storage.session.set({sharing:{...c,approved:true}});return sharingStatus();}
export async function revokeSharing(){
 const c=await connection();if(!c)return sharingStatus();
 // Stop uploads locally before contacting the backend; retain the credential to retry a failed deletion.
 await chrome.storage.session.set({sharing:{...c,approved:false}});
 try{await api(c,'revoke',{});}catch(error){if((error as {status?:number}).status!==401)throw error;}await chrome.storage.session.remove('sharing');await chrome.storage.local.set({sharingError:''});return sharingStatus();
}
export async function publishNew(entry:Entry){
 const c=await connection();if(!c?.approved || c.expiresAt<=Date.now())return;
 try{await api(c,'plays',{...entry,kind:entry.kind || 'youtube-music'});await chrome.storage.local.set({sharingError:''});}
 catch(error){await chrome.storage.local.set({sharingError:error instanceof Error?error.message:'Publishing failed.'});}
}
