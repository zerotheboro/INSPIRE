// Real local emulator restart evidence, synthetic quota fixture, NO model.
import assert from 'node:assert/strict'
import {readFileSync,writeFileSync,readdirSync,existsSync,mkdirSync} from 'node:fs'
import {join,resolve,relative} from 'node:path'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {requireLocalEmulators} from '../functions/src/inspireLocalService.ts'
import {AccountService} from '../functions/src/inspireAccount.ts'
process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';requireLocalEmulators()
const require=createRequire(new URL('../functions/package.json',import.meta.url)),db=require('firebase-admin/firestore').getFirestore(),auth=require('firebase-admin/auth').getAuth()
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v
const sha=v=>createHash('sha256').update(v).digest('hex'),digest=v=>sha(JSON.stringify(canonical(v)))
const privateOut='.private.local/rag-durability-20261127',evidence='docs/evidence/rag-restore-2026-11-27'
const uid='rag-restart-synthetic-20261127',identity={uid,email:'rag-restart@synthetic.invalid',registered:true,providers:['password'],createdAt:new Date().toISOString()}
function treeDigest(root,accept){if(!existsSync(root))return {files:0,sha256:digest([])};const files=[];const walk=p=>{for(const d of readdirSync(p,{withFileTypes:true})){const f=join(p,d.name);if(d.isSymbolicLink())throw Error('PROTECTED_PATH_LINK');if(d.isDirectory())walk(f);else if(accept(f))files.push([relative(root,f),sha(readFileSync(f))])}};walk(root);files.sort((a,b)=>a[0].localeCompare(b[0]));return {files:files.length,sha256:digest(files)}}
function protectedFiles(){const local=join(process.env.LOCALAPPDATA,'INSPIRE-Luna');return {sourceHistory:treeDigest(resolve('.private.local/knowledge/history'),p=>p.endsWith('.json')),receiptsSHA:sha(readFileSync('.private.local/knowledge/receipts.json')),operatorLedger:treeDigest(local,p=>/\.(json|jsonl)$/.test(p))}}
async function fingerprints(){
 const sources=await db.collection('inspireKnowledge').get(),versions=await db.collectionGroup('versions').get(),other=[]
 const walk=async collection=>{for(const doc of (await collection.get()).docs){other.push([doc.ref.path,doc.data()]);for(const child of await doc.ref.listCollections())await walk(child)}}
 for(const collection of await db.listCollections())if(collection.id!=='inspireKnowledge')await walk(collection)
 const sorted=items=>items.sort((a,b)=>a[0].localeCompare(b[0]))
 return {knowledge:{documents:sources.size,sha256:digest(sorted(sources.docs.map(d=>[d.id,d.data()])))},versions:{documents:versions.size,sha256:digest(sorted(versions.docs.map(d=>[d.ref.path,d.data()])))},quotaAndOtherState:{documents:other.length,sha256:digest(sorted(other))},protected:protectedFiles()}
}
const request=operationId=>({kind:'send',epoch:'offline-before-restart',sessionId:'offline-session',operationId,conversationId:'offline-conversation',messages:[{id:'synthetic-user',role:'user',text:'Dữ liệu giả kiểm tra bảo toàn quota qua restart; không gọi mô hình.'}]})
try{
 mkdirSync(privateOut,{recursive:true});mkdirSync(evidence,{recursive:true})
 if(process.argv[2]==='before'){
  assert.equal(existsSync(join(privateOut,'restart-before.json')),false,'BEFORE_ALREADY_CAPTURED')
  const old=await db.doc('inspireAccounts/'+uid).get();assert.equal(old.exists,false,'EXISTING_FIXTURE_HOLD')
  await auth.createUser({uid,email:identity.email,password:'Synthetic-no-real-user-20261127!'})
  const account=new AccountService(),completed=request('synthetic-completed-20261127'),unknown=request('synthetic-unknown-20261127')
  await account.account(identity);await account.reserve(identity,completed);await account.settle(identity,completed.operationId,'completed');await account.reserve(identity,unknown);await account.settle(identity,unknown.operationId,'unknown')
  const view=await account.account(identity);assert.equal(view.quota.completed,1);assert.equal(view.quota.pending,1)
  const record={...await fingerprints(),requests:{completed,unknown},uid}
  writeFileSync(join(privateOut,'restart-before.json'),JSON.stringify(record,null,2),{flag:'wx'})
  console.log(JSON.stringify({captured:true,knowledgeDocuments:record.knowledge.documents,versionDocuments:record.versions.documents,syntheticCompleted:1,syntheticPending:1,modelCalls:0}))
 }else if(process.argv[2]==='after'){
  const before=JSON.parse(readFileSync(join(privateOut,'restart-before.json'),'utf8')),after=await fingerprints()
  for(const field of ['knowledge','versions','quotaAndOtherState','protected'])assert.deepEqual(after[field],before[field],field+' changed across native restart')
  assert.equal((await auth.getUser(uid)).uid,uid)
  const account=new AccountService()
  for(const r of Object.values(before.requests))await assert.rejects(account.reserve(identity,r),{code:'RESULT_UNAVAILABLE'})
  const view=await account.account(identity);assert.equal(view.quota.completed,1);assert.equal(view.quota.pending,1);assert.equal(view.quota.remaining,28)
  const report={executed:true,nativeExportImportRestart:true,knowledgeAndVersionBytesPreserved:true,authUIDPreserved:true,quotaAndPendingReservationsPreserved:true,completedAndUnknownOperationsRejectReplay:true,originalsHistoryAndOperatorLedgersUnchanged:true,completed:1,pending:1,remaining:28,fingerprints:after,modelCalls:0}
  writeFileSync(join(evidence,'restart-verification.json'),JSON.stringify(report,null,2))
  // Only the synthetic fixture introduced above is removed. Snapshot again
  // before final restart so no old test account returns on the next launch.
  // Keep global inspireOperations tombstones: consumed/unknown operations
  // must remain blocked even after account cleanup.
  await db.recursiveDelete(db.doc('inspireAccounts/'+uid));await auth.deleteUser(uid)
  console.log(JSON.stringify(report,null,2))
 }else if(process.argv[2]==='final'){
  const before=JSON.parse(readFileSync(join(privateOut,'restart-before.json'),'utf8')),after=await fingerprints()
  for(const field of ['knowledge','versions','protected'])assert.deepEqual(after[field],before[field],field+' differs after final clean restart')
  await assert.rejects(auth.getUser(uid),{code:'auth/user-not-found'})
  const operations=(await db.collection('inspireOperations').get()).docs
  assert.equal(after.quotaAndOtherState.documents,2,'Only the two deny tombstones must remain after synthetic account cleanup')
  const operationKey=r=>sha(uid+':'+r.operationId)
  assert.deepEqual(operations.map(d=>d.id).sort(),Object.values(before.requests).map(operationKey).sort())
  for(const [kind,r]of Object.entries(before.requests)){
   const op=operations.find(d=>d.id===operationKey(r)).data()
   assert.equal(op.uid,uid);assert.equal(op.status,kind==='completed'?'completed':'unknown')
   assert.equal(op.fingerprint,sha(JSON.stringify(r)));assert.equal(op.epoch,r.epoch)
   await assert.rejects(new AccountService().reserve(identity,r),{code:'RESULT_UNAVAILABLE'})
  }
  const report={executed:true,finalCleanRestart:true,knowledgeAndVersionsIdentical:true,sourceHistoryAndOperatorLedgerIdentical:true,syntheticAccountDidNotReturn:true,consumedAndUnknownDenyTombstonesPreserved:2,replayStillRejected:true,initialFinalCheck:'Initial test expected zero documents after account cleanup; global operation tombstones correctly remain. Initial failure log preserved; corrected check verifies their exact IDs/status/fingerprints and replay refusal. No tombstone deleted.',modelCalls:0}
  writeFileSync(join(evidence,'final-restart.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report))
 }else throw Error('USE before OR after OR final')
}finally{await db.terminate()}
