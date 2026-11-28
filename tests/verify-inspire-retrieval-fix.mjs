// Read-only existing live index; old five-case expectations are loaded intact.
// Constructed adapter input is recorded PRIVATELY, never sent to a model.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {requireLocalEmulators} from '../functions/src/inspireLocalService.ts'
import {retrieveKnowledge,assertKnowledgeExport} from '../functions/src/inspireKnowledge.ts'
import {prepareLunaApi} from '../functions/src/inspireLunaApi.ts'
import {emptyPreferences} from '../functions/src/inspireAccount.ts'
process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'
delete process.env.OPENAI_API_KEY;delete process.env.GOOGLE_APPLICATION_CREDENTIALS
requireLocalEmulators()
const require=createRequire(new URL('../functions/package.json',import.meta.url)),sdk=require('firebase-admin/firestore'),db=sdk.getFirestore()
let writeAttempts=0
const deny=()=>{writeAttempts++;throw Error('READ_ONLY_VERIFICATION')}
for(const name of ['set','create','update','delete'])sdk.DocumentReference.prototype[name]=deny
for(const name of ['runTransaction','batch','bulkWriter','recursiveDelete'])sdk.Firestore.prototype[name]=deny
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v
const hash=v=>createHash('sha256').update(v).digest('hex')
const cases=JSON.parse(readFileSync('docs/evidence/rag-restore-2026-11-27/recheck/live-index.json','utf8')).retrieval
const privateOut='.private.local/retrieval-fix-20261127',out='docs/evidence/retrieval-fix-2026-11-27'
const safe=s=>({documentId:s.documentId,title:s.title,version:s.version,hash:s.hash,sectionId:s.sectionId,sectionHash:s.sectionHash,headingPath:s.headingPath,status:s.sourceStatus})
async function metadata(){const index=await db.doc('inspireKnowledge/_index').get(),docs=await db.collection('inspireKnowledge').select('hash','version','status','permissions','internalEligible','externalEligible','kind','relations').get();return {revision:index.data()?.revision,records:docs.size-1,externalEligible:docs.docs.filter(d=>d.data().externalEligible).length,sha256:hash(JSON.stringify(canonical(docs.docs.map(d=>[d.id,d.data()]).sort((a,b)=>a[0].localeCompare(b[0])))))}}
try{
 mkdirSync(out,{recursive:true});mkdirSync(privateOut,{recursive:true})
 const before=await metadata(),results=[]
 for(const c of cases){
  const original=JSON.stringify(c.questions),start=Date.now(),sections=await retrieveKnowledge(c.questions,true)
  await assertKnowledgeExport(sections)
  const request={kind:'send',epoch:'offline-verification',sessionId:'offline-verification',conversationId:'offline-'+c.case,operationId:'offline-'+c.case,messages:c.questions}
  const prepared=prepareLunaApi({messages:c.questions,operatingInstructions:[],userStatedPreferences:emptyPreferences,supportingKnowledge:sections},request,true)
  assert.equal(JSON.stringify(c.questions),original);assert.deepEqual(prepared.payload.input.slice(1),c.questions.map(m=>({role:m.role,content:m.text})))
  assert.deepEqual(JSON.parse(prepared.payload.input[0].content).references,sections);assert.ok(sections.length<=3)
  writeFileSync(privateOut+'/adapter-'+c.case+'.json',JSON.stringify(prepared,null,2))
  const hit=sections.some(s=>c.expectedDocumentIds.includes(s.documentId))
  const result={case:c.case,expectedDocumentIds:c.expectedDocumentIds,selected:sections.map(safe),expectedSourceFound:hit,status:hit?'PASS':'FAIL_EXPECTED_SOURCE_NOT_FOUND',ms:Date.now()-start,permissionVersionRecheck:true,historyUnchanged:true,adapterReferencesExact:true,payloadSHA:prepared.payloadSHA,modelCalls:0}
  results.push(result);console.log(JSON.stringify({case:c.case,status:result.status,selected:sections.map(s=>s.documentId),ms:result.ms}))
 }
 const follow=cases.find(c=>c.case==='follow-up'),latestOnly=await retrieveKnowledge([follow.questions[follow.questions.length-1]],true)
 await assertKnowledgeExport(latestOnly)
 const after=await metadata();assert.deepEqual(after,before);assert.equal(writeAttempts,0)
 const report={executedAt:new Date().toISOString(),liveIndexBefore:before,liveIndexAfter:after,indexUnchanged:true,permissionsChanged:false,writeAttempts,originalExpectationsFile:'docs/evidence/rag-restore-2026-11-27/recheck/live-index.json',cases:results,passed:results.filter(c=>c.expectedSourceFound).length,total:cases.length,latestOnlyControl:{selected:latestOnly.map(safe),expectedSourceFound:latestOnly.some(s=>follow.expectedDocumentIds.includes(s.documentId))},privateAdapterTraces:privateOut+'/adapter-<case>.json',liveGenerationRequests:0,budgetChanges:false}
 writeFileSync(out+'/live-five-cases.json',JSON.stringify(report,null,2))
 assert.equal(report.passed,5,'KEEP ORIGINAL EXPECTATIONS: investigate; never adjust to hide a regression')
 console.log(JSON.stringify({fiveCasesPassed:report.passed,index:after,indexUnchanged:true,modelCalls:0,latestOnlyControlFound:report.latestOnlyControl.expectedSourceFound}))
}finally{await db.terminate()}
