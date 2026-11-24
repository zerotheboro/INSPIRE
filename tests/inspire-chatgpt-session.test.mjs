// Offline only: no app-server process, credentials or model network transport.
import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,readFileSync,readdirSync,writeFileSync,mkdirSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {chatgptLedger,createChatgptRunner,chatgptTurnInput,decodeChatgptTurn,chatgptControls} from '../functions/src/inspireChatgptSession.ts'
import {prepareLunaInput} from '../functions/src/inspireLuna.ts'
import {emptyPreferences} from '../functions/src/inspireAccount.ts'
import {createPrivateChatgptTransport} from '../src/services/InspireAIconnect.ts'
import {ConversationStore} from '../src/services/inspireConversation.ts'
const hash=s=>createHash('sha256').update(s).digest('hex')
const roots=[]
function ledger(){const root=mkdtempSync(join(tmpdir(),'inspire-chatgpt-offline-'));roots.push(root);return {root,store:chatgptLedger(root)}}
function proposal(i=1,messages=[{id:'u'+i,role:'user',text:'Tình huống giả định: hôm nay tôi có nhiều việc.'}]){
 const request={kind:'send',epoch:'epoch',sessionId:'session',operationId:'op'+i,conversationId:'conversation',messages}
 const p=prepareLunaInput({messages,operatingInstructions:[],supportingKnowledge:[],userStatedPreferences:emptyPreferences},request)
 return {request,p:{...p,binding:hash(JSON.stringify([request,p.payloadSHA])),sourceCount:0,conversationId:request.conversationId}}
}
const text='Bạn có thể kể những việc đang cần làm, rồi chọn một việc nhỏ để bắt đầu.'
function event(p){return {method:'turn/completed',params:{threadId:'thread',turn:{id:p.operationId,status:'completed',items:[{type:'agentMessage',id:'answer',phase:'final_answer',text}]}}}}
function sender(p){return Promise.resolve(decodeChatgptTurn(p,'thread',p.operationId,[event(p)]))}
const fakeController={preflight:async()=>{},validate:async()=>{},evidence:()=>[]}
function runner(store,extra={}){return createChatgptRunner({ledger:store,controller:fakeController,recheck:async()=>{},offlineSender:sender,...extra})}

test('exact identity survives disk reopen; changed content, user and client authority are rejected; no raw text persisted',()=>{
 const {root,store}=ledger(),{request,p}=proposal();store.prepare('owner',request,p)
 assert.deepEqual(chatgptLedger(root).prepare('owner',request,p),store.prepare('owner',request,p))
 // Another preview cannot lock out the father before any session is attempted.
 store.prepare('other',request,p)
 assert.throws(()=>store.prepare('owner',{...request,quota:999},p))
 assert.throws(()=>store.prepare('owner',request,{...p,text:p.text+' '}),/BINDING/)
 const changed=proposal(1,[{id:'u1',role:'user',text:'Nội dung khác'}]);assert.throws(()=>store.prepare('owner',changed.request,changed.p),/BINDING/)
 const files=readdirSync(root).map(f=>readFileSync(join(root,f),'utf8')).join('')
 assert.ok(!files.includes(request.messages[0].text));assert.ok(!files.includes('instructions'))
 store.consume('owner',request,p)
 assert.throws(()=>store.prepare('other',request,p),/OWNER_HOLD/)
})
test('three successful injected attempts survive runner restarts; fourth cannot send',async()=>{
 const {root}=ledger();let calls=0
 for(let i=1;i<=3;i++){const {request,p}=proposal(i);assert.equal(await runner(chatgptLedger(root),{offlineSender:async p=>{calls++;return sender(p)}}).execute('owner',request,p),text)}
 const fourth=proposal(4);await assert.rejects(runner(chatgptLedger(root)).execute('owner',fourth.request,fourth.p),/EXHAUSTED/)
 assert.equal(calls,3);assert.equal(chatgptLedger(root).status().used,3)
})
test('concurrent duplicate and concurrent new operations cannot bypass an unresolved reservation',async()=>{
 const {root,store}=ledger(),{request,p}=proposal(3);let calls=0
 for(const i of [1,2]){const q=proposal(i);await runner(store).execute('owner',q.request,q.p)}
 const active=runner(store,{offlineSender:async p=>{calls++;await new Promise(r=>setTimeout(r,20));return sender(p)}})
 const next=proposal(4)
 const result=await Promise.allSettled([active.execute('owner',request,p),runner(chatgptLedger(root)).execute('owner',request,p),runner(chatgptLedger(root)).execute('owner',next.request,next.p)])
 assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(calls,1);assert.equal(store.status().used,3)
})
test('network failure counts once; same request or replacement after restart never regenerates',async()=>{
 const {root,store}=ledger(),{request,p}=proposal();let calls=0
 await assert.rejects(runner(store,{offlineSender:async()=>{calls++;throw Error('lost transport')}}).execute('owner',request,p),/lost transport/)
 for(const q of [{request,p},proposal(2)])await assert.rejects(runner(chatgptLedger(root),{offlineSender:async p=>{calls++;return sender(p)}}).execute('owner',q.request,q.p),/UNRESOLVED/)
 assert.equal(calls,1);assert.equal(store.status().used,1);assert.equal(store.status().recoveryHold,true)
})
test('actual child-process termination after reservation leaves a durable unknown outcome',async()=>{
 const {root}=ledger(),{request,p}=proposal()
 const code=`import {chatgptLedger} from './functions/src/inspireChatgptSession.ts';chatgptLedger(${JSON.stringify(root)}).consume('owner',${JSON.stringify(request)},${JSON.stringify(p)});process.exit(17)`
 const child=spawnSync(process.execPath,['--import','./tests/register-ts.mjs','--input-type=module','-e',code],{encoding:'utf8',windowsHide:true})
 assert.equal(child.status,17,child.stderr)
 await assert.rejects(runner(chatgptLedger(root)).execute('owner',request,p),/UNRESOLVED/)
 assert.equal(chatgptLedger(root).status().used,1)
})
test('preflight and last permission recheck precede send; revoked source and rejected output hold conservatively',async()=>{
 for(const failure of ['preflight','permission','validation']){
  const {store}=ledger(),{request,p}=proposal(),steps=[]
  const run=runner(store,{controller:{...fakeController,preflight:async()=>{steps.push('preflight');if(failure==='preflight')throw Error(failure)},validate:async()=>{steps.push('validation');throw Error(failure)}},recheck:async()=>{steps.push('permission');if(failure==='permission')throw Error(failure)},offlineSender:async p=>{steps.push('send');return sender(p)}})
  await assert.rejects(run.execute('owner',request,p))
  assert.deepEqual(steps,failure==='preflight'?['preflight']:failure==='permission'?['preflight','permission']:['preflight','permission','send','validation'])
  assert.equal(store.status().used,1)
  await assert.rejects(run.execute('owner',request,p),/UNRESOLVED/)
 }
})
test('protocol conversion preserves exact ordered history and correction; rejects cross-turn, partial, tool and managed-retry events',()=>{
 const {p}=proposal(1,[{id:'u1',role:'user',text:'Tôi lo về việc nhà.'},{id:'a1',role:'assistant',text:'Bạn muốn nói rõ hơn không?'},{id:'u2',role:'user',text:'Đính chính: việc ở cơ quan.',correctionOf:'u1'}])
 assert.equal(chatgptTurnInput(p,'thread').input[0].text,p.text)
 assert.equal(chatgptTurnInput(p,'thread').clientUserMessageId,p.operationId)
 assert.equal(decodeChatgptTurn(p,'thread',p.operationId,[event(p)]).binding,p.binding)
 for(const change of [e=>{e.params.threadId='other'},e=>{e.params.turn.id='other'},e=>{e.params.turn.status='failed'},e=>{e.params.turn.itemsView='summary'},e=>{e.params.turn.items[0].type='commandExecution'},e=>{e.params.turn.items[0].moderation={moderated:true}},e=>{e.params.turn.items[0].text='x'.repeat(2001)}]){const e=event(p);change(e);assert.throws(()=>decodeChatgptTurn(p,'thread',p.operationId,[e]))}
 assert.throws(()=>decodeChatgptTurn(p,'thread',p.operationId,[{method:'error',params:{willRetry:true}},event(p)]))
 assert.throws(()=>decodeChatgptTurn(p,'thread',p.operationId,[]))
})
test('output must bind to the exact input before Controller validation or receipt',async()=>{
 const {root,store}=ledger(),{request,p}=proposal();let validations=0
 await assert.rejects(runner(store,{controller:{...fakeController,validate:async()=>{validations++}},offlineSender:async p=>({...await sender(p),binding:'wrong'})}).execute('owner',request,p),/BINDING/)
 assert.equal(validations,0);assert.ok(!readdirSync(root).some(f=>f.startsWith('receipt-')))
})
test('corrupt record, crash lock and synced storage cannot silently reset counters',()=>{
 for(const [file,data] of [['owner.json','{'],['allocation.lock','{}'],['attempt-1.json','{']]){
  const {root,store}=ledger(),{request,p}=proposal();if(file!=='owner.json')store.prepare('owner',request,p)
  writeFileSync(join(root,file),data);assert.throws(()=>chatgptLedger(root).consume('owner',request,p))
 }
 assert.throws(()=>chatgptLedger(join(tmpdir(),'OneDrive','inspire')).status(),/STORAGE_HOLD/)
})
test('default runner has no sender and ignores any prior grant; browser preview uses ChatGPT only without execute or automatic retry',async()=>{
 const {store}=ledger(),{request,p}=proposal();await assert.rejects(createChatgptRunner({ledger:store}).execute('owner',request,p),/DISPATCH_BLOCKED/);assert.equal(store.status().used,0)
 assert.equal(chatgptControls.liveDispatchEnabled,false);assert.equal(chatgptControls.ownerSessionReleased,false)
 const calls=[];let preview;const transport=createPrivateChatgptTransport(v=>preview=v,async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return new Response(JSON.stringify({mode:'private-model',previewOnly:true,payload:JSON.parse(p.text),payloadSHA:p.payloadSHA,binding:p.binding,operationId:request.operationId,conversationId:request.conversationId}))},async()=>'synthetic')
 await assert.rejects(transport.send(request),e=>e.code==='CHATGPT_DISPATCH_BLOCKED'&&e.retry==='none')
 assert.equal(calls.length,1);assert.equal(calls[0].url,'/api/inspire-chatgpt');assert.equal(calls[0].body.kind,'preview');assert.equal(preview.binding,p.binding)
})
test('lost preview response retries only same stable identity; ConversationStore prevents duplicate submission',async()=>{
 let fail=true;const requests=[]
 const transport=createPrivateChatgptTransport(()=>{},async(url,options)=>{
  assert.equal(url,'/api/inspire-chatgpt');const body=JSON.parse(options.body)
  if(body.kind==='session')return new Response(JSON.stringify({mode:'private-model',epoch:'epoch',sessionId:'session'}))
  requests.push(body);if(fail){fail=false;throw Error('lost preview')}
  const {request}=body;return new Response(JSON.stringify({previewOnly:true,payloadSHA:'hash',binding:'binding',operationId:request.operationId,conversationId:request.conversationId}))
 },async()=>'synthetic')
 const store=new ConversationStore(transport),id=store.getSnapshot().activeId;store.draft(id,'Câu hỏi giả định')
 await Promise.all([store.send(id),store.send(id)]);assert.equal(requests.length,1)
 await store.retry(id);assert.deepEqual(requests[1],requests[0]);assert.equal(store.getSnapshot().conversations[0].error.retry,'none')
 await store.retry(id);assert.equal(requests.length,2)
})
test('native Controller validates injected ChatGPT-shaped final event and exact returned bytes',async()=>{
 const {store}=ledger(),{request,p}=proposal();const run=createChatgptRunner({ledger:store,recheck:async()=>{},offlineSender:sender})
 const result=await run.execute('owner',request,p);assert.equal(result,text)
 const proof=run.controller.evidence();assert.equal(proof.length,2)
 assert.equal(proof[1].validated_sha256,hash(result));assert.equal(proof[1].actual_execution_eligible,false);assert.equal(proof[1].user_delivery,false)
 const out='docs/evidence/chatgpt-connection-2026-11-23';mkdirSync(out,{recursive:true});writeFileSync(out+'/synthetic-controller-trace.json',JSON.stringify({syntheticOnly:true,liveCalls:0,input:JSON.parse(p.text),payloadSHA:p.payloadSHA,binding:p.binding,protocolPreview:chatgptTurnInput(p,'thread'),event:event(p),controller:proof,validatedText:result,accounting:store.status()},null,2))
})
