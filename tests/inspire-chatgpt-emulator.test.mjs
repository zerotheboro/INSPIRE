// Demo emulator only; dispatch is closed even when the caller asks to execute.
import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,writeFileSync,mkdirSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {randomUUID,createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {createPrivateChatgptService} from '../functions/src/inspireLunaService.ts'
import {chatgptLedger,createChatgptRunner,decodeChatgptTurn} from '../functions/src/inspireChatgptSession.ts'
import {importSource} from '../functions/src/inspireKnowledge.ts'
import {prepareLunaKnowledgeInput} from '../functions/src/inspireLuna.ts'
import {emptyPreferences} from '../functions/src/inspireAccount.ts'
process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099'
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'
const uid='chatgpt-fixture-'+randomUUID(),identity={uid,providers:[],email:null,registered:false,createdAt:new Date().toISOString()}
const root=mkdtempSync(join(tmpdir(),'inspire-chatgpt-emulator-')),ledger=chatgptLedger(root),service=createPrivateChatgptService({ledger})
const require=createRequire(new URL('../functions/package.json',import.meta.url)),db=require('firebase-admin/firestore').getFirestore()
const sourceId=uid+'-source',text='# Kiểm thử\nzzchatgptfixture Một đoạn giả định về việc ưu tiên công việc.'
const hash=createHash('sha256').update(text).digest('hex')
async function source(allowed){await importSource({collection:'INSPIRE',documentId:sourceId,title:'Synthetic only',status:allowed?'published-supporting':'review-required',permittedUse:allowed?'supporting-retrieval':'receipt-only',rawFile:hash,kind:'reference',permissions:{sourceHash:hash,internalResearch:allowed,externalExport:allowed,evidence:'SYNTHETIC FIXTURE ONLY'}},Buffer.from(text),text)}
let request
test('private service connects existing retrieval to stable preview, ignores no controls, and refuses any dispatch',async()=>{
 await source(true)
 const session=await service.handlePrivate({kind:'session'},identity)
 request={kind:'send',epoch:session.epoch,sessionId:session.sessionId,conversationId:'conversation',operationId:'operation',messages:[{id:'u1',role:'user',text:'Tình huống giả định zzchatgptfixture, tôi nên làm gì trước?'}]}
 const preview=await service.handlePrivate({kind:'preview',request},identity)
 assert.equal(preview.sourceCount,1);assert.equal(preview.payload.supportingKnowledge[0].documentId,sourceId)
 assert.equal(preview.controls.liveDispatchEnabled,false);assert.equal(preview.accounting.used,0)
 assert.deepEqual(await service.handlePrivate({kind:'preview',request},identity),preview)
 await assert.rejects(service.handlePrivate({kind:'execute',request},identity),e=>e.code==='CHATGPT_DISPATCH_BLOCKED'&&e.retry==='none')
 for(const extra of [{maxAttempts:999},{approved:true},{billing:'api-key'}])await assert.rejects(service.handlePrivate({kind:'preview',request,...extra},identity))
 await assert.rejects(service.handlePrivate({kind:'preview',request:{...request,messages:[{...request.messages[0],text:'Changed'}]}},identity),e=>e.code==='OPERATION_CONFLICT')
 await assert.rejects(service.handlePrivate({kind:'preview',request},{...identity,uid:uid+'-other'}),e=>e.code==='SESSION_LOST')
 assert.equal(ledger.status().used,0)
})
test('permitted synthetic passage reaches native Controller-bound adapter input; exact output is validated before return',async()=>{
 const prepared=await prepareLunaKnowledgeInput({messages:request.messages,operatingInstructions:[],supportingKnowledge:[],userStatedPreferences:emptyPreferences},request)
 let adapterInput
 const run=createChatgptRunner({ledger,offlineSender:async p=>{
  adapterInput=JSON.parse(p.text)
  return decodeChatgptTurn(p,'thread','turn',[{method:'turn/completed',params:{threadId:'thread',turn:{id:'turn',status:'completed',items:[{id:'answer',type:'agentMessage',text:'Bạn muốn bắt đầu từ việc nào trong tình huống giả định này?'}]}}}])
 }})
 const output=await run.execute(uid,request,prepared)
 assert.equal(adapterInput.supportingKnowledge[0].documentId,sourceId)
 const evidence=run.controller.evidence();assert.equal(evidence.length,2)
 assert.equal(evidence[1].validated_sha256,createHash('sha256').update(output).digest('hex'))
 const out=process.env.INSPIRE_REVIEW_EVIDENCE_DIR||'docs/evidence/chatgpt-connection-2026-11-23';mkdirSync(out,{recursive:true})
 writeFileSync(out+'/retrieval-controller-trace.json',JSON.stringify({syntheticOnly:true,liveCalls:0,adapterInput,payloadSHA:prepared.payloadSHA,binding:prepared.binding,controller:evidence,validatedOutput:output},null,2))
})
test('revoked permission invalidates a held preview; restart cannot recreate pending session or multiply owner attempts',async()=>{
 await source(false)
 await assert.rejects(service.handlePrivate({kind:'preview',request},identity))
 const restarted=createPrivateChatgptService({ledger:chatgptLedger(root)})
 await assert.rejects(restarted.handlePrivate({kind:'preview',request},identity),e=>e.code==='SESSION_LOST'&&e.retry==='none')
 await assert.rejects(restarted.handlePrivate({kind:'execute',request},identity),e=>e.code==='CHATGPT_DISPATCH_BLOCKED')
 assert.equal(ledger.status().used,1);restarted.close()
})
test.after(async()=>{service.close();await db.recursiveDelete(db.doc('inspireKnowledge/'+sourceId));await db.terminate()})
