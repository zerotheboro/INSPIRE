import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {randomUUID,createHash} from 'node:crypto'
import {mkdirSync,writeFileSync} from 'node:fs'
import {createLocalService,requireLocalEmulators} from '../functions/src/inspireLocalService.ts'
import {createController040Adapter} from '../functions/src/inspireController040.ts'
import {importSource} from '../functions/src/inspireKnowledge.ts'
import {ConversationStore} from '../src/services/inspireConversation.ts'

process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099'
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'
requireLocalEmulators()
const require=createRequire(new URL('../functions/package.json',import.meta.url))
const db=require('firebase-admin/firestore').getFirestore()
const auth=require('firebase-admin/auth').getAuth(),uids=[]
const noRate=async()=>({allowed:true}) // IP limiter is separately exercised unchanged.
async function guest(service){
  const result=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=synthetic-key',
    {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({returnSecureToken:true})}).then(r=>r.json())
  assert.ok(result.idToken);const identity=await service.verify(result.idToken);uids.push(identity.uid);return identity
}
function report(name,value){mkdirSync('docs/evidence/scope-a040',{recursive:true});writeFileSync('docs/evidence/scope-a040/'+name+'.json',JSON.stringify(value,null,2))}
function diagnosis(adapter){return adapter.evidence().at(-1)?.checks?.filter(c=>c.stage==='Technical Hold')}

test('website store → verified account/quota → permitted retrieval → original Controller → exact mock receipt, correction, failure and replay',async(t)=>{
  const faults=new Map(),adapter=createController040Adapter(faults)
  t.after(()=>adapter.close())
  const service=createLocalService(adapter,Date.now,noRate),identity=await guest(service)
  const sourceId='scope-a-synthetic-'+randomUUID()
  const passage='Cây mai ngoài hiên: đoạn tổng hợp chỉ dành cho kiểm thử offline. Người kể có thể sửa điều đã nói; không suy diễn từ bản nháp.'
  const hash=createHash('sha256').update(passage).digest('hex')
  await importSource({collection:'INSPIRE',documentId:sourceId,title:'SYNTHETIC PERMITTED TEST FIXTURE / cây mai',status:'published-supporting',permittedUse:'supporting-retrieval',rawFile:'synthetic-only'},Buffer.from(passage),passage)
  t.after(()=>db.recursiveDelete(db.doc('inspireKnowledge/'+sourceId)))
  let technical=false,drop=false
  const requests=[]
  const store=new ConversationStore({connect:async()=>service.session(identity),send:async(request)=>{
    requests.push(structuredClone(request))
    if(technical){technical=false;faults.set(request.operationId,'technical_before_generate')}
    const response=await service.handle(request,identity,'scope-a-synthetic')
    if(drop){drop=false;throw Error('Synthetic dropped response AFTER committed mock receipt')}
    return response
  }})
  const active=()=>store.getSnapshot().conversations[0],id=active().id
  async function send(text){store.draft(id,text);await store.send(id);assert.equal(active().status,'idle',JSON.stringify(diagnosis(adapter)))}
  await send('Chiều nay tôi chăm cây mai ngoài hiên, thấy đầu óc nhẹ hơn. 🌿')
  const original=structuredClone(active().messages[0])
  await send('Cây mai ấy làm tôi nhớ những buổi sáng trước đây. Bạn còn nhớ tôi vừa kể gì không?')
  store.correct(id,original.id)
  await send('Tôi đính chính: đó là cây mai của nhà hàng xóm, không phải của tôi.')
  assert.deepEqual(active().messages[0],original)
  assert.equal(active().messages[4].correctionOf,original.id)
  assert.deepEqual(requests[2].messages.map(m=>m.role),['user','assistant','user','assistant','user'])
  technical=true;store.draft(id,'Cây mai: đây là lượt thử lỗi kỹ thuật tổng hợp.');await store.send(id)
  assert.equal(active().error.code,'ATTEMPT_FAILED',JSON.stringify(diagnosis(adapter)))
  assert.equal(active().messages.length,7);assert.equal(active().messages.at(-1).role,'user')
  const failed=structuredClone(requests.at(-1))
  assert.equal((await service.accounts.account(identity)).quota.completed,3)
  await store.retry(id);assert.equal(active().status,'idle',JSON.stringify(diagnosis(adapter)))
  assert.notEqual(requests.at(-1).operationId,failed.operationId)
  assert.deepEqual(requests.at(-1).messages,failed.messages)
  drop=true;store.draft(id,'Cây mai: tôi thử kiểm tra lại một phản hồi bị mất trên đường truyền.');await store.send(id)
  assert.equal(active().error.code,'CONNECTION')
  const lost=structuredClone(requests.at(-1)),calls=adapter.evidence().length
  await store.retry(id);assert.equal(active().status,'idle')
  assert.equal(requests.at(-1).kind,'replay');assert.equal(requests.at(-1).operationId,lost.operationId)
  assert.equal(adapter.evidence().length,calls)
  assert.equal((await service.accounts.account(identity)).quota.completed,5)
  assert.equal((await service.accounts.account(identity)).quota.pending,0)
  const packets=adapter.evidence(),completed=packets.filter(p=>p.status==='completed')
  assert.equal(completed.length,5)
  const correctedInput=completed[2].checks.find(c=>c.stage==='Offline Adapter Input')
  assert.deepEqual(correctedInput.roles,['system','user','assistant','user','assistant','user'])
  assert.equal(correctedInput.dialogue[0].content,original.text)
  assert.ok(correctedInput.dialogue.at(-1).content.endsWith(requests[2].messages.at(-1).text))
  let fixtureInputs=0
  for(const packet of completed){
    for(const stage of ['Source Verification','Ledger Validation','Permission Inspector','Mock Policy','Output Validation','Output Recheck','Mock Sink','State Commit'])assert.ok(packet.checks.some(c=>c.stage===stage),stage)
    assert.equal(packet.actual_execution_eligible,false)
    assert.equal(packet.deployment_permission,false)
    assert.equal(packet.receipt.decision_fingerprint,packet.decision_fingerprint)
    assert.equal(packet.response_sha256,createHash('sha256').update(packet.text).digest('hex'))
    const input=packet.checks.find(c=>c.stage==='Offline Adapter Input')
    if(input.website_sources.some(s=>s.documentId===sourceId&&s.hash===hash&&s.text===passage))fixtureInputs++
    assert.equal(input.uses_knowledge_for_generative_answer,false)
    assert.ok(Object.values(input.working_sections_present).every(Boolean))
    assert.ok(packet.checks.some(c=>c.stage==='Permission Inspector'&&JSON.stringify(c).includes('HOLD_ACTUAL_EXECUTION')))
  }
  assert.ok(fixtureInputs>0,'Exact permitted synthetic passage and provenance must reach constructed adapter input')
  report('integrated-journey',{executed:true,syntheticOnly:true,paidModelCalled:false,realRuntimePermissionEstablished:false,
    limitations:['Original MOCK adapter does not use knowledge to generate grounded answers.','MOCK ScopeGuard branch skips semantic checks.','Permission registry unavailable; actual execution remains held.'],
    requests,conversation:active().messages,quota:(await service.accounts.account(identity)).quota,controller:packets,replayAdapterCallsAdded:adapter.evidence().length-calls})
})

test('Controller process loss after receipt holds quota and replay cannot regenerate after losing its cache',async(t)=>{
  const faults=new Map(),adapter=createController040Adapter(faults);t.after(()=>adapter.close())
  const service=createLocalService(adapter,Date.now,noRate),identity=await guest(service)
  const {epoch,sessionId}=service.session(identity)
  const request={kind:'send',epoch,sessionId,conversationId:randomUUID(),operationId:randomUUID(),messages:[{id:randomUUID(),role:'user',text:'Nội dung tổng hợp để thử mất tiến trình sau biên nhận.'}]}
  faults.set(request.operationId,'process_loss_after_receipt')
  await assert.rejects(service.handle(request,identity,'scope-a-process-loss'),{code:'OUTCOME_UNKNOWN'})
  await assert.rejects(service.handle({...request,kind:'replay'},identity,'scope-a-process-loss'),{code:'OUTCOME_UNKNOWN'})
  assert.equal((await service.accounts.account(identity)).quota.pending,1)
  const restarted=createLocalService(createController040Adapter(),Date.now,noRate)
  await assert.rejects(restarted.handle({...request,kind:'replay'},identity,'scope-a-process-loss'),{code:'SESSION_LOST'})
  assert.equal((await restarted.accounts.account(identity)).quota.pending,1)
  assert.equal(adapter.evidence().length,0)
  report('controller-process-loss',{executed:true,syntheticOnly:true,injectedFault:'process exits after mock receipt/state commit, before IPC response',
    replay:'OUTCOME_UNKNOWN, no re-execution',serverRestartReplay:'SESSION_LOST, no re-execution',pendingQuota:1,
    reconciliation:'BLOCKED: no durable authorized Controller receipt/reconciliation contract; no fabricated completion or refund'})
})

test('native Controller rejects mock-policy denial, invalid output, post-validation swap and revocation before use',async(t)=>{
  const faults=new Map(),adapter=createController040Adapter(faults);t.after(()=>adapter.close())
  const service=createLocalService(adapter,Date.now,noRate),identity=await guest(service)
  for(const fault of ['deny_mock','invalid_output','post_validation_swap','revoke_before_use']){
    const {epoch,sessionId}=service.session(identity)
    const request={kind:'send',epoch,sessionId,conversationId:randomUUID(),operationId:randomUUID(),messages:[{id:randomUUID(),role:'user',text:'Cây mai: nội dung giả định để kiểm thử ranh giới.'}]}
    faults.set(request.operationId,fault)
    await assert.rejects(service.handle(request,identity,'scope-a-negative'),{code:'ATTEMPT_FAILED'})
  }
  const packets=adapter.evidence()
  assert.equal(packets.length,4)
  assert.ok(packets[0].checks.some(c=>c.stage==='Mock Policy'&&c.eligible===false))
  assert.ok(packets[2].checks.some(c=>c.stage==='Output Recheck'&&c.result==='REJECTED_CHANGED_OR_EXPIRED_BYTES'))
  assert.ok(packets[3].checks.some(c=>c.stage==='Mock Policy'&&c.eligible===false))
  assert.equal((await service.accounts.account(identity)).quota.completed,0)
  assert.equal((await service.accounts.account(identity)).quota.remaining,10)
  report('negative-controls',{executed:true,syntheticOnly:true,faults:['deny_mock','invalid_output','post_validation_swap','revoke_before_use'],controller:packets})
})

test.after(async()=>{
  for(const uid of uids){
    await db.recursiveDelete(db.doc('inspireAccounts/'+uid));await db.doc('inspirePreferences/'+uid).delete()
    const ops=await db.collection('inspireOperations').where('uid','==',uid).get();await Promise.all(ops.docs.map(d=>d.ref.delete()))
    await auth.deleteUser(uid)
  }
  await db.terminate()
})
