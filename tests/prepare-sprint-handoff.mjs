// Local evidence only. No grant issuance, SDK, login or model request.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {requireLocalEmulators} from '../functions/src/inspireLocalService.ts'
import {retrieveKnowledge,assertKnowledgeExport} from '../functions/src/inspireKnowledge.ts'
import {prepareLunaKnowledgeInput,prepareLunaInput} from '../functions/src/inspireLuna.ts'
import {chatgptThreadInput} from '../functions/src/inspireChatgptTransport.ts'
import {emptyPreferences} from '../functions/src/inspireAccount.ts'
import {createRequire} from 'node:module'
process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';requireLocalEmulators()
const out='docs/evidence/sprint-2026-11-25',local='.private.local/sprint-20261125'
mkdirSync(out,{recursive:true});mkdirSync(local,{recursive:true})
const sha=s=>createHash('sha256').update(s).digest('hex')
const coverage=JSON.parse(readFileSync('.private.local/knowledge/corpus-coverage.json'))
const receipts=JSON.parse(readFileSync('.private.local/knowledge/receipts.json'))
const manifest=JSON.parse(readFileSync('.private.local/knowledge/corpus-manifest.json'))
const request={kind:'send',epoch:'frozen-sprint-20261125',sessionId:'father-sprint-first-session',operationId:'father-sprint-first-attempt',conversationId:'father-sprint-first-conversation',messages:[{id:'first-synthetic-question',role:'user',text:'Tình huống giả định: Tôi có một ngày nhiều việc. Giúp tôi chọn việc nên làm trước.'}]}
const context={messages:request.messages,userStatedPreferences:emptyPreferences,operatingInstructions:[],supportingKnowledge:[]}
const prepared=await prepareLunaKnowledgeInput(context,request)
const proposal={schema:'inspire-sprint-first-preview-v1',request,prepared,
 threadStart:chatgptThreadInput(prepared),turnStart:{model:'gpt-6-luna',clientUserMessageId:request.operationId,input:[{type:'text',text:prepared.text,text_elements:[]}]},
 unresolved:['Actual isolated ChatGPT-managed sign-in and post-login effective capability check','Trusted threadId assigned only after isolated thread creation','Separate owner exact-attempt release'],
 sourceFree:prepared.sourceCount===0,approved:false,maxApplicationAttempts:1,automaticApplicationRetries:false,
 displayLimitCharacters:2000,providerTokenOrCostLimit:false,providerManagedRetriesControlled:false}
const fingerprint=sha(JSON.stringify(proposal)),frozen={...proposal,fingerprint}
const file=local+'/first-attempt.json';if(existsSync(file)&&readFileSync(file,'utf8')!==JSON.stringify(frozen,null,2)+'\n')throw Error('FROZEN_PREVIEW_CHANGED')
writeFileSync(file,JSON.stringify(frozen,null,2)+'\n');writeFileSync(out+'/first-attempt.json',JSON.stringify(frozen,null,2)+'\n')
const traces=[]
for(const [i,q] of ['ưu tiên công việc hành động','đời sống nội tâm cảm xúc','mối quan hệ ranh giới','ý nghĩa lựa chọn cuộc sống'].entries()){
 const messages=[{id:'u1',role:'user',text:q}]
 const sections=await retrieveKnowledge(messages,false,undefined,true)
 let exportStatus='no-source';if(sections.length){try{await assertKnowledgeExport(sections);exportStatus='permitted'}catch{exportStatus='HELD: runtime/export permission unresolved'}}
 // Construction uses the same base envelope; this is NOT dispatch eligible.
 const r={...request,operationId:'review-'+i,messages},base=prepareLunaInput({...context,messages},r)
 const adapterInput={...JSON.parse(base.text),supportingKnowledge:sections}
 traces.push({query:q,adapterInput,dispatchEligible:false,exportStatus})
}
writeFileSync(local+'/real-source-review-trace.json',JSON.stringify(traces,null,2))
writeFileSync(out+'/real-source-reference-trace.json',JSON.stringify({liveCalls:0,scope:'Actual source passages in a local review envelope, not permitted dispatch. Raw input kept private; synthetic permitted runtime trace is separate.',trace:traces.map(t=>({query:t.query,dispatchEligible:false,exportStatus:t.exportStatus,sources:t.adapterInput.supportingKnowledge.map(({text,...r})=>({...r,textSHA:sha(text),characters:text.length})),inputHash:sha(JSON.stringify(t.adapterInput))}))},null,2))
const require=createRequire(new URL('../functions/package.json',import.meta.url)),db=require('firebase-admin/firestore').getFirestore()
const docs=(await db.collection('inspireKnowledge').get()).docs.filter(d=>d.id!=='_index')
const real=docs.filter(d=>manifest.some(m=>m.id===d.id))
const indexed=real.filter(d=>(d.data().sections||[]).length)
const report={discoveredReceipts:receipts.length,manifestEntries:manifest.length,extractedDocuments:coverage.filter(r=>r.result==='extracted').length,indexedDocuments:indexed.length,indexedSections:indexed.reduce((n,d)=>n+d.data().sections.length,0),duplicates:coverage.filter(r=>r.result==='duplicate').length,archives:coverage.filter(r=>r.result==='archive-receipt').length,codeOrReceipt:coverage.filter(r=>r.result==='code-or-receipt').length,engineeringReceipts:coverage.filter(r=>r.result==='engineering-receipt').length,errors:coverage.filter(r=>/error|missing|bound/.test(r.result)),externallyEligibleRealDocuments:real.filter(d=>d.data().externalEligible).map(d=>d.id),
 referenceCollection:real.filter(d=>d.data().kind!=='operating-rules'&&(d.data().sections||[]).length).map(d=>{const r=d.data();return {id:d.id,title:r.title,version:r.version,hash:r.hash,status:r.status,permittedUse:r.permittedUse,externalExport:r.permissions?.externalExport??false,relations:r.relations??null,sections:r.sections.map(({text,...s})=>s)}}),
 heldOperatingSources:real.filter(d=>d.data().kind==='operating-rules').map(d=>({id:d.id,title:d.data().title,hash:d.data().hash})),permissionsChanged:false,reviewLibrarySearchable:true}
writeFileSync(out+'/corpus-coverage.json',JSON.stringify(report,null,2))
await db.terminate()
console.log(JSON.stringify({indexedDocuments:report.indexedDocuments,sections:report.indexedSections,duplicates:report.duplicates,externalEligible:report.externallyEligibleRealDocuments.length,previewFingerprint:fingerprint,sourceCount:prepared.sourceCount}))
