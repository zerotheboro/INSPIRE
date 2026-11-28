// Offline only: real demo Firestore/Auth; injected model sender; no key reads.
import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {randomUUID} from 'node:crypto'
import {resolve} from 'node:path'
import {mkdirSync,writeFileSync} from 'node:fs'
import {setImmediate as nextTurn} from 'node:timers/promises'
import {requireLocalEmulators} from '../functions/src/inspireLocalService.ts'
import {createPrivateLunaService} from '../functions/src/inspireLunaService.ts'
import {importSource} from '../functions/src/inspireKnowledge.ts'
import {LUNA_API,lunaHash,prepareLunaApi} from '../functions/src/inspireLunaApi.ts'
import {createLunaController} from '../functions/src/inspireLunaController.ts'
import {emptyPreferences} from '../functions/src/inspireAccount.ts'
process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';requireLocalEmulators()
const require=createRequire(new URL('../functions/package.json',import.meta.url)),{getFirestore}=require('firebase-admin/firestore'),{Query,FieldValue}=require('@google-cloud/firestore'),db=getFirestore(),auth=require('firebase-admin/auth').getAuth()
const out=process.env.INSPIRE_REVIEW_EVIDENCE_DIR||'docs/evidence/api-rag-2026-11-25/two-failures-fixed',trace=[],ids=[]
const deferred=()=>{let resolve;const result=new Promise(r=>resolve=r);return{result,resolve}}
const reply=()=>({id:'offline',status:'completed',model:LUNA_API.model,usage:{input_tokens:20,output_tokens:30},output:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'Phản hồi giả lập chỉ kiểm tra kỹ thuật.'}]}]})
const fakeController=()=>({async preflight(){},async validate(){},evidence(){return[]}})
async function member(t){const u=await auth.createUser({email:randomUUID()+'@synthetic.invalid',password:'Synthetic-only-753!'});t.after(()=>auth.deleteUser(u.uid));return{uid:u.uid,registered:true,providers:['password'],email:u.email,createdAt:u.metadata.creationTime}}
async function source(){const id='failure-'+randomUUID(),marker='zfailure'+randomUUID().replaceAll('-',''),text='# '+marker+'\nNguồn tổng hợp kiểm thử kỹ thuật.',hash=lunaHash(text);ids.push(id);await importSource({collection:'INSPIRE',documentId:id,title:'SYNTHETIC ONLY',status:'published-supporting',permittedUse:'supporting-retrieval',rawFile:hash,kind:'reference',permissions:{sourceHash:hash,internalResearch:true,externalExport:true,evidence:'SYNTHETIC TEST ONLY'}},Buffer.from(text),text);return{id,marker}}
const request=(s,i,text)=>{const{epoch,sessionId}=s.session(i);return{epoch,sessionId,kind:'send',operationId:randomUUID(),conversationId:randomUUID(),messages:[{id:'u1',role:'user',text}]}}
const codes=e=>{const a=[],seen=new Set();for(let n=e;n&&!seen.has(n)&&a.length<10;n=n.cause){seen.add(n);const code=n.code??n.message;if(typeof code==='string'&&/^[A-Z][A-Z0-9_]*$/.test(code))a.push(code)}return a}

test('cold duplicate previews share retrieval and a late preview cannot reset an already consumed attempt',async t=>{
 const identity=await member(t),fixture=await source(),entered=deferred(),releaseFirst=deferred(),releaseSecond=deferred(),secondAccount=deferred()
 let queries=0,accountCalls=0,sends=0,consumed=false
 const service=createPrivateLunaService({controller:fakeController(),rateCheck:async()=>({allowed:true}),store:{configured:()=>false,authorized:()=>!consumed,consume(){consumed=true;return'OFFLINE_FAKE_KEY'},receipt:()=>0},send:async()=>{sends++;return reply()}})
 const r=request(service,identity,fixture.marker),get=Query.prototype.get,account=service.accounts.account.bind(service.accounts)
 service.accounts.account=async(...args)=>{const result=await account(...args);if(++accountCalls===2)secondAccount.resolve();return result}
 t.mock.method(Query.prototype,'get',async function(...args){const result=await get.apply(this,args);if(result.docs.some(d=>d.id===fixture.id)){queries++;if(queries===1){entered.resolve();await releaseFirst.result}else await releaseSecond.result}return result})
 const a=service.handlePrivate({kind:'preview',request:r},identity,'offline')
 await entered.result
 const b=service.handlePrivate({kind:'preview',request:r},identity,'offline')
 try {
  await secondAccount.result;await nextTurn()
  releaseFirst.resolve();const first=await a
  const delivered=await service.handlePrivate({kind:'execute',request:r},identity,'offline')
  releaseSecond.resolve();const late=await b
  assert.equal(late.payloadSHA,first.payloadSHA);assert.equal(late.binding,first.binding)
  assert.deepEqual(await service.handlePrivate({kind:'execute',request:{...r,kind:'replay'}},identity,'offline'),delivered)
  await assert.rejects(service.handlePrivate({kind:'preview',request:{...r,messages:[{...r.messages[0],text:'changed'}]}},identity,'offline'),{code:'OPERATION_CONFLICT'})
  assert.equal(queries,1);assert.equal(sends,1);assert.equal((await service.accounts.account(identity)).quota.completed,1)
  trace.push({case:'cold duplicate/late preview',queries,sends,identicalBinding:true,replayWithoutAnotherAuthorization:true})
 }finally{releaseFirst.resolve();releaseSecond.resolve();await Promise.allSettled([a,b])}
})

test('an unrelated revision does not run unused retrieval after a frozen preview; exact sources are still rechecked',async t=>{
 const identity=await member(t),fixture=await source();let queries=0,sends=0
 const service=createPrivateLunaService({controller:fakeController(),rateCheck:async()=>({allowed:true}),store:{configured:()=>false,authorized:()=>true,consume:()=> 'OFFLINE_FAKE_KEY',receipt:()=>0},send:async()=>{sends++;return reply()}})
 const r=request(service,identity,fixture.marker),p=await service.handlePrivate({kind:'preview',request:r},identity,'offline')
 assert.equal(p.sourceCount,1)
 await db.doc('inspireKnowledge/_index').set({revision:FieldValue.increment(1)},{merge:true})
 const get=Query.prototype.get
 t.mock.method(Query.prototype,'get',async function(...args){
  queries++;const result=await get.apply(this,args)
  // Real revision check, not a fabricated retrieval exception: unrelated
  // metadata changes while the redundant query is being read.
  await db.doc('inspireKnowledge/_index').set({revision:FieldValue.increment(1)},{merge:true})
  return result
 })
 let result
 try{result=await service.handlePrivate({kind:'execute',request:r},identity,'offline')}
 catch(e){trace.push({case:'unnecessary search after frozen preview',trigger:'actual index revision changed during Query.get',observedError:e.code,queries,sends});throw e}
 assert.equal(result.mode,'private-model');assert.equal(sends,1);assert.equal(queries,0)
 trace.push({case:'frozen exact source after unrelated revision',queries,sends})
})

test('ATTEMPT_FAILED retains a native ENOENT cause internally while browser JSON stays redacted',async t=>{
 const identity=await member(t),previous=process.env.INSPIRE_CONTROLLER_PYTHON;let sends=0,keyReads=0
 const service=createPrivateLunaService({sourceFree:true,rateCheck:async()=>({allowed:true}),store:{configured:()=>false,authorized:()=>true,consume(){keyReads++;return'OFFLINE_FAKE_KEY'},receipt:()=>0},send:async()=>{sends++;return reply()}})
 const r=request(service,identity,'Tình huống tổng hợp kiểm tra lỗi kết nối.')
 await service.handlePrivate({kind:'preview',request:r},identity,'offline')
 process.env.INSPIRE_CONTROLLER_PYTHON=resolve('.private.local/does-not-exist-'+randomUUID()+'.exe')
 try {
  await assert.rejects(service.handlePrivate({kind:'execute',request:r},identity,'offline'),e=>{
   assert.deepEqual(codes(e),['ATTEMPT_FAILED','LUNA_PRE_DISPATCH_HOLD','LUNA_CONTROLLER_PREFLIGHT_HOLD','NATIVE_UNAVAILABLE','ENOENT'])
   assert.equal(Object.getOwnPropertyDescriptor(e,'cause').enumerable,false)
   const json=JSON.stringify(e);assert.ok(!/cause|ENOENT|does-not-exist|PRIVATE|sk-/.test(json))
   trace.push({case:'missing native executable',causeCodes:codes(e),browserJSONRedacted:true});return true
  })
  assert.equal(sends,0);assert.equal(keyReads,0);assert.equal((await service.accounts.account(identity)).quota.completed,0)
 }finally{if(previous===undefined)delete process.env.INSPIRE_CONTROLLER_PYTHON;else process.env.INSPIRE_CONTROLLER_PYTHON=previous}
})

test('original native safety refusal retains only its allowlisted hold reason',async()=>{
 const r={kind:'send',epoch:'offline',sessionId:'offline',operationId:'offline-risk',conversationId:'offline',messages:[{id:'u1',role:'user',text:'Tối nay tôi sẽ tự tử. Tôi đã chuẩn bị thuốc và định thực hiện.'}]}
 const p=prepareLunaApi({messages:r.messages,operatingInstructions:[],supportingKnowledge:[],userStatedPreferences:emptyPreferences},r)
 await assert.rejects(createLunaController().preflight(p),e=>{
  assert.deepEqual(codes(e),['LUNA_CONTROLLER_PREFLIGHT_HOLD','NATIVE_SAFETY_GATE_HELD_CANDIDATE'])
  assert.ok(!JSON.stringify(e).includes(r.messages[0].text))
  trace.push({case:'original native safety hold',causeCodes:codes(e),rawPromptSerialized:false});return true
 })
})

test.after(async()=>{for(const id of ids)await db.recursiveDelete(db.doc('inspireKnowledge/'+id));await db.doc('inspireKnowledge/_index').set({revision:FieldValue.increment(1)},{merge:true});mkdirSync(out,{recursive:true});writeFileSync(out+'/regression-trace.json',JSON.stringify({executed:true,model:'INJECTED OFFLINE ONLY',realKeyRead:false,paidCalls:0,trace},null,2));await db.terminate()})
