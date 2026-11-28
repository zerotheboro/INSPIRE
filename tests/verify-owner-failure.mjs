// Snapshot the existing owner authority byte for byte. No invented grant,
// no live-budget mutation: database writes go to a separate named local DB.
import assert from 'node:assert/strict'
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {createRequire} from 'node:module'
import {randomUUID} from 'node:crypto'
import {requireLocalEmulators} from '../functions/src/inspireLocalService.ts'
import {lunaSessionBudget} from '../functions/src/inspireLunaBudget.ts'
import {createPrivateLunaService} from '../functions/src/inspireLunaService.ts'
import {LUNA_API,lunaHash} from '../functions/src/inspireLunaApi.ts'
import {initializeApp as clientApp,deleteApp} from 'firebase/app'
import {getAuth,connectAuthEmulator,signInWithCustomToken,inMemoryPersistence,setPersistence} from 'firebase/auth'
Object.assign(process.env,{FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',INSPIRE_PRIVATE_CONVERSATION:'1',OPENAI_API_KEY:'sk-SYNTHETIC_TRANSPORT_ONLY_NO_INFERENCE'})
requireLocalEmulators()
const require=createRequire(new URL('../functions/package.json',import.meta.url)),sdk=require('firebase-admin/firestore'),db=sdk.getFirestore(),admin=require('firebase-admin/auth').getAuth()
const isolated=sdk.getFirestore(undefined,'owner-failure-verification-'+Date.now())
const source=join(process.env.LOCALAPPDATA,'INSPIRE-Luna/private-session'),out=resolve('.private.local/owner-failure-20261128');mkdirSync(out,{recursive:true})
const dir=mkdtempSync(join(tmpdir(),'inspire-owner-state-'))
const policyBytes=readFileSync(join(source,'policy.json')),policy=JSON.parse(policyBytes),id=policy.sessionId
mkdirSync(join(dir,id));writeFileSync(join(dir,'policy.json'),policyBytes)
const retained={}
for(const file of ['uid-migration.json',id+'/identity.json',id+'/events.jsonl']){const b=readFileSync(join(source,file));retained[file]=lunaHash(b.toString());writeFileSync(join(dir,file),b)}
const m=JSON.parse(readFileSync(join(dir,'uid-migration.json')))
assert.ok(['pending','complete'].includes(m.phase))
const capturedPhase=m.phase
// The live migration may have completed via the authenticated UI poll while
// investigating. Reconstruct ONLY its logged prior phase inside the isolated
// database; the approved policy and accounting ledger remain byte-identical.
if(m.phase==='complete'){
 writeFileSync(join(dir,'uid-migration.json'),JSON.stringify({...m,toUID:null,phase:'pending'}))
 writeFileSync(join(dir,id,'identity.json'),JSON.stringify({uid:m.fromUID}))
}
const accounts=(await db.collection('inspireAccounts').get()).docs.filter(d=>d.id!==m.fromUID&&d.data().updatedAt)
accounts.sort((a,b)=>b.data().updatedAt.toMillis()-a.data().updatedAt.toMillis())
const uid=m.toUID??accounts[0].id
// Official SDK sign-in to an EXISTING local Auth record, never forged tokens.
await admin.getUser(uid)
const app=clientApp({projectId:'demo-inspire',apiKey:'demo-inspire-local-only'},'owner-failure-'+randomUUID()),auth=getAuth(app)
connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});await setPersistence(auth,inMemoryPersistence)
await signInWithCustomToken(auth,await admin.createCustomToken(uid));const token=await auth.currentUser.getIdToken(true)
const sources=await db.collection('inspireKnowledge').get(),versions=await db.collectionGroup('versions').get()
const writer=isolated.bulkWriter();for(const d of [...sources.docs,...versions.docs])writer.set(isolated.doc(d.ref.path),d.data())
for(const person of [uid,m.fromUID]){for(const suffix of ['', '/usage/guest']){const d=await db.doc('inspireAccounts/'+person+suffix).get();if(d.exists)writer.set(isolated.doc(d.ref.path),d.data())}for(const d of(await db.collection('inspireOperations').where('uid','==',person).get()).docs)writer.set(isolated.doc(d.ref.path),d.data())}
await writer.close()
if(capturedPhase==='complete'){
 const old=(await isolated.doc('inspireAccounts/'+m.fromUID+'/usage/guest').get()).data()
 const current=(await isolated.doc('inspireAccounts/'+uid+'/usage/guest').get()).data()
 assert.ok(current.completed>=old.completed&&current.reserved>=old.reserved)
 await isolated.doc('inspireAccounts/'+uid+'/usage/guest').set({period:'guest',completed:current.completed-old.completed,reserved:current.reserved-old.reserved})
}
const beforeUsage=(await db.doc('inspireAccounts/'+uid+'/usage/guest').get()).data()
const originals={};for(const method of ['doc','collection','collectionGroup','runTransaction']){originals[method]=db[method];db[method]=isolated[method].bind(isolated)}
let sends=0;const inputs=[]
try{
 const budget=lunaSessionBudget(dir),identity=await (await import('../functions/src/inspireAccount.ts')).verifiedIdentity(token)
 const old=createPrivateLunaService({conversation:{...budget,migrateIdentity:async()=>{}},send:async()=>{throw Error('MUST_NOT_SEND')}})
 const s=old.session(identity),r={kind:'send',...s,operationId:randomUUID(),conversationId:randomUUID(),messages:[{id:'owner-state-verification',role:'user',text:'Tình huống giả định: Tôi có một ngày nhiều việc. Giúp tôi chọn việc nên làm trước.'}]};delete r.mode
 await assert.rejects(old.handlePrivate({kind:'conversation',request:r},identity,'127.0.0.1'),{code:'SESSION_IDENTITY'})
 assert.equal(JSON.parse(readFileSync(join(dir,'uid-migration.json'))).phase,'pending')
 const service=createPrivateLunaService({conversation:budget,countInput:async()=>100,quarantine:()=>{},send:async p=>{sends++;inputs.push({request:p.request,references:p.references,payloadSHA:p.payloadSHA,binding:p.binding});return {id:'offline-owner-state-only',status:'completed',model:LUNA_API.model,usage:{input_tokens:100,output_tokens:25},output:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'Bạn có thể chọn một việc quan trọng để bắt đầu. Đây là phản hồi kiểm tra ngoại tuyến, không phải Luna thật.'}]}]}}})
 const session=service.session(identity),request={...r,epoch:session.epoch,sessionId:session.sessionId}
 const first=service.handlePrivate({kind:'conversation',request},identity,'127.0.0.1')
 const duplicate=service.handlePrivate({kind:'conversation',request},identity,'127.0.0.1')
 const [result,concurrent]=await Promise.all([first,duplicate]);assert.deepEqual(concurrent.response,result.response)
 assert.equal(sends,1);assert.ok(result.diagnostics.sourceCount>0);assert.ok(result.diagnostics.controller.some(c=>c.phase==='candidate'&&c.validatedSHA))
 assert.equal(JSON.parse(readFileSync(join(dir,'uid-migration.json'))).phase,'complete')
 const second=await service.handlePrivate({kind:'conversation',request:{...request,kind:'replay'}},identity,'127.0.0.1');assert.deepEqual(second.response,result.response);assert.equal(sends,1)
 const restarted=createPrivateLunaService({conversation:lunaSessionBudget(dir),send:async()=>{sends++;throw Error('MUST_NOT_REGENERATE')}})
 await assert.rejects(restarted.handlePrivate({kind:'conversation',request:{...request,kind:'replay'}},identity,'127.0.0.1'))
 assert.equal(sends,1);assert.equal(lunaSessionBudget(dir).status(uid).reservedAttempts,2)
 await assert.rejects(service.handlePrivate({kind:'recover-unsent',request},identity,'127.0.0.1'),{code:'RESULT_UNKNOWN'})
 const neverSent={...request,operationId:randomUUID()}
 const recovered=await service.handlePrivate({kind:'recover-unsent',request:neverSent},identity,'127.0.0.1')
 assert.equal(recovered.notDispatched,true);assert.equal(recovered.request.operationId,neverSent.operationId)
 assert.deepEqual(recovered.request.messages,neverSent.messages);assert.equal(sends,1)
 const report={executed:true,authoritySource:'byte-identical current owner policy and ledger; prior migration phase reconstructed from the observed pending state in isolated database only; no new grant',originalAuthoritySHA:lunaHash(policyBytes.toString()),originalLedgerSHA:retained[id+'/events.jsonl'],existingUIDVerifiedWithOfficialSDK:true,legacyReplayError:'SESSION_IDENTITY',legacyMigrationStayedPending:true,fixedMigration:'complete',fakeProviderCalls:1,realProviderCalls:0,sourceCount:result.diagnostics.sourceCount,originalController:result.diagnostics.controller,duplicateDidNotGenerate:true,restartDidNotGenerate:true,verificationBudgetOnlyReservedAttempts:2,originalOwnerLedgerUnchanged:true,historicalRequestNetworkCapture:'NOT AVAILABLE; this is a reconstruction using actual owner state, not a captured original request',inputs}
 writeFileSync(join(out,'state-reproduction.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,inputs:undefined,originalController:report.originalController.map(c=>({phase:c.phase,validated:!!c.validatedSHA}))}))
}finally{
 for(const [method,fn]of Object.entries(originals))db[method]=fn
 for(const [file,sha]of Object.entries(retained))assert.equal(lunaHash(readFileSync(join(source,file),'utf8')),sha,'LIVE OWNER STATE CHANGED')
 assert.deepEqual((await db.doc('inspireAccounts/'+uid+'/usage/guest').get()).data(),beforeUsage)
 await deleteApp(app);await db.terminate();await isolated.terminate()
}
