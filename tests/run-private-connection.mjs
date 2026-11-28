// Operator-only, explicitly authorized 2026-11-26 connection verification.
// Not a test runner: --execute-owner-verification is required; at most ONE send.
// Reads no API credential. Official Firebase SDK supplies every bearer token.
import assert from 'node:assert/strict'
import {join,resolve} from 'node:path'
import {existsSync,mkdirSync,readFileSync,openSync,writeSync,fsyncSync,closeSync,renameSync,realpathSync} from 'node:fs'
import {initializeApp,deleteApp} from 'firebase/app'
import {getAuth,connectAuthEmulator,setPersistence,inMemoryPersistence,signInAnonymously} from 'firebase/auth'
import {requireLocalEmulators} from '../functions/src/inspireLocalService.ts'
import {retrieveKnowledge} from '../functions/src/inspireKnowledge.ts'
import {prepareLunaApi,lunaHash,LUNA_API,recheckLunaSources} from '../functions/src/inspireLunaApi.ts'
import {emptyPreferences} from '../functions/src/inspireAccount.ts'
import {createLunaController} from '../functions/src/inspireLunaController.ts'
import {currentIdentityToken} from '../src/services/inspireIdentity.ts'
import {createPrivateConversationTransport} from '../src/services/InspireAIconnect.ts'
import {ConversationStore} from '../src/services/inspireConversation.ts'
import {createRequire} from 'node:module'

assert.equal(process.argv[2],'--execute-owner-verification','OPERATOR_FLAG_REQUIRED')
const base=process.argv[3]??'http://127.0.0.1:5173'
assert.ok(['http://127.0.0.1:5173','http://127.0.0.1:5174'].includes(base))
assert.ok(process.env.LOCALAPPDATA)
assert.notEqual(process.env.NODE_ENV,'production')
const root=join(process.env.LOCALAPPDATA,'INSPIRE-Luna'),directory=join(root,'private-session')
assert.ok(!/onedrive|dropbox|google drive/i.test(root))
const freeze=(file,value)=>{const fd=openSync(file,'wx',0o600);try{writeSync(fd,JSON.stringify(value,null,2)+'\n');fsyncSync(fd)}finally{closeSync(fd)}}
// Never reuse a stopped, dispatched, unknown or previously consumed authority.
for(const name of ['first-attempt.json','replacement-binding.json','authorization.json'])assert.equal(existsSync(join(root,name)),false,'LEGACY_ATTEMPT_RECONCILIATION_REQUIRED: '+name)
if(!existsSync(directory))mkdirSync(directory,{recursive:true,mode:0o700})
assert.equal(realpathSync(directory).toLowerCase(),resolve(directory).toLowerCase())
assert.equal(existsSync(join(directory,'policy.json')),false,'EXISTING_POLICY: inspect journal; never reissue')
assert.equal(existsSync(join(directory,'verify-2026-11-26')),false,'PRIOR_VERIFICATION: never repeat')
assert.equal(existsSync(join(directory,'verification-plan.json')),false,'FROZEN_VERIFICATION: never repeat')
const status=await fetch(base+'/api/inspire-private-status',{signal:AbortSignal.timeout(5000)}).then(r=>r.json())
assert.equal(status.conversationTransport,true);assert.equal(status.chatgptPreview,false)
process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099'
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'
requireLocalEmulators()
const require=createRequire(new URL('../functions/package.json',import.meta.url)),db=require('firebase-admin/firestore').getFirestore()
const app=initializeApp({apiKey:'demo-inspire-local-only',projectId:'demo-inspire',authDomain:'demo-inspire.firebaseapp.com'},'owner-verification-20261126')
const auth=getAuth(app)
connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true})
await setPersistence(auth,inMemoryPersistence)
await signInAnonymously(auth)
let diagnostic
const kinds=[]
const http=async(path,options)=>{kinds.push(JSON.parse(options.body).kind);return fetch(base+path,options)}
const transport=createPrivateConversationTransport(value=>{diagnostic=value},http,()=>currentIdentityToken(auth))
try{
 const session=await transport.connect()
 const ids=['verify-conversation-20261126','verify-message-20261126','verify-operation-20261126']
 const question='Tình huống giả định: Tôi trì hoãn một việc dù đã biết cần làm. Giúp tôi hiểu khoảng cách giữa ý định và hành động.'
 const request={kind:'send',epoch:session.epoch,sessionId:session.sessionId,operationId:ids[2],conversationId:ids[0],messages:[{id:ids[1],role:'user',text:question}]}
 const references=await retrieveKnowledge(request.messages,true)
 assert.ok(references.length>0&&references.length<=3,'RELEVANT_PERMITTED_RAG_REQUIRED')
 const p=prepareLunaApi({messages:request.messages,operatingInstructions:[],userStatedPreferences:{...emptyPreferences},supportingKnowledge:references},request,true)
 await recheckLunaSources(p)
 const controller=createLunaController()
 await controller.preflight(p) // Real native controls, offline, before installing release.
 const held=p.reservedNanoUSD+p.inputTokenBound*LUNA_API.reserveInputNanoUSD
 assert.ok(held<=10000000,'ONE_CENT_CANNOT_BE_GUARANTEED: no dispatch')
 // Revoke, preserve and archive the previous unused owner decision. No reset.
 const old=join(root,'replacement-owner-approval.json')
 if(existsSync(old)){
  const archive=join(root,'superseded-20261126')
  if(!existsSync(archive))mkdirSync(archive,{mode:0o700})
  assert.equal(existsSync(join(archive,'replacement-owner-approval.json')),false)
  renameSync(old,join(archive,'replacement-owner-approval.json'))
  freeze(join(archive,'revocation.json'),{superseded:true,reason:'New owner verification authority replaces, never adds to, the old grant.',at:new Date().toISOString()})
 }
 freeze(join(directory,'verification-plan.json'),{...p,maximumTotalHoldNanoUSD:held,controllerPreflight:controller.evidence(),ownerDecision:'2026-11-26: one synthetic API connection request, total USD 0.01, no inference retry'})
 const policy={schema:'inspire-private-budget-v1',sessionId:'verify-2026-11-26',approved:true,purpose:'verification',uid:auth.currentUser.uid,maxAttempts:1,maxCostNanoUSD:10000000,expiresAt:new Date(Date.now()+3600000).toISOString(),messagesSHA:lunaHash(JSON.stringify(request.messages)),ownerDecision:'Owner 2026-11-26: one synthetic connection verification, USD 0.01 TOTAL, no inference retries; replaces all old grants.',model:LUNA_API.model}
 freeze(join(directory,'policy.json'),policy)
 console.log(JSON.stringify({stage:'exact-verification-before-send',question,model:p.payload.model,maxOutputTokens:p.payload.max_output_tokens,payloadSHA:p.payloadSHA,sourceCount:references.length,references:references.map(({documentId,version,hash,sectionId,sectionHash})=>({documentId,version,hash,sectionId,sectionHash})),maximumTotalReservationUSD:held/1e9,tokenCountAllowanceIncluded:true,automaticRetries:0}))
 const store=new ConversationStore({...transport,connect:async()=>session},()=>ids.shift())
 const conversation=store.getSnapshot().activeId
 store.draft(conversation,question)
 await store.send(conversation) // EXACTLY ONE generation submission; no retry call.
 const result=store.getSnapshot().conversations[0]
 const safeError=result.error?{code:result.error.code,message:result.error.message,retry:result.error.retry}:null
 const safeBudget=await transport.diagnostics()
 const evidence={executedAt:new Date().toISOString(),base,model:LUNA_API.model,question,payloadSHA:p.payloadSHA,binding:p.binding,sourceReferences:references.map(({documentId,version,hash,sectionId,sectionHash})=>({documentId,version,hash,sectionId,sectionHash})),privateInputTrace:'LocalAppData/INSPIRE-Luna/private-session/verification-plan.json',maximumReservationUSD:held/1e9,applicationRequests:kinds,conversationStatus:result.status,error:safeError,diagnostics:diagnostic,budget:safeBudget,browserRendering:'NOT VERIFIED; actual ConversationStore and transport over HTTP executed',publicGeneration:false}
 freeze('docs/evidence/connection-2026-11-26/real-verification.json',evidence)
 console.log(JSON.stringify(evidence,null,2))
 if(result.status==='idle'){
  assert.equal(diagnostic.payloadSHA,p.payloadSHA,'ACTUAL_PAYLOAD_DIFFERS_FROM_OPERATOR_TRACE')
  assert.equal(diagnostic.binding,p.binding,'ACTUAL_REQUEST_DIFFERS_FROM_OPERATOR_TRACE')
  assert.equal(result.messages.length,2)
  console.log(JSON.stringify({validatedResponse:result.messages[1].text}))
  // Activate the SEPARATE father-session authorization after verification ends.
  const father={...policy,sessionId:'father-2026-11-26',purpose:'father',uid:null,maxAttempts:10,maxCostNanoUSD:50000000,expiresAt:new Date(Date.now()+86400000).toISOString(),messagesSHA:null,ownerDecision:'Owner explicit reply 2026-11-26: Cho phép phiên 10 lượt / US$0.05. Separate session, only eligible RAG, no automatic retries.'}
  freeze(join(directory,'verification-policy-completed.json'),policy)
  freeze(join(directory,'policy.next'),father)
  renameSync(join(directory,'policy.next'),join(directory,'policy.json'))
  console.log(JSON.stringify({fatherSessionReleased:true,maxGenerationAttempts:10,maximumTotalReservationUSD:0.05,expiresAt:father.expiresAt,firstSDKUserBindsSession:true,automaticRetries:0}))
 }else{
  console.log(JSON.stringify({stopped:true,noReplacementGeneration:true,fatherSessionReleased:false,reason:'Verification held; approved father grant is not used as a verification retry.'}))
 }
}finally{await deleteApp(app);await db.terminate()}
