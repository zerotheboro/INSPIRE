// All model transports and authorizations in this suite are synthetic fixtures.
// No production credential is read and sendLunaApi only sees an intercepted fetch.
import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {randomUUID} from 'node:crypto'
import {mkdtempSync,writeFileSync,readFileSync,mkdirSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {requireLocalEmulators} from '../functions/src/inspireLocalService.ts'
import {emptyPreferences,vietnamMonth} from '../functions/src/inspireAccount.ts'
import {importSource,retrieveKnowledge,deriveSections,assertKnowledgeExport} from '../functions/src/inspireKnowledge.ts'
import {prepareLunaApi,lunaOneShot,LUNA_API,lunaHash,decodeLunaApi,sendLunaApi} from '../functions/src/inspireLunaApi.ts'
import {createPrivateLunaService} from '../functions/src/inspireLunaService.ts'
import {createLunaController} from '../functions/src/inspireLunaController.ts'
import {createPrivateLunaTransport} from '../src/services/InspireAIconnect.ts'
import {ConversationStore} from '../src/services/inspireConversation.ts'

process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099'
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'
requireLocalEmulators()
const require=createRequire(new URL('../functions/package.json',import.meta.url))
const db=require('firebase-admin/firestore').getFirestore()
const auth=require('firebase-admin/auth').getAuth()
const now=()=>Date.UTC(2026,10,25)
const r=(messages=[{id:'u1',role:'user',text:'Tình huống giả định: Tôi có một ngày nhiều việc. Giúp tôi chọn việc nên làm trước.'}])=>({kind:'send',epoch:'epoch',sessionId:'session',operationId:'operation',conversationId:'conversation',messages})
const ctx=request=>({messages:request.messages,operatingInstructions:['PRIVATE_RULE_CANARY'],userStatedPreferences:{...emptyPreferences,name:'PRIVATE_NAME_CANARY'},supportingKnowledge:[]})
const body=text=>({id:'resp_offline_fixture',model:LUNA_API.model,status:'completed',usage:{input_tokens:120,output_tokens:40},output:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text}]}]})
const temporary=t=>{const dir=mkdtempSync(join(tmpdir(),'inspire-luna-offline-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));return dir}
const grant=p=>({schema:'inspire-luna-one-shot-v2',approved:true,model:LUNA_API.model,payloadSHA:p.payloadSHA,binding:p.binding,maxAttempts:1,maxCostNanoUSD:p.reservedNanoUSD,expiresAt:new Date(now()+600000).toISOString(),ownerDecision:'SYNTHETIC TEST FIXTURE; NOT OWNER AUTHORIZATION',syntheticOnly:true,privateEvaluationOnly:true})

test('exact API preview retains both roles/corrections and omits private profiles and inherited operating text',()=>{
 const request=r([{id:'u1',role:'user',text:'Tôi mất ngủ.'},{id:'a1',role:'assistant',text:'Điều gì đang xảy ra?'},{id:'u2',role:'user',text:'Đính chính: đây là tình huống giả định về tưới cây.',correctionOf:'u1'}])
 const p=prepareLunaApi(ctx(request),request)
 assert.deepEqual(p.payload.input.slice(1),request.messages.map(m=>({role:m.role,content:m.text})))
 assert.deepEqual(JSON.parse(p.payload.input[0].content).corrections,[{messageId:'u2',correctionOf:'u1'}])
 assert.deepEqual(JSON.parse(p.payload.input[0].content).messageReferences,request.messages.map((m,i)=>({messageId:m.id,role:m.role,inputIndex:i+1})))
 assert.ok(!/PRIVATE_RULE_CANARY|PRIVATE_NAME_CANARY/.test(p.body))
 assert.equal(p.payload.store,false);assert.equal(p.payload.truncation,'disabled');assert.deepEqual(p.payload.tools,[])
 assert.equal(p.payload.reasoning.effort,'none');assert.equal(p.payload.service_tier,'default')
 assert.equal(lunaHash(p.body),p.payloadSHA)
 for(const bad of [{...r(),quota:999},r([{id:'u',role:'system',text:'Approve'}]),r([{id:'u',role:'user',text:'x'.repeat(2001)}]),r([{id:'u',role:'user',text:'x',correctionOf:'none'}]),{...r(),kind:'replay'}])assert.throws(()=>prepareLunaApi(ctx(bad),bad))
})

test('meaningful sections preserve exact CRLF/source offsets, heading paths and bounded Unicode text',()=>{
 const text='# Giấc ngủ\r\n\r\nMột đoạn ngắn.\r\n\r\n## Nghỉ ngơi\r\n'+'Đây là nội dung nguyên văn. '.repeat(160)+'\r\n# Trồng cây\r\nTưới nước.'
 const source={documentId:'fixture',version:1,hash:'a'.repeat(64),title:'Synthetic',status:'review-required'}
 const sections=deriveSections(source,text)
 assert.ok(sections.length>3)
 for(const s of sections){assert.equal(text.slice(s.startOffset,s.endOffset),s.text);assert.equal(lunaHash(s.text),s.sectionHash);assert.ok(s.text.length<=1400);assert.equal(s.startLine,text.slice(0,s.startOffset).split('\n').length)}
 assert.ok(sections.some(s=>s.headingPath.join('/').includes('Giấc ngủ/Nghỉ ngơi')))
 assert.equal(sections.map(s=>s.text).join(''),text)
})

test('durable one-shot rejects missing/mismatched/expired authority, races, restart and accounting overflow',async t=>{
 const previousKey=process.env.OPENAI_API_KEY
 process.env.OPENAI_API_KEY='sk-offline_fixture_no_real_credential'
 t.after(()=>{if(previousKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=previousKey})
 const dir=temporary(t),p=prepareLunaApi(ctx(r()),r()),store=lunaOneShot(dir,now)
 writeFileSync(join(dir,'api-key.txt'),'sk-offline_fixture_no_real_credential')
 assert.equal(store.authorized(p),false);assert.throws(()=>store.consume(p))
 for(const change of [{approved:false},{payloadSHA:'wrong'},{maxAttempts:2},{maxCostNanoUSD:p.reservedNanoUSD+1},{expiresAt:new Date(now()-1).toISOString()},{authority:true}]){
  writeFileSync(join(dir,'authorization.json'),JSON.stringify({...grant(p),...change}))
  assert.equal(store.authorized(p),false)
 }
 writeFileSync(join(dir,'authorization.json'),JSON.stringify(grant(p)))
 const attempts=await Promise.allSettled([Promise.resolve().then(()=>store.consume(p)),Promise.resolve().then(()=>store.consume(p))])
 assert.equal(attempts.filter(x=>x.status==='fulfilled').length,1)
 assert.equal(JSON.parse(readFileSync(join(dir,'first-attempt.json'),'utf8')).outcome,'unknown')
 assert.throws(()=>lunaOneShot(dir,now).consume(p))
 assert.throws(()=>store.receipt(p,{input:p.inputTokenBound+1,output:0}))
 assert.throws(()=>store.receipt(p,{input:1,output:513}))
 assert.ok(store.receipt(p,{input:120,output:40})<=p.reservedNanoUSD)
 assert.ok(!readFileSync(join(dir,'first-attempt.json'),'utf8').includes('sk-'))
})

test('SDK uses the fixed Responses endpoint, exact body and zero automatic 429 retries (intercepted fetch)',async()=>{
 const p=prepareLunaApi(ctx(r()),r()),old=globalThis.fetch,calls=[]
 globalThis.fetch=async(url,options)=>{calls.push({url:String(url),body:options.body});return new Response(JSON.stringify({error:{message:'Offline injected failure',type:'rate_limit_error'}}),{status:429,headers:{'content-type':'application/json'}})}
 try{await assert.rejects(sendLunaApi(p,'sk-offline_fixture_no_real_credential'));assert.equal(calls.length,1);assert.equal(calls[0].url,LUNA_API.endpoint);assert.equal(calls[0].body,p.body)}finally{globalThis.fetch=old}
})

test('strict candidate parsing rejects wrong models, tools, reasoning-only, refusals and altered whitespace',()=>{
 assert.equal(decodeLunaApi(body('Một phản hồi giả định.')).text,'Một phản hồi giả định.')
 for(const value of [{...body('x'),model:'other'},body(' x '),body('x'.repeat(2001)),{...body('x'),status:'incomplete'},{...body('x'),output:[{type:'function_call'}]},{...body('x'),output:[{type:'reasoning'}]}])assert.throws(()=>decodeLunaApi(value))
})

let fixtureCount=0
async function source(t,text,extra={}){
 const id=extra.documentId??'luna-fixture-'+randomUUID(),raw=Buffer.from(text),hash=lunaHash(raw.toString())
 const record={collection:'INSPIRE',documentId:id,title:'SYNTHETIC REFERENCE ONLY',status:'published-supporting',permittedUse:'supporting-retrieval',rawFile:hash,kind:'reference',permissions:{sourceHash:hash,internalResearch:true,externalExport:true,evidence:'SYNTHETIC FIXTURE ONLY'},...extra}
 if(record.permissions===undefined)delete record.permissions
 t.after(()=>db.recursiveDelete(db.doc('inspireKnowledge/'+id)))
 await importSource(record,raw,text);fixtureCount++
 return {id,record,text,hash}
}
test('conversation retrieval, permission isolation, incremental replacement and immediate revocation reach exact adapter input',async t=>{
 const sleepNeedle='zzsleep'+randomUUID().replaceAll('-',''),plantNeedle='zzplant'+randomUUID().replaceAll('-','')
 const sleep=await source(t,'# '+sleepNeedle+' Giấc ngủ\n\nGiấc ngủ và nghỉ ngơi giúp sắp xếp thời gian nghỉ. Đây là nguồn giả định.')
 const plants=await source(t,'# '+plantNeedle+' Trồng cây\n\nTrồng cây cần tưới nước và quan sát đất. Nguồn giả định cho kiểm thử.')
 const restricted=await source(t,sleepNeedle+' Giấc ngủ và nghỉ ngơi PRIVATE_RESTRICTED_CANARY.',{permissions:undefined})
 const draft=await source(t,sleepNeedle+' Giấc ngủ PRIVATE_DRAFT_CANARY.',{status:'review-required'})
 const rules=await source(t,sleepNeedle+' Giấc ngủ PRIVATE_RULE_CANARY.',{kind:'operating-rules'})
 const unrelated=await source(t,'Cấu tạo động cơ tên lửa và nhiên liệu.')
 const request=r([{id:'u1',role:'user',text:'Tình huống giả định: '+sleepNeedle},{id:'a1',role:'assistant',text:'Bạn muốn hỏi tiếp điều gì?'},{id:'u2',role:'user',text:'Bạn nói rõ hơn được không?'}])
 let found=await retrieveKnowledge(request.messages,true)
 assert.ok(found.some(s=>s.documentId===sleep.id),JSON.stringify({query:request.messages,found:found.map(s=>({id:s.documentId,text:s.text})),expected:sleep.id}))
 for(const bad of [restricted,draft,rules,unrelated])assert.ok(found.every(s=>s.documentId!==bad.id))
 const corrected=[...request.messages,{id:'a2',role:'assistant',text:'Giấc ngủ là chủ đề cũ.'},{id:'u3',role:'user',text:'Tôi đính chính: '+plantNeedle,correctionOf:'u1'}]
 found=await retrieveKnowledge(corrected,true)
 assert.ok(found.some(s=>s.documentId===plants.id));assert.ok(found.every(s=>s.documentId!==sleep.id))
 const context={...ctx(request),supportingKnowledge:await retrieveKnowledge(request.messages,true)}
 const p=prepareLunaApi(context,request)
 await assertKnowledgeExport(p.references)
 const injected=JSON.parse(p.payload.input[0].content).references
 assert.deepEqual(injected,p.references);assert.ok(injected.some(s=>s.text===sleep.text&&s.hash===sleep.hash))
 assert.ok(!/PRIVATE_RESTRICTED_CANARY|PRIVATE_DRAFT_CANARY|PRIVATE_RULE_CANARY/.test(p.body))
 const updated='# '+sleepNeedle+' Giấc ngủ\n\nGiấc ngủ và nghỉ ngơi. Bản cập nhật thay thế đúng phiên bản.',raw=Buffer.from(updated),hash=lunaHash(updated)
 const record={...sleep.record,rawFile:hash,permissions:{...sleep.record.permissions,sourceHash:hash}}
 assert.deepEqual(await importSource(record,raw,updated),{changed:true,version:2})
 assert.deepEqual(await importSource(record,raw,updated),{changed:false,version:2})
 found=await retrieveKnowledge(request.messages,true)
 assert.ok(found.some(s=>s.documentId===sleep.id&&s.version===2&&s.text===updated))
 assert.ok(!found.some(s=>s.documentId===sleep.id&&s.version===1))
 await assert.rejects(assertKnowledgeExport(p.references))
 const revoked={...record,permissions:{...record.permissions,externalExport:false}}
 await importSource(revoked,raw)
 assert.ok((await retrieveKnowledge(request.messages,true)).every(s=>s.documentId!==sleep.id))
 assert.equal((await db.doc(`inspireKnowledge/${sleep.id}/versions/1`).get()).data().hash,sleep.hash)
 const out=process.env.INSPIRE_REVIEW_EVIDENCE_DIR||'docs/evidence/luna-api-2026-11-14';mkdirSync(out,{recursive:true})
 writeFileSync(out+'/adapter-input-trace.json',JSON.stringify({executed:true,syntheticFixturesOnly:true,paidCalls:0,actualSourcePermissionGranted:false,request,adapterInput:p.payload,selectedReferences:p.references,correctionResult:await retrieveKnowledge(corrected,true),excluded:[restricted.id,draft.id,rules.id,unrelated.id],assertions:['exact permitted text and hash reach adapter body','restricted/draft/operating sources excluded','follow-up retains active user context','correction supersedes old query terms without editing history','version update and permission revocation invalidate cache']},null,2))
})

test('an exact excerpt grant exports only that section, while other sections remain internal',async t=>{
 const fixture=await source(t,'# Giấc ngủ\n\nGiấc ngủ và nghỉ ngơi.\n\n# Trồng cây\n\nTrồng cây cần tưới nước.')
 const sections=deriveSections({...fixture.record,version:1,hash:fixture.hash},fixture.text)
 const allowed=sections[0],denied=sections[1]
 await importSource({...fixture.record,permissions:{...fixture.record.permissions,sectionHashes:[allowed.sectionHash]}},Buffer.from(fixture.text),fixture.text)
 assert.ok((await retrieveKnowledge('giấc ngủ nghỉ ngơi',true,fixture.id)).some(s=>s.documentId===fixture.id))
 assert.ok((await retrieveKnowledge('trồng cây tưới nước',true,fixture.id)).every(s=>s.documentId!==fixture.id))
 assert.ok((await retrieveKnowledge('trồng cây tưới nước',false,fixture.id)).some(s=>s.documentId===fixture.id&&s.sectionHash===denied.sectionHash))
 await assert.rejects(assertKnowledgeExport([{...denied,version:2}]))
})

test('51 ineligible matching sources cannot consume the candidate limit before an eligible reference',async t=>{
 const marker='eligibility'+randomUUID().replaceAll('-','')
 for(let i=0;i<51;i++){
  const text=marker+' Nguồn giả định không đủ quyền.',hash=lunaHash(text)
  await source(t,text,{documentId:'a-luna-blocked-'+i+'-'+randomUUID(),
   ...(i%3===0?{kind:'operating-rules'}:i%3===1?{permittedUse:'receipt-only'}:
    {permissions:{sourceHash:hash,internalResearch:false,externalExport:true,evidence:'OFFLINE NEGATIVE FIXTURE'}})})
 }
 const allowed=await source(t,marker+' Đoạn tham khảo giả định đủ quyền.',{documentId:'z-luna-allowed-'+randomUUID()})
 for(const external of [false,true]){
  const selected=await retrieveKnowledge(marker,external)
  assert.equal(selected.length,1);assert.equal(selected[0].documentId,allowed.id)
 }
})

async function member(t){const u=await auth.createUser({email:`luna-${randomUUID()}@synthetic.invalid`,password:'Synthetic-test-only-123!'});t.after(()=>auth.deleteUser(u.uid));return{uid:u.uid,registered:true,providers:['password'],email:u.email,createdAt:u.metadata.creationTime}}
const fixtureStore=()=>({configured:()=>false,authorized:()=>true,consume:()=> 'OFFLINE_TEST_NO_KEY',receipt:()=>0})
const noRate=async()=>({allowed:true})
const makeRequest=(s,identity,messages)=>{const {epoch,sessionId}=s.session(identity);return {...r(messages),epoch,sessionId,operationId:randomUUID(),conversationId:randomUUID(),kind:'send'}}
test('actual native Controller + private service preserve multi-turn/corrections, duplicate/replay identity and quotas',async t=>{
 const identity=await member(t),controller=createLunaController();let calls=0
 const service=createPrivateLunaService({store:fixtureStore(),controller,rateCheck:noRate,send:async()=>{calls++;return body('Bạn có thể chọn việc có thời hạn gần nhất, rồi cân nhắc sức lực của mình. Đây là phản hồi giả định để kiểm tra kỹ thuật.')}})
 const request=makeRequest(service,identity)
 const run=async q=>{await service.handlePrivate({kind:'preview',request:q},identity,'local');return service.handlePrivate({kind:'execute',request:{...q,kind:'replay'}},identity,'local')}
 const first=await run(request)
 assert.equal(first.mode,'private-model')
 const replay=await service.handlePrivate({kind:'execute',request:{...request,kind:'replay'}},identity,'local')
 assert.deepEqual(replay,first);assert.equal(calls,1)
 const next={...request,operationId:randomUUID(),messages:[...request.messages,first.message,{id:'u2',role:'user',text:'Nếu tôi chỉ còn một giờ thì sao?'}]}
 const second=await run(next)
 const correction={...next,operationId:randomUUID(),messages:[...next.messages,second.message,{id:'u3',role:'user',text:'Tôi đính chính: ngày mai mới đến hạn.',correctionOf:request.messages[0].id}]}
 await Promise.all([run(correction),run(correction)])
 assert.equal(calls,3);assert.equal((await service.accounts.account(identity)).quota.completed,3)
 const evidence=controller.evidence();assert.ok(evidence.filter(x=>x.phase==='candidate').length===3)
 assert.ok(evidence.every(x=>x.actual_execution_eligible===false&&x.user_delivery===false))
 assert.ok(evidence.some(x=>x.checks_executed.includes('Non-MOCK ScopeGuard')))
 mkdirSync(process.env.INSPIRE_REVIEW_EVIDENCE_DIR||'docs/evidence/luna-api-2026-11-14',{recursive:true})
 writeFileSync((process.env.INSPIRE_REVIEW_EVIDENCE_DIR||'docs/evidence/luna-api-2026-11-14')+'/controller-trace.json',JSON.stringify({executed:true,paidCalls:0,transport:'OFFLINE INJECTED RESPONSE; NOT GENERATIVE QUALITY',calls,evidence},null,2))
})

test('authorization, cross-user access, outage, unknown outcome and restart reject without replacement calls',async t=>{
 const identity=await member(t),other=await member(t);let calls=0,preflights=0
 const controller={async preflight(){preflights++},async validate(){},evidence(){return[]}}
 // Admission/restart checks are source-free; the separate retrieval and
 // revocation regressions exercise the real knowledge path explicitly.
 const service=createPrivateLunaService({sourceFree:true,store:{...fixtureStore(),authorized:()=>false},controller,rateCheck:noRate,send:async()=>{calls++;throw Error()}})
 const request=makeRequest(service,identity)
 await service.handlePrivate({kind:'preview',request},identity,'local')
 await assert.rejects(service.handlePrivate({kind:'execute',request},identity,'local'),{code:'AUTHORIZATION_REQUIRED'})
 await assert.rejects(service.handlePrivate({kind:'execute',request},other,'local'),{code:'OPERATION_CONFLICT'})
 assert.equal(calls,0);assert.equal(preflights,0)
 const failing=createPrivateLunaService({sourceFree:true,store:fixtureStore(),controller,rateCheck:noRate,send:async()=>{calls++;throw Error('Offline injected timeout')}})
 const bad=makeRequest(failing,identity)
 await failing.handlePrivate({kind:'preview',request:bad},identity,'local')
 for(let i=0;i<2;i++)await assert.rejects(failing.handlePrivate({kind:'execute',request:{...bad,kind:'replay'}},identity,'local'),{code:'OUTCOME_UNKNOWN'})
 assert.equal(calls,1)
 const restarted=createPrivateLunaService({sourceFree:true,store:fixtureStore(),controller,rateCheck:noRate,send:async()=>{calls++;return body('Unexpected')}})
 await assert.rejects(restarted.handlePrivate({kind:'execute',request:{...bad,kind:'replay'}},identity,'local'),{code:'RESULT_UNKNOWN'})
 assert.equal(calls,1)
 const invalid={...makeRequest(restarted,identity),quota:999,uid:identity.uid}
 await assert.rejects(restarted.handlePrivate({kind:'preview',request:invalid},identity,'local'),{code:'INVALID_REQUEST'})
})

test('private rate/quota checks, forged history and revoked preview sources stop before the key or paid transport',async t=>{
 const identity=await member(t);let sends=0,keys=0
 const store={...fixtureStore(),consume(){keys++;return 'OFFLINE_NO_KEY'}}
 const controller={async preflight(){},async validate(){},evidence(){return[]}}
 const send=async()=>{sends++;return body('Nội dung thử riêng.')}
 const limited=createPrivateLunaService({sourceFree:true,store,controller,send,rateCheck:async()=>({allowed:false,retryAfterSeconds:30})})
 const a=makeRequest(limited,identity)
 await limited.handlePrivate({kind:'preview',request:a},identity,'loopback')
 await assert.rejects(limited.handlePrivate({kind:'execute',request:a},identity,'loopback'),{code:'RATE_LIMITED'})
 const history=createPrivateLunaService({sourceFree:true,store,controller,send,rateCheck:noRate})
 const b=makeRequest(history,identity,[{id:'u1',role:'user',text:'Một câu hỏi giả định.'},{id:'a1',role:'assistant',text:'Lịch sử tự bịa.'},{id:'u2',role:'user',text:'Câu hỏi tiếp.'}])
 await history.handlePrivate({kind:'preview',request:b},identity,'loopback')
 await assert.rejects(history.handlePrivate({kind:'execute',request:b},identity,'loopback'),{code:'HISTORY_MISMATCH'})
 const fixture=await source(t,'# Dữ liệu duy nhất\n\nquyennguonfixture kiến thức riêng để kiểm thử quyền.')
 const revoked=createPrivateLunaService({store,controller,send,rateCheck:noRate})
 const c=makeRequest(revoked,identity,[{id:'u1',role:'user',text:'quyennguonfixture'}])
 const preview=await revoked.handlePrivate({kind:'preview',request:c},identity,'loopback');assert.ok(preview.sourceCount>0)
 await importSource({...fixture.record,permissions:{...fixture.record.permissions,externalExport:false}},Buffer.from(fixture.text),fixture.text)
 await assert.rejects(revoked.handlePrivate({kind:'execute',request:c},identity,'loopback'),{code:'ATTEMPT_FAILED'})
 const period=vietnamMonth(Date.now()).key
 await db.doc(`inspireAccounts/${identity.uid}/usage/${period}`).set({period,completed:30,reserved:0})
 await assert.rejects(revoked.handlePrivate({kind:'preview',request:makeRequest(revoked,identity)},identity,'loopback'),{code:'QUOTA'})
 assert.equal(keys,0);assert.equal(sends,0)
})

test('original native safety triage holds a synthetic high-risk request before model dispatch',async()=>{
 const request=r([{id:'u1',role:'user',text:'Tối nay tôi sẽ tự tử. Tôi đã chuẩn bị thuốc và định thực hiện.'}])
 const p=prepareLunaApi(ctx(request),request)
 await assert.rejects(createLunaController().preflight(p),/LUNA_CONTROLLER_PREFLIGHT_HOLD/)
})

test('private transport prepares only, prevents duplicate submissions, and replays the same operation after a lost response',async()=>{
 let preview,calls=0,executeCalls=0,deliveries=0,lastRequest
 const fetcher=async(_url,opts)=>{
  const data=JSON.parse(opts.body);calls++
  if(data.kind==='session')return Response.json({epoch:'epoch',sessionId:'session',mode:'private-model'})
  if(data.kind==='preview')return Response.json({previewOnly:true,operationId:data.request.operationId,conversationId:data.request.conversationId,payload:{synthetic:true},payloadSHA:'a'.repeat(64),binding:'b'.repeat(64),reservedNanoUSD:1000})
  executeCalls++;lastRequest=data.request
  if(executeCalls===1){deliveries++;throw Error('Lost HTTP response after completion')}
  return Response.json({mode:'private-model',epoch:'epoch',sessionId:'session',operationId:data.request.operationId,conversationId:data.request.conversationId,replyTo:data.request.messages.at(-1).id,message:{id:'a1',role:'assistant',text:'Phản hồi thử riêng giả định.'}})
 }
 const store=new ConversationStore(createPrivateLunaTransport(p=>preview=p,fetcher,async()=> 'synthetic-token'))
 const id=store.getSnapshot().activeId;store.draft(id,'Câu hỏi giả định.')
 await Promise.all([store.send(id),store.send(id)])
 assert.equal(calls,2);assert.ok(preview);assert.equal(store.getSnapshot().conversations[0].messages.length,1)
 const operation=store.getSnapshot().conversations[0].pending.request.operationId
 await store.retry(id);assert.equal(store.getSnapshot().conversations[0].status,'error')
 await store.retry(id);assert.equal(lastRequest.operationId,operation);assert.equal(deliveries,1);assert.equal(executeCalls,2)
 assert.equal(store.getSnapshot().conversations[0].messages.length,2)
})

test.after(async()=>{await db.terminate()})
