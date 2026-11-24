// Local HTTP only. The execute probe must be rejected; never releases dispatch.
import assert from 'node:assert/strict'
import {writeFileSync,readFileSync} from 'node:fs'
const base='http://127.0.0.1:5173',checks={}
const status=await fetch(base+'/api/inspire-private-status').then(r=>r.json())
assert.equal(status.chatgptPreview,true);assert.equal(status.modelAvailable,false);assert.equal(status.lunaApiPreview,undefined)
const auth=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-only',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({returnSecureToken:true})}).then(r=>r.json())
assert.equal(typeof auth.idToken,'string')
async function post(path,body,origin=base){const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+auth.idToken,Origin:origin},body:JSON.stringify(body)});return {status:response.status,data:await response.json()}}
const session=await post('/api/inspire-chatgpt',{kind:'session'});assert.equal(session.status,200)
const request={kind:'send',epoch:session.data.epoch,sessionId:session.data.sessionId,operationId:crypto.randomUUID(),conversationId:crypto.randomUUID(),messages:[{id:'synthetic',role:'user',text:'Tình huống giả định: hôm nay tôi có nhiều việc.'}]}
const before=await post('/api/inspire-prototype',{kind:'account'})
const preview=await post('/api/inspire-chatgpt',{kind:'preview',request});assert.equal(preview.status,200,JSON.stringify(preview));assert.equal(preview.data.sourceCount,0);assert.equal(preview.data.accounting.used,0)
const repeated=await post('/api/inspire-chatgpt',{kind:'preview',request});assert.deepEqual(repeated,preview)
const held=await post('/api/inspire-chatgpt',{kind:'execute',request});assert.equal(held.status,403);assert.equal(held.data.error.code,'CHATGPT_DISPATCH_BLOCKED');assert.equal(held.data.error.retry,'none')
const bad=await post('/api/inspire-chatgpt',{kind:'preview',request:{...request,quota:999}});assert.equal(bad.status,400)
const cross=await post('/api/inspire-chatgpt',{kind:'session'},'https://untrusted.invalid');assert.equal(cross.status,403)
const old=await post('/api/inspire-luna',{kind:'session'});assert.equal(old.status,503)
assert.deepEqual((await post('/api/inspire-prototype',{kind:'account'})).data.quota,before.data.quota)
const receipts=JSON.parse(readFileSync('.private.local/knowledge/receipts.json'));const raw=await fetch(base+'/.private.local/knowledge/raw/'+receipts.find(r=>r.hash).hash);assert.equal(raw.status,403)
for(const route of ['/ai-inspire?thu-rieng=1','/tham-van-tam-ly','/nghi-duong-duong-sinh']){const r=await fetch(base+route);assert.equal(r.status,200);checks[route]=r.status}
for(const path of ['/api/inspire-chatgpt','/api/inspire-luna','/api/inspire-prototype']){const r=await fetch('http://127.0.0.1:4173'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:'{"kind":"session"}'});assert.equal(r.status,404);checks['production'+path]=r.status}
writeFileSync('docs/evidence/chatgpt-connection-2026-11-23/http-verification.json',JSON.stringify({executed:true,liveCalls:0,preview:preview.data,checks:{...checks,repeatedPreviewIdentical:true,quotaUnchanged:true,execute:held.status,apiRoute:old.status,authorityField:bad.status,crossOrigin:cross.status,privateFile:raw.status},visual:'NOT VERIFIED: browser host unavailable; minimized native Chrome window could not be inspected'},null,2))
console.log('PASS: actual local HTTP preview and identity binding, dispatch closed, API route closed, public endpoints absent, restricted asset denied, quota unchanged. No generation.')
