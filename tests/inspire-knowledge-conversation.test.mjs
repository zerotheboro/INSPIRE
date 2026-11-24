import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {createHash,randomUUID} from 'node:crypto'
import {mkdirSync,writeFileSync} from 'node:fs'
import {requireLocalEmulators,createLocalService} from '../functions/src/inspireLocalService.ts'
import {importSource,assertKnowledgeExport} from '../functions/src/inspireKnowledge.ts'
import {prepareLunaKnowledgeInput,createKnowledgePreviewAdapter} from '../functions/src/inspireLuna.ts'
import {emptyPreferences} from '../functions/src/inspireAccount.ts'
import {ConversationStore} from '../src/services/inspireConversation.ts'
import {createSimulationTransport} from '../src/services/InspireAIconnect.ts'
process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099'
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'
requireLocalEmulators()
const require=createRequire(new URL('../functions/package.json',import.meta.url)),db=require('firebase-admin/firestore').getFirestore()
const prefix='library-'+randomUUID(),ids=[]
const hash=t=>createHash('sha256').update(t).digest('hex')
async function source(suffix,text,allow=true,kind='reference'){
 const id=prefix+'-'+suffix;if(!ids.includes(id))ids.push(id)
 await importSource({collection:'INSPIRE',documentId:id,title:suffix,status:allow?'published-supporting':'review-required',permittedUse:allow?'supporting-retrieval':'receipt-only',rawFile:hash(text),kind,permissions:{sourceHash:hash(text),internalResearch:allow,externalExport:allow,evidence:'SYNTHETIC FIXTURE ONLY; NOT OWNER APPROVAL'}},Buffer.from(text),text)
 return id
}
const request=messages=>({kind:'send',epoch:'epoch',sessionId:'session',operationId:'operation',conversationId:'conversation',messages})
const context=r=>({messages:r.messages,userStatedPreferences:emptyPreferences,operatingInstructions:['PRIVATE RULE MUST NOT EXPORT'],supportingKnowledge:[]})
const trace=[]
test('automatic relevant retrieval, follow-up, correction, conflict preservation and exact adapter input',async()=>{
 await source('work','# Công việc\nTrong tình huống giả định zworkalpha, hãy liệt kê thời hạn rồi chọn một việc nhỏ.')
 await source('garden','# Vườn\nTrong tình huống giả định zgardenbeta, cây cần đất ẩm.')
 await source('garden-other','# Ý kiến khác\nTrong tình huống giả định zgardenbeta, cây cần đất khô. Hai đoạn này cố ý mâu thuẫn.')
 await source('restricted','# Bản nháp\nzgardenbeta PRIVATE_RESTRICTED',false)
 await source('rules','# Quy tắc\nzgardenbeta PRIVATE_OPERATING',true,'operating-rules')
 await source('unrelated','# Chủ đề khác\nzunrelatedomega')
 let messages=[{id:'u1',role:'user',text:'Tình huống giả định zworkalpha, tôi nên bắt đầu thế nào?'}]
 for(const [i,next] of [[0,null],[1,{id:'u2',role:'user',text:'Bạn nói rõ hơn được không?'}],[2,{id:'u3',role:'user',text:'Đính chính: đây là zgardenbeta, chuyện chăm cây.',correctionOf:'u1'}]]){
  if(next)messages=[...messages,{id:'a'+i,role:'assistant',text:'Phản hồi mô phỏng dùng riêng cho kiểm thử.'},next]
  const r=request(messages),p=await prepareLunaKnowledgeInput(context(r),r),input=JSON.parse(p.text)
  assert.deepEqual(input.messages,messages);assert.ok(input.supportingKnowledge.length>0)
  assert.ok(input.supportingKnowledge.every(s=>s.documentId.startsWith(prefix)))
  assert.ok(!/PRIVATE_RESTRICTED|PRIVATE_OPERATING|PRIVATE RULE|zunrelatedomega/.test(p.text))
  if(i===2){assert.ok(input.supportingKnowledge.every(s=>s.documentId.includes('garden')),JSON.stringify(input.supportingKnowledge.map(s=>({id:s.documentId,text:s.text}))));assert.equal(input.supportingKnowledge.length,2);assert.equal(input.messages[0].text,messages[0].text)}
  else assert.ok(input.supportingKnowledge.some(s=>s.documentId.endsWith('work')))
  assert.equal(p.payloadSHA,hash(p.text));assert.equal(p.generationEnabled,false)
  assert.deepEqual(await prepareLunaKnowledgeInput(context(r),r),p)
  trace.push(p)
 }
 const no=request([{id:'none',role:'user',text:'zabsentgamma'}]);assert.equal((await prepareLunaKnowledgeInput(context(no),no)).sourceCount,0)
})
test('content and permission updates revoke cached inputs and adapter traces',async()=>{
 const r=request([{id:'u1',role:'user',text:'zworkalpha'}]),adapter=createKnowledgePreviewAdapter({async reply(){return 'Mô phỏng.'},close(){}})
 await adapter.reply(context(r),r);const before=await adapter.trace(r.operationId,r.sessionId);assert.equal(await adapter.trace(r.operationId,"other-session"),null)
 await source('work','# Thay đổi\nzworkalpha Nội dung mới thay thế bản cũ.')
 assert.equal(await adapter.trace(r.operationId,r.sessionId),null)
 await assert.rejects(assertKnowledgeExport(JSON.parse(before.text).supportingKnowledge))
 const updated=await prepareLunaKnowledgeInput(context(r),r);assert.ok(updated.text.includes('Nội dung mới'))
 await source('work','# Thay đổi\nzworkalpha Nội dung mới thay thế bản cũ.',false)
 assert.equal((await prepareLunaKnowledgeInput(context(r),r)).sourceCount,0)
 adapter.close()
})
test('conversation transport keeps exact pending operation on technical failure and replay; no new adapter call',async()=>{
 let calls=0,fail=true,diagnostic
 const adapter=createKnowledgePreviewAdapter({async reply(){calls++;return 'Phản hồi mô phỏng.'},close(){}})
 const service=createLocalService(adapter,Date.now,async()=>({allowed:true}))
 const identity={uid:prefix,providers:[],email:null,registered:false,createdAt:new Date().toISOString()}
 const fake=async(_url,options)=>{
  const body=JSON.parse(options.body)
  if(body.kind==='session')return new Response(JSON.stringify(service.session(identity)))
  const response=await service.handle(body,identity,'loopback')
  if(fail){fail=false;throw Error('synthetic lost response')}
  return new Response(JSON.stringify({response,knowledge:await adapter.trace(body.operationId,body.sessionId)}))
 }
 const store=new ConversationStore(createSimulationTransport(fake,async()=>'synthetic',undefined,v=>diagnostic=v))
 const id=store.getSnapshot().activeId;store.draft(id,'Tình huống giả định zgardenbeta');await Promise.all([store.send(id),store.send(id)])
 const before=structuredClone(store.getSnapshot().conversations[0].pending.request)
 assert.equal(calls,1);await store.retry(id);assert.equal(calls,1)
 assert.equal(store.getSnapshot().conversations[0].messages.length,2)
 assert.equal(diagnostic.operationId,before.operationId);assert.equal(JSON.parse(diagnostic.text).messages[0].id,before.messages[0].id)
 service.close()
})
test('private receipt version survives rebuilding an empty emulator index',async()=>{
 const id=prefix+'-recovery';ids.push(id)
 const record={collection:'INSPIRE',documentId:id,title:'Recovery fixture',status:'review-required',permittedUse:'receipt-only',rawFile:'fixture'}
 const raw=Buffer.from('synthetic recovery')
 assert.equal((await importSource(record,raw,raw.toString(),7)).version,7)
 assert.equal((await importSource(record,raw,raw.toString(),7)).changed,false)
 assert.equal((await importSource(record,Buffer.from('updated'), 'updated',8)).version,8)
 assert.equal((await db.doc('inspireKnowledge/'+id+'/versions/7').get()).exists,true)
})
test.after(async()=>{
 const evidence=process.env.INSPIRE_REVIEW_EVIDENCE_DIR||'docs/evidence/knowledge-conversation-2026-11-21'
 mkdirSync(evidence,{recursive:true})
 writeFileSync(evidence+'/adapter-input-trace.json',JSON.stringify({syntheticFixturesOnly:true,liveDispatches:0,trace},null,2))
 for(const id of ids)await db.recursiveDelete(db.doc('inspireKnowledge/'+id))
 await db.terminate()
})
