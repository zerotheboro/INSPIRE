// Real local HTTP admission/preview only. Never supplies a paid-call grant.
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs'
const base='http://127.0.0.1:5173',origin=base
const question='Tình huống giả định: Tôi có một ngày nhiều việc. Giúp tôi chọn việc nên làm trước.'
const status=await fetch(base+'/api/inspire-private-status').then(r=>r.json())
assert.equal(status.lunaApiPreview,true);assert.equal(status.modelAvailable,false)
const signIn=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-only',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({returnSecureToken:true})}).then(r=>r.json())
assert.equal(typeof signIn.idToken,'string')
const post=async(path,data,extra={})=>{
 const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+signIn.idToken,Origin:origin,...extra},body:JSON.stringify(data)})
 return {status:response.status,data:await response.json()}
}
const session=await post('/api/inspire-luna',{kind:'session'});assert.equal(session.status,200)
const request={kind:'send',epoch:session.data.epoch,sessionId:session.data.sessionId,operationId:crypto.randomUUID(),conversationId:crypto.randomUUID(),messages:[{id:'synthetic-first-question',role:'user',text:question}]}
const before=await post('/api/inspire-prototype',{kind:'account'})
const preview=await post('/api/inspire-luna',{kind:'preview',request});assert.equal(preview.status,200)
assert.equal(preview.data.previewOnly,true);assert.equal(preview.data.sourceCount,0)
const held=await post('/api/inspire-luna',{kind:'execute',request:{...request,kind:'replay'}})
assert.equal(held.status,403);assert.equal(held.data.error.code,'AUTHORIZATION_REQUIRED')
const forged=await post('/api/inspire-luna',{kind:'preview',request:{...request,quota:1000}});assert.equal(forged.status,400)
const crossOrigin=await post('/api/inspire-luna',{kind:'session'},{Origin:'https://untrusted.invalid'});assert.equal(crossOrigin.status,403)
const receipts=JSON.parse(readFileSync('.private.local/knowledge/receipts.json','utf8'))
const privateAsset=await fetch(base+'/.private.local/knowledge/raw/'+receipts.find(r=>r.hash).hash);assert.equal(privateAsset.status,403)
const after=await post('/api/inspire-prototype',{kind:'account'});assert.deepEqual(after.data.quota,before.data.quota)
for(const route of ['/ai-inspire?thu-rieng=1','/tham-van-tam-ly','/nghi-duong-duong-sinh'])assert.equal((await fetch(base+route)).status,200)
const out='docs/evidence/luna-api-2026-11-14';mkdirSync(out,{recursive:true})
writeFileSync(out+'/proposed-single-request.json',JSON.stringify({preparedAt:new Date().toISOString(),notAuthorized:true,realProviderRequests:0,endpoint:'https://api.openai.com/v1/responses',question,...preview.data,disclosure:{included:['short engineering Vietnamese instruction','one synthetic question','neutral Vietnamese preference','empty reference/correction arrays','SDK transport headers, project API authentication and network metadata'],excluded:['private INSPIRE originals/excerpts','unapproved operating rules','names, profile, account UID, email, auth token','bookings, real client data, tools, files, attachments, retained chat history']},stop:'After one attempt, success, failure or unknown outcome; no automatic retry or replacement.'},null,2))
writeFileSync(out+'/http-verification.json',JSON.stringify({executed:true,realProviderRequests:0,mode:'private API preview; generation held',checks:{session:session.status,preview:preview.status,unauthorizedExecute:held.status,forgedQuota:forged.status,crossOrigin:crossOrigin.status,privateRawAsset:privateAsset.status,quotaUnchanged:true,routesReturnHTML:true},browserRendering:'NOT_VERIFIED_BY_THIS_HTTP_TEST'},null,2))
console.log('PASS: real local HTTP preview, exact single-request proposal, authorization hold, origin/field/file guards; quota unchanged; no provider request.')
