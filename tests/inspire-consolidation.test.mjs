import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {randomUUID, createHash} from 'node:crypto'
import {mkdirSync, writeFileSync} from 'node:fs'
import {setTimeout as delay} from 'node:timers/promises'
import {createLocalService, requireLocalEmulators} from '../functions/src/inspireLocalService.ts'
import {emptyPreferences, vietnamMonth} from '../functions/src/inspireAccount.ts'
import {importSource} from '../functions/src/inspireKnowledge.ts'
import config from '../vite.config.ts'

process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
requireLocalEmulators()
const require = createRequire(new URL('../functions/package.json', import.meta.url))
const db = require('firebase-admin/firestore').getFirestore()
const adminAuth = require('firebase-admin/auth').getAuth()
const noRate = async () => ({allowed:true})
const accounts = []
async function member() {
  const user = await adminAuth.createUser({email:`review-${randomUUID()}@synthetic.invalid`, password:'Synthetic-review-only-7!'})
  accounts.push(user.uid)
  return {uid:user.uid, registered:true, providers:['password'], email:user.email, createdAt:user.metadata.creationTime}
}
function request(service, identity, text = 'Nội dung giả định cho kiểm thử') {
  const {epoch,sessionId} = service.session(identity)
  return {kind:'send', epoch,sessionId, conversationId:randomUUID(),operationId:randomUUID(),
    messages:[{id:randomUUID(),role:'user',text}]}
}
async function until(predicate) {
  for (let i=0;i<300;i++) { if (predicate()) return; await delay(20) }
  throw Error('Deferred offline adapter did not reach the expected phase')
}

test('permitted synthetic passages and exact provenance reach the constructed adapter input', async (t) => {
  const marker = 'reviewsource' + randomUUID().replaceAll('-','')
  const id = 'review-fixture-' + randomUUID()
  const passage = `${marker} PRIVATE_KNOWLEDGE_REVIEW_CANARY: Đoạn kiến thức tổng hợp cho kiểm thử kết nối, không phải tài liệu INSPIRE được duyệt.`
  const raw = Buffer.from(passage)
  const metadata = {collection:'INSPIRE',documentId:id,title:'SYNTHETIC / OFFLINE TEST ONLY',status:'published-supporting',permittedUse:'supporting-retrieval',rawFile:'synthetic-fixture'}
  t.after(() => db.recursiveDelete(db.doc('inspireKnowledge/'+id)))
  await importSource(metadata,raw,passage)
  const identity = await member()
  let captured
  const service = createLocalService({mode:'simulation',reply:async (context)=>{
    captured=structuredClone(context)
    return 'Phản hồi kỹ thuật mô phỏng; không có mô hình được gọi.'
  }}, Date.now,noRate)
  const preferences = {...emptyPreferences,name:'PRIVATE_PROFILE_REVIEW_CANARY',context:'Bối cảnh hoàn toàn giả định.'}
  await service.accounts.savePreferences(identity,preferences)
  const r = request(service,identity,marker)
  const response = await service.handle(r,identity,'synthetic-trace')
  const hash=createHash('sha256').update(raw).digest('hex')
  const section=captured.supportingKnowledge.find((section)=>section.documentId===id)
  assert.deepEqual(section,{documentId:id,version:1,hash,sectionId:id+'-0',title:metadata.title,text:passage,sourceStatus:'published-supporting',sectionHash:hash,headingPath:[],startOffset:0,endOffset:passage.length,startLine:1,endLine:1})
  assert.deepEqual(captured.messages,r.messages)
  assert.deepEqual(captured.userStatedPreferences,preferences)
  assert.ok(captured.operatingInstructions.some(line=>line.includes('WHAT → WHERE → WHY → TOWARD WHAT → HOW')))
  assert.equal(response.mode,'simulation')
  mkdirSync('docs/evidence/inspire-review',{recursive:true})
  writeFileSync('docs/evidence/inspire-review/adapter-input-trace.json',JSON.stringify({
    executed:true, scope:'synthetic permitted offline fixture only',
    actualSourceRuntimePermissionEstablished:false,paidModelCalled:false,
    path:['Firestore permitted fixture','retrieveKnowledge','createLocalService constructed ModelContext','injected offline ModelAdapter.reply(context)'],
    fixtureOriginalBytesSha256:hash, adapterInput:captured,
    assertions:['exact passage bytes in adapter input','exact document/version/hash/section reference','ordered message preserved','preferences kept separate','core instructions kept separate'],
  },null,2))
})

test('registered concurrent requests at 28/30 reserve only the final two slots',async()=>{
  const identity=await member(),period=vietnamMonth(Date.now()).key
  await db.doc(`inspireAccounts/${identity.uid}/usage/${period}`).set({period,completed:28,reserved:0})
  const releases=[]
  let calls=0
  const service=createLocalService({mode:'simulation',reply:async()=>{calls++;return new Promise(resolve=>releases.push(resolve))}},Date.now,noRate)
  const requests=Array.from({length:4},()=>request(service,identity))
  const pending=Promise.allSettled(requests.map(r=>service.handle(r,identity,'synthetic-concurrent')))
  await until(()=>calls===2)
  const held=await service.accounts.account(identity)
  assert.equal(held.quota.completed,28);assert.equal(held.quota.pending,2);assert.equal(held.quota.remaining,0)
  releases.forEach(release=>release('Phản hồi mô phỏng cuối hạn mức.'))
  const results=await pending
  assert.equal(results.filter(result=>result.status==='fulfilled').length,2)
  assert.ok(results.filter(result=>result.status==='rejected').every(result=>result.reason.code==='QUOTA_EXHAUSTED'))
  assert.equal((await service.accounts.account(identity)).quota.completed,30)
  for(let i=0;i<results.length;i++) if(results[i].status==='fulfilled') await service.handle({...requests[i],kind:'replay'},identity,'synthetic-concurrent')
  assert.equal(calls,2)
  assert.equal((await service.accounts.account(identity)).quota.completed,30)
})

test('actual in-flight adapter spans Vietnam midnight and replay does not charge the new month twice',async()=>{
  let now=Date.parse('2026-11-30T16:59:59.999Z'),release
  const identity=await member()
  const service=createLocalService({mode:'simulation',reply:async()=>new Promise(resolve=>{release=resolve})},()=>now,noRate)
  const r=request(service,identity),pending=service.handle(r,identity,'synthetic-midnight')
  await until(()=>!!release)
  assert.equal((await service.accounts.account(identity)).quota.pending,1)
  now++
  assert.equal((await service.accounts.account(identity)).quota.period,'2026-12')
  assert.equal((await service.accounts.account(identity)).quota.remaining,29)
  release('Phản hồi giả định hoàn tất sau nửa đêm.')
  const answer=await pending
  const after=await service.accounts.account(identity)
  assert.equal(after.quota.completed,1);assert.equal(after.quota.pending,0)
  assert.deepEqual(await service.handle({...r,kind:'replay'},identity,'synthetic-midnight'),answer)
  assert.equal((await service.accounts.account(identity)).quota.completed,1)
  assert.equal((await db.doc(`inspireAccounts/${identity.uid}/usage/2026-11`).get()).data().completed,0)
})

test('unknown outcome stays reserved across restart until independent synthetic completion evidence is reconciled once',async()=>{
  const identity=await member(),receipts=new Map()
  let operation
  const service=createLocalService({mode:'simulation',reply:async()=>{
    receipts.set(operation,{completed:true})
    throw Error('Synthetic connection lost after simulated completion')
  }},Date.now,noRate)
  const r=request(service,identity);operation=r.operationId
  await assert.rejects(service.handle(r,identity,'synthetic-reconcile'),{code:'OUTCOME_UNKNOWN'})
  const restarted=createLocalService(undefined,Date.now,noRate)
  await assert.rejects(restarted.handle({...r,kind:'replay'},identity,'synthetic-reconcile'),{code:'SESSION_LOST'})
  assert.equal((await restarted.accounts.account(identity)).quota.pending,1)
  assert.equal(receipts.get(operation).completed,true)
  // Test-only independent receipt; no production reconciliation authority claimed.
  await restarted.accounts.settle(identity,operation,'completed')
  await restarted.accounts.settle(identity,operation,'completed')
  const reconciled=await restarted.accounts.account(identity)
  assert.equal(reconciled.quota.completed,1);assert.equal(reconciled.quota.pending,0)
  await assert.rejects(restarted.accounts.settle(identity,operation,'failed'),{code:'RECONCILIATION'})
})

test('production config does not initialize a demo service or enable emulator middleware, even with emulator variables set',async()=>{
  const before={auth:process.env.FIREBASE_AUTH_EMULATOR_HOST,store:process.env.FIRESTORE_EMULATOR_HOST}
  for(const env of [{command:'build',mode:'production'},{command:'build',mode:'development'},
    {command:'serve',mode:'production'},{command:'serve',mode:'development',isPreview:true}]) {
    const resolved=await config(env)
    assert.ok(!resolved.plugins.flat(Infinity).some(plugin=>plugin?.name==='inspire-offline-prototype'))
  }
  assert.deepEqual({auth:process.env.FIREBASE_AUTH_EMULATOR_HOST,store:process.env.FIRESTORE_EMULATOR_HOST},before)
  const original=process.env.NODE_ENV
  try {process.env.NODE_ENV='production';assert.throws(()=>createLocalService(),{code:'PRODUCTION_CLOSED'})}
  finally {if(original===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=original}
})

test.after(async()=>{
  for(const uid of accounts){
    await db.recursiveDelete(db.doc('inspireAccounts/'+uid))
    await db.doc('inspirePreferences/'+uid).delete()
    const operations=await db.collection('inspireOperations').where('uid','==',uid).get()
    await Promise.all(operations.docs.map(doc=>doc.ref.delete()))
    await adminAuth.deleteUser(uid)
  }
  await db.terminate()
})
