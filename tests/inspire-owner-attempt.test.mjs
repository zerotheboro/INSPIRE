// Real local Firestore + disk ledger, synthetic source/model fixtures only.
// Never loads dotenv, production credentials, or a real inference transport.
import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {randomUUID} from 'node:crypto'
import {mkdtempSync,readFileSync,writeFileSync,existsSync,rmSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {createServer} from 'node:http'
import {initializeApp,deleteApp} from 'firebase/app'
import {initializeAuth,inMemoryPersistence,connectAuthEmulator,signInAnonymously,signOut} from 'firebase/auth'
import {inspirePrototype} from '../vite.config.ts'
import {requireLocalEmulators} from '../functions/src/inspireLocalService.ts'
import {importSource,retrieveKnowledge} from '../functions/src/inspireKnowledge.ts'
import {emptyPreferences} from '../functions/src/inspireAccount.ts'
import {lunaHash,lunaOneShot,prepareLunaApi,LUNA_API} from '../functions/src/inspireLunaApi.ts'
import {createPrivateLunaService} from '../functions/src/inspireLunaService.ts'
import {browserReceipt} from '../functions/src/inspireReviewReceipt.ts'
import {createPrivateLunaTransport} from '../src/services/InspireAIconnect.ts'
import {ConversationStore} from '../src/services/inspireConversation.ts'
process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099'
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'
requireLocalEmulators()
const require=createRequire(new URL('../functions/package.json',import.meta.url)),db=require('firebase-admin/firestore').getFirestore()
const rawReply=()=>({id:'offline-fixture',model:LUNA_API.model,status:'completed',usage:{input_tokens:30,output_tokens:20},output:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'Phản hồi giả lập để kiểm tra kỹ thuật.'}]}]})
async function setup(t,uid=randomUUID()){
 const dir=mkdtempSync(join(tmpdir(),'inspire-owner-fixture-')),marker='zzowner'+randomUUID().replaceAll('-','')
 const identity={uid,registered:false,email:null,providers:[],createdAt:new Date().toISOString()},sources=[]
 t.after(async()=>{
  for(const s of sources)await db.recursiveDelete(db.doc('inspireKnowledge/'+s.record.documentId))
  await db.recursiveDelete(db.doc('inspireAccounts/'+uid))
  const operations=await db.collection('inspireOperations').where('uid','==',uid).get()
  for(const op of operations.docs)await op.ref.delete()
  assert.ok(resolve(dir).startsWith(resolve(tmpdir(),'inspire-owner-fixture-')))
  rmSync(dir,{recursive:true,force:true})
 })
 const keyBefore=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='sk-SYNTHETIC_ONLY_no_real_credential'
 t.after(()=>{if(keyBefore===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=keyBefore})
 for(let index=0;index<3;index++){
  const text='# '+marker+'\nĐoạn tham khảo tổng hợp '+index+'.',hash=lunaHash(text)
  const record={collection:'INSPIRE',documentId:'owner-fixture-'+randomUUID(),title:'SYNTHETIC '+index,status:'published-supporting',permittedUse:'supporting-retrieval',rawFile:hash,kind:'reference',permissions:{sourceHash:hash,internalResearch:true,externalExport:true,evidence:'SYNTHETIC FIXTURE ONLY'}}
  await importSource(record,Buffer.from(text),text);sources.push({record,text})
 }
 const old={kind:'send',epoch:'superseded-epoch',sessionId:'superseded-session',operationId:'superseded-operation',conversationId:'superseded-conversation',messages:[{id:'exact-approved-message',role:'user',text:'Tình huống giả định: '+marker}]}
 const template=prepareLunaApi({messages:old.messages,operatingInstructions:[],userStatedPreferences:emptyPreferences,supportingKnowledge:await retrieveKnowledge(old.messages,true)},old)
 assert.equal(template.references.length,3)
 writeFileSync(join(dir,'replacement-owner-approval.json'),JSON.stringify({schema:'inspire-owner-replacement-v1',ownerDecision:'SYNTHETIC OWNER DECISION, NOT ACTUAL APPROVAL',template,maxAttempts:1,maxCostNanoUSD:template.reservedNanoUSD,supersededBinding:template.binding}))
 let sends=0,preflights=0,validated=0
 const now=()=>Date.UTC(2026,10,25,14)
 const store=lunaOneShot(dir,now)
 const controller={async preflight(){preflights++},async validate(){validated++},evidence:()=>[]}
 const create=(extra={})=>createPrivateLunaService({store,controller,now,rateCheck:async()=>({allowed:true}),send:async()=>{sends++;return rawReply()},...extra})
 return {dir,identity,template,sources,store,create,controller,now,counts:()=>({sends,preflights,validated})}
}

test('owner record, exact preview and durable grant survive reopening; duplicate/concurrent execute generates once',async t=>{
 const f=await setup(t),service=f.create()
 await assert.rejects(service.handlePrivate({kind:'owner-preview',approved:true},f.identity,'local'),{code:'INVALID_REQUEST'})
 assert.equal(existsSync(join(f.dir,'replacement-binding.json')),false)
 const [a,b]=await Promise.all([service.handlePrivate({kind:'owner-preview'},f.identity,'local'),service.handlePrivate({kind:'owner-preview'},f.identity,'local')])
 assert.equal(a.payloadSHA,f.template.payloadSHA);assert.equal(a.sourceCount,3);assert.equal(a.reservedNanoUSD,f.template.reservedNanoUSD)
 assert.deepEqual(a.ownerRequest,b.ownerRequest);assert.notEqual(a.binding,f.template.binding)
 assert.equal(a.ownerRequest.messages[0].id,'exact-approved-message');assert.notEqual(a.ownerRequest.operationId,f.template.request.operationId)
 const grant=readFileSync(join(f.dir,'authorization.json'),'utf8')
 await service.handlePrivate({kind:'owner-preview'},f.identity,'local')
 assert.equal(readFileSync(join(f.dir,'authorization.json'),'utf8'),grant)
 assert.equal(f.store.authorized(f.template),false)
 assert.equal(f.counts().sends,0)
 const packet=browserReceipt(a)
 assert.equal(packet.ownerAuthorized,true);assert.equal(packet.executionAvailable,true)
 assert.equal(packet.payload,undefined);assert.equal(packet.references,undefined);assert.ok(!JSON.stringify(packet).includes('Đoạn tham khảo'))
 const [first,replay]=await Promise.all([service.handlePrivate({kind:'execute',request:a.ownerRequest},f.identity,'local'),service.handlePrivate({kind:'execute',request:{...a.ownerRequest,kind:'replay'}},f.identity,'local')])
 assert.deepEqual(first,replay);assert.equal(f.counts().sends,1);assert.equal(f.counts().validated,1)
 assert.throws(()=>lunaOneShot(f.dir,f.now).consume({...f.template,request:a.ownerRequest,binding:a.binding}))
 await assert.rejects(service.handlePrivate({kind:'owner-preview'},f.identity,'local'),{code:'OWNER_ATTEMPT_USED'})
})

test('server restart, cross-user access and changed payload do not rebind or create a replacement generation',async t=>{
 const f=await setup(t),service=f.create(),p=await service.handlePrivate({kind:'owner-preview'},f.identity,'local')
 const binding=readFileSync(join(f.dir,'replacement-binding.json'),'utf8')
 await assert.rejects(service.handlePrivate({kind:'owner-preview'},{...f.identity,uid:'other-uid'},'local'),{code:'IDENTITY_CHANGED'})
 await assert.rejects(service.handlePrivate({kind:'execute',request:{...p.ownerRequest,messages:[{...p.ownerRequest.messages[0],text:'Changed'}]}},f.identity,'local'),{code:'OPERATION_CONFLICT'})
 await assert.rejects(f.create().handlePrivate({kind:'owner-preview'},f.identity,'local'),{code:'SESSION_LOST'})
 assert.equal(readFileSync(join(f.dir,'replacement-binding.json'),'utf8'),binding)
 assert.equal(existsSync(join(f.dir,'first-attempt.json')),false);assert.equal(f.counts().sends,0)
})

test('source content change is held with a specific mismatch; no client approval or detached references can authorize it',async t=>{
 const f=await setup(t),s=f.sources[0],text=s.text+' Nội dung mới.'
 const hash=lunaHash(text)
 await importSource({...s.record,rawFile:hash,permissions:{...s.record.permissions,sourceHash:hash}},Buffer.from(text),text)
 await assert.rejects(f.create().handlePrivate({kind:'owner-preview'},f.identity,'local'),error=>{assert.equal(error.code,'OWNER_PREVIEW_MISMATCH');assert.match(error.message,/nguồn\/version/);return true})
 assert.equal(existsSync(join(f.dir,'authorization.json')),false);assert.equal(f.counts().sends,0)
})

test('permission revocation after authorization prevents key consumption and disables new-attempt retry',async t=>{
 const f=await setup(t),service=f.create(),p=await service.handlePrivate({kind:'owner-preview'},f.identity,'local'),s=f.sources[0]
 await importSource({...s.record,permissions:{...s.record.permissions,externalExport:false}},Buffer.from(s.text),s.text)
 await assert.rejects(service.handlePrivate({kind:'execute',request:p.ownerRequest},f.identity,'local'),{code:'ATTEMPT_FAILED',retry:'none'})
 assert.equal(f.counts().sends,0);assert.equal(existsSync(join(f.dir,'first-attempt.json')),false)
 await assert.rejects(service.handlePrivate({kind:'owner-preview'},f.identity,'local'))
})

test('unknown provider outcome permanently consumes the one attempt; no automatic retry or reauthorization',async t=>{
 const f=await setup(t);let sends=0
 const service=f.create({send:async()=>{sends++;throw Error('synthetic network loss')}}),p=await service.handlePrivate({kind:'owner-preview'},f.identity,'local')
 await assert.rejects(service.handlePrivate({kind:'execute',request:p.ownerRequest},f.identity,'local'),{code:'OUTCOME_UNKNOWN',retry:'none'})
 await assert.rejects(service.handlePrivate({kind:'execute',request:{...p.ownerRequest,kind:'replay'}},f.identity,'local'),{code:'OUTCOME_UNKNOWN',retry:'none'})
 await assert.rejects(f.create().handlePrivate({kind:'owner-preview'},f.identity,'local'),{code:'OWNER_ATTEMPT_USED'})
 assert.equal(sends,1);assert.equal(JSON.parse(readFileSync(join(f.dir,'first-attempt.json'),'utf8').split('\n')[0]).outcome,'unknown')
})

test('private UI preparation adopts the exact server request and double-clicks dispatch only once',async t=>{
 const f=await setup(t),service=f.create(),fetcher=async(_path,options)=>{
  try{const r=await service.handlePrivate(JSON.parse(options.body),f.identity,'local');return Response.json('previewOnly'in r?browserReceipt(r):r)}
  catch(error){return Response.json({error:{code:error.code,message:error.message,retry:error.retry}},{status:error.status??503})}
 }
 let receipt
 const transport=createPrivateLunaTransport(p=>receipt=p,fetcher,async()=> 'SYNTHETIC_SDK_TOKEN'),store=new ConversationStore(transport)
 await Promise.all([store.prepareApproved(),store.prepareApproved()])
 const state=store.getSnapshot(),c=state.conversations.find(c=>c.id===state.activeId)
 assert.equal(c.error.code,'OWNER_APPROVED_READY');assert.equal(c.messages[0].id,f.template.request.messages[0].id)
 assert.equal(receipt.payloadSHA,f.template.payloadSHA);assert.equal(f.counts().sends,0)
 await Promise.all([store.retry(c.id),store.retry(c.id)])
 assert.equal(f.counts().sends,1);assert.equal(store.getSnapshot().conversations.find(v=>v.id===c.id).messages.length,2)
})

test('actual Vite HTTP middleware + official Firebase SDK prepare and execute the fixture once, with no client authority',async t=>{
 const app=initializeApp({apiKey:'demo-inspire-local-only',projectId:'demo-inspire',authDomain:'demo-inspire.firebaseapp.com'},'owner-http-'+randomUUID())
 const auth=initializeAuth(app,{persistence:inMemoryPersistence});connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true})
 await signInAnonymously(auth);const uid=auth.currentUser.uid
 t.after(async()=>{await signOut(auth);await deleteApp(app);await require('firebase-admin/auth').getAuth().deleteUser(uid)})
 const f=await setup(t,uid),service=f.create(),handlers=[]
 const previous={};for(const [key,value] of Object.entries({INSPIRE_PRIVATE_TEST:'1',INSPIRE_FATHER_WEEKEND:'0',INSPIRE_LUNA_API_PREVIEW:'1',INSPIRE_BILLING_ROUTE:'api-key'})){previous[key]=process.env[key];process.env[key]=value}
 t.after(()=>{for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value}})
 const server=createServer((req,res)=>{
  let index=0
  const next=()=>{const handler=handlers[index++];if(!handler){res.statusCode=404;res.end();return}if(!req.url.startsWith(handler.path))return next();handler.run(req,res,next)}
  next()
 })
 inspirePrototype(()=>service,()=>service).configureServer({middlewares:{use(path,run){handlers.push(typeof path==='function'?{path:'/',run:path}:{path,run})}},httpServer:server})
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 t.after(()=>new Promise(resolve=>server.close(resolve)))
 const base='http://127.0.0.1:'+server.address().port,packets=[]
 const transport=createPrivateLunaTransport(p=>packets.push(p),async(path,options)=>{
  const response=await fetch(base+path,{...options,headers:{...options.headers,Origin:base}})
  assert.match(response.headers.get('content-type'),/application\/json/)
  return response
 },()=>auth.currentUser.getIdToken(true))
 const store=new ConversationStore(transport)
 await store.prepareApproved()
 const state=store.getSnapshot(),c=state.conversations.find(c=>c.id===state.activeId)
 assert.equal(packets[0].payloadSHA,f.template.payloadSHA);assert.equal(f.counts().sends,0)
 const forbidden=await fetch(base+'/api/inspire-luna',{method:'POST',headers:{'Content-Type':'application/json',Origin:base,Authorization:'Bearer '+await auth.currentUser.getIdToken(true)},body:JSON.stringify({kind:'owner-preview',approved:true})})
 assert.equal(forbidden.status,400)
 await Promise.all([store.retry(c.id),store.retry(c.id)])
 assert.equal(f.counts().sends,1);assert.equal(f.counts().validated,1)
 assert.equal(store.getSnapshot().conversations.find(v=>v.id===c.id).status,'idle')
})
test.after(async()=>{await db.terminate()})
