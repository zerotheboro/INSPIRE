// Offline only: real demo Firestore, fake provider/counting and no dotenv.
import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {createRequire} from 'node:module'
import {mkdtempSync,writeFileSync,mkdirSync,rmSync,readFileSync,existsSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {requireLocalEmulators} from '../functions/src/inspireLocalService.ts'
import {importSource} from '../functions/src/inspireKnowledge.ts'
import {lunaSessionBudget} from '../functions/src/inspireLunaBudget.ts'
import {createPrivateLunaService} from '../functions/src/inspireLunaService.ts'
import {lunaHash,LUNA_API,countLunaInput} from '../functions/src/inspireLunaApi.ts'
import {createPrivateConversationTransport} from '../src/services/InspireAIconnect.ts'
import {ConversationStore} from '../src/services/inspireConversation.ts'
process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';requireLocalEmulators()
const require=createRequire(new URL('../functions/package.json',import.meta.url)),db=require('firebase-admin/firestore').getFirestore()
const raw=()=>({id:'offline-only',status:'completed',model:LUNA_API.model,usage:{input_tokens:30,output_tokens:20,input_tokens_details:{cached_tokens:0,cache_write_tokens:0}},output:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'Phản hồi tổng hợp để kiểm tra kỹ thuật.'}]}]})
async function fixture(t,limits={}){
 const root=mkdtempSync(join(tmpdir(),'inspire-conversation-')),uid=randomUUID(),id='conv-'+randomUUID(),marker='zzconversation'+randomUUID().replaceAll('-',''),text='# '+marker+'\nĐoạn tham khảo tổng hợp.',hash=lunaHash(text)
 const record={collection:'INSPIRE',documentId:id,title:'SYNTHETIC',rawFile:hash,status:'published-supporting',permittedUse:'supporting-retrieval',kind:'reference',permissions:{sourceHash:hash,internalResearch:true,externalExport:true,evidence:'SYNTHETIC ONLY'}}
 await importSource(record,Buffer.from(text),text)
 writeFileSync(join(root,'policy.json'),JSON.stringify({schema:'inspire-private-budget-v1',sessionId:'offline-private',approved:true,purpose:'father',uid,maxAttempts:3,maxCostNanoUSD:100000000,expiresAt:'2026-12-01T00:00:00Z',messagesSHA:null,ownerDecision:'OFFLINE FIXTURE ONLY',model:LUNA_API.model,...limits}))
 const identity={uid,registered:false,email:null,providers:[],createdAt:new Date().toISOString()},budget=lunaSessionBudget(root)
 let sends=0,counts=0,quarantines=0,validations=0
 const contexts=[]
 const create=(overrides={})=>createPrivateLunaService({conversation:budget,controller:{async preflight(){},async validate(){validations++},evidence:()=>[]},rateCheck:async()=>({allowed:true}),countInput:async()=>{counts++;return 30},quarantine:()=>{quarantines++},send:async p=>{sends++;contexts.push(p);return raw()},...overrides})
 t.after(async()=>{await db.recursiveDelete(db.doc('inspireKnowledge/'+id));await db.recursiveDelete(db.doc('inspireAccounts/'+uid));assert.ok(resolve(root).startsWith(resolve(tmpdir(),'inspire-conversation-')));rmSync(root,{recursive:true,force:true})})
 const old=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='sk-OFFLINE_ONLY_no_real_secret';t.after(()=>{if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old})
 const request=service=>{const s=service.session(identity);return {kind:'send',epoch:s.epoch,sessionId:s.sessionId,operationId:randomUUID(),conversationId:randomUUID(),messages:[{id:randomUUID(),role:'user',text:'Tình huống giả định: '+marker}]}}
 return {root,uid,identity,budget,create,request,record,text,contexts,stats:()=>({sends,counts,quarantines,validations})}
}
test('ordinary Send automatically retrieves/counts/generates/validates, carries history and corrections, and replays without generation',async t=>{
 const f=await fixture(t),service=f.create(),r=f.request(service)
 const first=await service.handlePrivate({kind:'conversation',request:r},f.identity,'local')
 assert.equal(first.response.mode,'private-model');assert.equal(first.diagnostics.sourceCount,1)
 const next={...r,operationId:randomUUID(),messages:[...r.messages,first.response.message,{id:'followup',role:'user',text:'Vậy nếu chỉ có nửa giờ thì sao?'}]}
 const second=await service.handlePrivate({kind:'conversation',request:next},f.identity,'local')
 const correction={...next,operationId:randomUUID(),messages:[...next.messages,second.response.message,{id:'correction',role:'user',text:'Đính chính: đây là tình huống giả định về sắp xếp công việc.',correctionOf:r.messages[0].id}]}
 const [a,b]=await Promise.all([service.handlePrivate({kind:'conversation',request:correction},f.identity,'local'),service.handlePrivate({kind:'conversation',request:{...correction,kind:'replay'}},f.identity,'local')])
 assert.deepEqual(a.response,b.response);assert.equal(f.stats().sends,3);assert.equal(f.stats().counts,3);assert.equal(f.stats().validations,3)
 assert.deepEqual(f.contexts[2].request.messages,correction.messages)
 assert.match(f.contexts[0].payload.instructions,/Không tự giả định tuổi/)
 assert.equal(f.budget.status(f.uid).generationDispatches,3)
 assert.equal(f.budget.status(f.uid).reservedAttempts,3)
})
test('hard attempt and total reservation limits reject before token count/model, including concurrent requests',async t=>{
 const f=await fixture(t,{maxAttempts:1}),service=f.create(),r=f.request(service)
 await service.handlePrivate({kind:'conversation',request:r},f.identity,'local')
 const other=f.request(service);other.messages[0].text+=' Câu hỏi khác.'
 await assert.rejects(service.handlePrivate({kind:'conversation',request:other},f.identity,'local'),{code:'SESSION_ATTEMPTS_EXHAUSTED',retry:'none'})
 assert.equal(f.stats().sends,1);assert.equal(f.stats().counts,1)
 const policy=JSON.parse(readFileSync(join(f.root,'policy.json'),'utf8'));policy.sessionId='budget-exhausted';policy.maxAttempts=10;policy.maxCostNanoUSD=1;writeFileSync(join(f.root,'policy.json'),JSON.stringify(policy))
 await assert.rejects(service.handlePrivate({kind:'conversation',request:f.request(service)},f.identity,'local'),{code:'SESSION_BUDGET_EXHAUSTED'})
 assert.equal(f.stats().sends,1)
})
test('unknown generation stays consumed across restart and does not multiply when identities/operation IDs change',async t=>{
 const f=await fixture(t);let calls=0
 const service=f.create({send:async()=>{calls++;throw Error('offline unknown')}}),r=f.request(service)
 await assert.rejects(service.handlePrivate({kind:'conversation',request:r},f.identity,'local'),{code:'OUTCOME_UNKNOWN',retry:'none'})
 await assert.rejects(service.handlePrivate({kind:'conversation',request:{...r,kind:'replay'}},f.identity,'local'),{code:'OUTCOME_UNKNOWN'})
 const restarted=f.create({send:async()=>{calls++;return raw()}})
 await assert.rejects(restarted.handlePrivate({kind:'conversation',request:{...r,kind:'replay'}},f.identity,'local'),{code:'RESULT_UNKNOWN'})
 const changed=f.request(restarted)
 changed.messages[0].id='new-message-id'
 await assert.rejects(restarted.handlePrivate({kind:'conversation',request:changed},f.identity,'local'),{code:'OUTCOME_UNKNOWN'})
 await assert.rejects(restarted.handlePrivate({kind:'conversation',request:changed},{...f.identity,uid:'different'},'local'),{code:'SESSION_IDENTITY'})
 assert.equal(calls,1)
})
test('malformed/forged fields and roles stop before retrieval or budget reservation',async t=>{
 const f=await fixture(t),service=f.create(),r=f.request(service)
 for(const data of [{kind:'conversation',request:r,approved:true},{kind:'conversation',request:{...r,quota:999}},{kind:'conversation',request:{...r,messages:[{...r.messages[0],role:'system'}]}},{kind:'conversation',request:{...r,messages:[{...r.messages[0],text:'x'.repeat(2001)}]}}])await assert.rejects(service.handlePrivate(data,f.identity,'local'))
 assert.equal(f.stats().sends,0);assert.equal(f.budget.status(f.uid).reservedAttempts,0)
})
test('revocation during token count, token-bound overflow, and invalid outputs never become successful replies',async t=>{
 const f=await fixture(t),service=f.create({countInput:async()=>{await importSource({...f.record,permissions:{...f.record.permissions,externalExport:false}},Buffer.from(f.text),f.text);return 30}})
 await assert.rejects(service.handlePrivate({kind:'conversation',request:f.request(service)},f.identity,'local'),{code:'OUTCOME_UNKNOWN',retry:'none'})
 assert.equal(f.stats().sends,0)
 const next=f.create({countInput:async()=>10000000}),r=f.request(next);r.messages[0].text+=' Mới.'
 await assert.rejects(next.handlePrivate({kind:'conversation',request:r},f.identity,'local'),{code:'OUTCOME_UNKNOWN'})
 assert.equal(f.stats().sends,0)
})
test('corrupt or crashed ledger fails closed; first SDK UID is durable and status does not claim it',async t=>{
 const f=await fixture(t,{uid:null}),service=f.create(),r=f.request(service)
 assert.equal(f.budget.status(f.uid).released,true)
 assert.equal(existsSync(join(f.root,'offline-private','identity.json')),false)
 f.budget.permit(f.uid,r)
 assert.throws(()=>lunaSessionBudget(f.root).permit('other',r),{code:'SESSION_IDENTITY'})
 writeFileSync(join(f.root,'offline-private','writer.lock'),'crash fixture')
 await assert.rejects(service.handlePrivate({kind:'conversation',request:r},f.identity,'local'),{code:'SESSION_STORAGE_LOCKED'})
 assert.equal(f.stats().sends,0)
})
test('actual conversation store/transport normal Send has no preview/grant step and guards duplicate clicks',async t=>{
 const f=await fixture(t),service=f.create(),kinds=[]
 const transport=createPrivateConversationTransport(()=>{},async(_url,options)=>{const body=JSON.parse(options.body);kinds.push(body.kind);try{return Response.json(await service.handlePrivate(body,f.identity,'local'))}catch(error){return Response.json({error:{code:error.code,message:error.message,retry:error.retry}},{status:error.status??503})}},async()=> 'synthetic-sdk-token')
 const store=new ConversationStore(transport),id=store.getSnapshot().activeId
 store.draft(id,'Tình huống giả định: '+f.request(service).messages[0].text)
 await Promise.all([store.send(id),store.send(id)])
 assert.deepEqual(kinds,['session','conversation']);assert.equal(f.stats().sends,1)
 assert.equal(store.getSnapshot().conversations[0].messages.length,2)
})
test.after(async()=>db.terminate())

test('provider token counting uses one fixed non-inference request and never retries a 429',async()=>{
 const old=globalThis.fetch,calls=[]
 globalThis.fetch=async(url,options)=>{calls.push({url:String(url),body:JSON.parse(options.body)});return Response.json({error:{message:'OFFLINE ONLY',type:'rate_limit_error'}},{status:429})}
 try{
  const p={payload:{model:LUNA_API.model,input:[{role:'user',content:'Dữ liệu giả.'}],instructions:'Tiếng Việt.',reasoning:{effort:'none'}}}
  await assert.rejects(countLunaInput(p,'sk-offline_only_no_real_credential'),{code:'OPENAI_TOKEN_COUNT',retry:'none'})
  assert.equal(calls.length,1);assert.equal(calls[0].url,'https://api.openai.com/v1/responses/input_tokens')
  assert.deepEqual(calls[0].body.tools,[]);assert.equal(calls[0].body.truncation,'disabled');assert.deepEqual(calls[0].body.input,p.payload.input)
 }finally{globalThis.fetch=old}
})
