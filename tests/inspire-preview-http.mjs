// Diagnose localhost PREVIEW only, using official Firebase SDK credentials kept
// in memory. Never sends execute, creates a spending grant, or calls a model.
import {initializeApp,deleteApp} from 'firebase/app'
import {initializeAuth,inMemoryPersistence,connectAuthEmulator,signInAnonymously,signOut} from 'firebase/auth'
import {createRequire} from 'node:module'
import {randomUUID} from 'node:crypto'
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs'
import {requireLocalEmulators} from '../functions/src/inspireLocalService.ts'
import {createPrivateLunaTransport} from '../src/services/InspireAIconnect.ts'
const out=process.env.INSPIRE_PREVIEW_EVIDENCE||'docs/evidence/owner-preview-2026-11-25/initial-http.json'
const nativeFetch=globalThis.fetch
globalThis.fetch=(input,options)=>{
 const url=new URL(typeof input==='string'?input:input.url)
 if(url.hostname!=='127.0.0.1'||!['5173','9099'].includes(url.port))throw Error('DIAGNOSIS_LOOPBACK_ONLY')
 if(url.port==='5173'&&options?.body&&JSON.parse(options.body).kind==='execute')throw Error('DIAGNOSIS_NO_EXECUTE')
 return nativeFetch(input,options)
}
process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099'
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'
requireLocalEmulators()
const require=createRequire(new URL('../functions/package.json',import.meta.url))
const db=require('firebase-admin/firestore').getFirestore(),adminAuth=require('firebase-admin/auth').getAuth()
const app=initializeApp({apiKey:'demo-inspire-local-only',projectId:'demo-inspire',authDomain:'demo-inspire.firebaseapp.com'},'preview-diagnosis-'+randomUUID())
const auth=initializeAuth(app,{persistence:inMemoryPersistence})
connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true})
const report={inferenceCalls:0,spendingAuthorizationCreated:false,browserAutomation:'NOT VERIFIED',steps:[]}
let uid
async function post(kind,request){
 const started=performance.now(),token=await auth.currentUser.getIdToken(true)
 const response=await fetch('http://127.0.0.1:5173/api/inspire-luna',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,Origin:'http://127.0.0.1:5173'},body:JSON.stringify({kind,...(request?{request}:{})}),signal:AbortSignal.timeout(15000)})
 const text=await response.text()
 const step={kind,status:response.status,ms:Math.round(performance.now()-started),contentType:response.headers.get('content-type'),json:false}
 let data
 try{data=JSON.parse(text);step.json=true;step.code=data.error?.code;step.payloadSHA=data.payloadSHA;step.sourceCount=data.sourceCount;step.reservedNanoUSD=data.reservedNanoUSD;step.keyConfigured=data.keyConfigured}catch{step.responseFormat=text.trim().startsWith('<')?'HTML':'non-JSON'}
 report.steps.push(step);console.log(JSON.stringify(step));return {response,data}
}
try{
 const started=performance.now();await signInAnonymously(auth);uid=auth.currentUser.uid
 report.auth={officialSDK:true,inMemoryFixture:true,ms:Math.round(performance.now()-started)}
 console.log(JSON.stringify({phase:'SDK_SIGN_IN',...report.auth}))
 const session=await post('session')
 if(session.response.status!==200)throw Error('SESSION_HOLD')
 const frozen=JSON.parse(readFileSync('.private.local/api-rag-final-20261125/first-runtime-preview.json','utf8'))
 const request={...frozen.request,epoch:session.data.epoch,sessionId:session.data.sessionId,operationId:'diagnosis-'+randomUUID(),conversationId:'diagnosis-'+randomUUID()}
 const preview=await post('preview',request)
 report.previewMatches=preview.data?.payloadSHA===frozen.payloadSHA
 if(!report.previewMatches)process.exitCode=1
 let clientReceipt
 const client=createPrivateLunaTransport(value=>{clientReceipt=value},(path,options)=>fetch('http://127.0.0.1:5173'+path,{...options,headers:{...options.headers,Origin:'http://127.0.0.1:5173'}}),()=>auth.currentUser.getIdToken(true))
 const clientSession=await client.connect(),clientStarted=performance.now()
 const clientRequest={...request,epoch:clientSession.epoch,sessionId:clientSession.sessionId,operationId:'client-diagnosis-'+randomUUID()}
 try{await client.send(clientRequest);throw Error('CLIENT_PREVIEW_MUST_NOT_GENERATE')}
 catch(error){if(error.code!=='AUTHORIZATION_REQUIRED')throw error}
 report.frontendTransport={code:'AUTHORIZATION_REQUIRED',ms:Math.round(performance.now()-clientStarted),payloadSHA:clientReceipt.payloadSHA,reservedNanoUSD:clientReceipt.reservedNanoUSD,sourceCount:clientReceipt.sourceCount}
 if(clientReceipt.payloadSHA!==frozen.payloadSHA)throw Error('CLIENT_PREVIEW_HASH_MISMATCH')
 console.log(JSON.stringify({phase:'ACTUAL_FRONTEND_TRANSPORT',...report.frontendTransport}))
}catch(error){report.failed={name:error.name,code:error.code??null,message:/^[A-Z_]+$/.test(error.message)?error.message:'LOCAL_HTTP_OR_SDK_FAILURE'};process.exitCode=1;console.log(JSON.stringify(report.failed))}
finally{
 if(uid){await signOut(auth);await adminAuth.deleteUser(uid);await db.recursiveDelete(db.doc('inspireAccounts/'+uid))}
 await deleteApp(app);await db.terminate();globalThis.fetch=nativeFetch
 mkdirSync(out.slice(0,out.lastIndexOf('/')),{recursive:true});writeFileSync(out,JSON.stringify(report,null,2)+'\n')
}
