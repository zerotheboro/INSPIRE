// Actual localhost preview/auth only. Never executes an inference request.
import assert from 'node:assert/strict'
import {readFileSync,writeFileSync,mkdirSync,existsSync,openSync,writeSync,fsyncSync,closeSync} from 'node:fs'
import {createHash} from 'node:crypto'
const base='http://127.0.0.1:5173',local='.private.local/api-rag-final-20261125',out='docs/evidence/api-rag-2026-11-25/final-preview'
const freeze=(file,value)=>{const bytes=JSON.stringify(value,null,2)+'\n';if(existsSync(file)){assert.equal(readFileSync(file,'utf8'),bytes,'FROZEN_RUNTIME_CHANGED: stop; do not renew/rebind approval')}else{const fd=openSync(file,'wx',0o600);try{writeSync(fd,bytes);fsyncSync(fd)}finally{closeSync(fd)}}}
const plan=JSON.parse(readFileSync(local+'/first-preview.json','utf8'))
const status=await fetch(base+'/api/inspire-private-status').then(r=>r.json())
assert.equal(status.lunaApiPreview,true);assert.equal(status.chatgptPreview,false);assert.equal(status.modelAvailable,false)
const savedFile=local+'/synthetic-local-session.json'
let saved=existsSync(savedFile)?JSON.parse(readFileSync(savedFile,'utf8')):null
if(!saved){
 const auth=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-only',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"returnSecureToken":true}'}).then(r=>r.json())
 assert.equal(typeof auth.idToken,'string');saved={token:auth.idToken}
}
const post=async(body,origin=base,path='/api/inspire-luna')=>{const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+saved.token,Origin:origin},body:JSON.stringify(body)});return {status:r.status,data:await r.json()}}
if(!saved.request){const session=await post({kind:'session'});assert.equal(session.status,200);saved.request={...plan.request,epoch:session.data.epoch,sessionId:session.data.sessionId};freeze(savedFile,saved)}
const request=saved.request
assert.deepEqual({...request,epoch:plan.request.epoch,sessionId:plan.request.sessionId},plan.request)
// A restart may not silently renew the frozen operation's epoch/binding.
const healthSession=await post({kind:'session'});assert.equal(healthSession.status,200)
assert.equal(healthSession.data.epoch,request.epoch,'SERVER_RESTARTED: stop; frozen operation must not be rebound')
const preview=await post({kind:'preview',request});assert.equal(preview.status,200,JSON.stringify(preview.data));assert.equal(preview.data.payloadSHA,plan.payloadSHA);assert.equal(preview.data.sourceCount,3)
assert.equal(preview.data.payload,undefined);assert.equal(preview.data.instructions,undefined);assert.equal(typeof preview.data.keyConfigured,'boolean')
assert.deepEqual(await post({kind:'preview',request}),preview)
assert.equal((await post({kind:'preview',request:{...request,authority:'owner',quota:999}})).status,400)
assert.equal((await post({kind:'session'},'https://untrusted.invalid')).status,403)
assert.equal((await post({kind:'session'},base,'/api/inspire-chatgpt')).status,403)
for(const path of ['/.private.local/inbox/INSPIRE_RAG_API_HANDOFF/SOURCE_MANIFEST.json','/.private.local/api-rag/first-preview.json','/functions/src/inspireLunaApi.ts?raw'])assert.equal((await fetch(base+path)).status,403)
for(const route of ['/ai-inspire?thu-rieng=1','/tham-van-tam-ly','/nghi-duong-duong-sinh'])assert.equal((await fetch(base+route)).status,200)
const actual={...plan,request,binding:preview.data.binding}
assert.equal(actual.binding,createHash('sha256').update(JSON.stringify([request,actual.payloadSHA])).digest('hex'))
// This is a new, unapproved runtime-bound review, not permission to consume.
freeze(local+'/first-runtime-preview.json',actual)
const summary=JSON.parse(readFileSync(out+'/first-request-summary.json','utf8'))
summary.binding=actual.binding;summary.fullExactRequestPrivateFile=local+'/first-runtime-preview.json';summary.runtimeEpochBound=true;summary.request=request
writeFileSync(out+'/first-request-summary.json',JSON.stringify(summary,null,2))
const grant=JSON.parse(readFileSync(out+'/authorization-template.json','utf8'));grant.binding=actual.binding;writeFileSync(out+'/authorization-template.json',JSON.stringify(grant,null,2))
mkdirSync(out,{recursive:true});writeFileSync(out+'/http-checks.json',JSON.stringify({executed:true,preview:preview.data,unauthorizedExecute:'NOT SENT: do not risk any local owner grant',forgedAuthority:400,crossOrigin:403,chatgptClosed:403,privateFilesDenied:403,routesHTML:200,paidCalls:0,browserRendering:'NOT VERIFIED BY HTTP'},null,2))
console.log('PASS: actual API localhost route; stable RAG preview, redaction, origin/authority/private paths; runtime-bound request held without execute.')
