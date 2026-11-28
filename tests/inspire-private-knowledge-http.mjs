// Actual loopback HTTP; a temporary synthetic source only, no live dispatch.
import assert from 'node:assert/strict'
import {randomUUID,createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {mkdirSync,writeFileSync} from 'node:fs'
import {requireLocalEmulators} from '../functions/src/inspireLocalService.ts'
import {importSource} from '../functions/src/inspireKnowledge.ts'
process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099'
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'
requireLocalEmulators()
const require=createRequire(new URL('../functions/package.json',import.meta.url)),db=require('firebase-admin/firestore').getFirestore()
const id='http-source-'+randomUUID(),text='# Synthetic only\nzhttpprivateknowledge Một đoạn tham khảo giả định.'
const hash=createHash('sha256').update(text).digest('hex'),base='http://127.0.0.1:5173',trace=[]
const call=async(path,body,token)=>{const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)});return {status:r.status,body:await r.json()}}
try{
 await importSource({collection:'INSPIRE',documentId:id,title:'Synthetic HTTP fixture',status:'published-supporting',permittedUse:'supporting-retrieval',rawFile:hash,kind:'reference',permissions:{sourceHash:hash,internalResearch:true,externalExport:true,evidence:'SYNTHETIC HTTP TEST ONLY'}},Buffer.from(text),text)
 const auth=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"returnSecureToken":true}'}).then(r=>r.json())
 const session=await call('/api/inspire-chatgpt',{kind:'session'},auth.idToken);assert.equal(session.status,200)
 const request={kind:'send',epoch:session.body.epoch,sessionId:session.body.sessionId,operationId:'http-preview',conversationId:'http-private',messages:[{id:'u1',role:'user',text:'zhttpprivateknowledge'}]}
 const preview=await call('/api/inspire-chatgpt',{kind:'preview',request},auth.idToken)
 assert.equal(preview.status,200);assert.equal(preview.body.sourceCount,1);assert.equal(preview.body.executionAvailable,false)
 assert.equal(preview.body.payload,undefined);assert.equal(preview.body.instructions,undefined)
 assert.ok(!JSON.stringify(preview.body).includes(text));assert.equal(preview.body.accounting.used,0)
 assert.deepEqual(await call('/api/inspire-chatgpt',{kind:'preview',request},auth.idToken),preview)
 assert.equal((await call('/api/inspire-chatgpt',{kind:'execute',request},auth.idToken)).status,403)
 assert.equal((await call('/api/inspire-luna',{kind:'session'},auth.idToken)).status,503)
 assert.equal((await call('/api/inspire-chatgpt',{kind:'preview',request:{...request,authority:'owner'}},auth.idToken)).status,400)
 await importSource({collection:'INSPIRE',documentId:id,title:'Synthetic HTTP fixture',status:'review-required',permittedUse:'receipt-only',rawFile:hash},Buffer.from(text),text)
 const revoked=await call('/api/inspire-chatgpt',{kind:'preview',request},auth.idToken);assert.equal(revoked.status,503)
 for(const p of ['/functions/src/inspireChatgptTransport.ts?raw','/.private.local/knowledge-chat-20261124/proposed-passages.json','/docs/evidence/knowledge-chat-2026-11-24/first-attempt-input.txt'])assert.ok([403,404].includes((await fetch(base+p)).status))
 assert.equal((await fetch(base+'/ai-inspire?thu-rieng=1')).status,200)
 trace.push({preview:preview.body,revoked:revoked.body,sourceId:id,sourceHash:hash,execute:403,apiFallback:503,privatePathsBlocked:true})
}finally{
 await db.recursiveDelete(db.doc('inspireKnowledge/'+id));await db.terminate()
 const out=process.env.INSPIRE_REVIEW_EVIDENCE_DIR||'docs/evidence/knowledge-chat-2026-11-24';mkdirSync(out,{recursive:true});writeFileSync(out+'/http-evidence.json',JSON.stringify({executed:true,liveCalls:0,renderedBrowserVerified:false,trace},null,2))
}
console.log('PASS loopback HTTP: automatic filtered retrieval, stable preview, redaction, revocation, live/API closure and private assets')
