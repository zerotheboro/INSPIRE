// Explicit local recovery. No model, credentials, grant creation or quota reset.
import assert from 'node:assert/strict'
import {readFileSync,writeFileSync,existsSync,mkdirSync,realpathSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {createHash} from 'node:crypto'
import {launcherEnvironment} from './start-inspire-emulators.mjs'
import {stateRoot,snapshotFiles,superviseEmulators} from './inspire-emulator-persistence.mjs'
const hash=v=>createHash('sha256').update(v).digest('hex')
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v
const digest=v=>hash(JSON.stringify(canonical(v)))
const operator=join(process.env.LOCALAPPDATA,'INSPIRE-Luna/private-session')
const out=resolve('.private.local/emulator-recovery-20261128');mkdirSync(out,{recursive:true})
const stateFile=join(stateRoot,'state.json'),oldBytes=readFileSync(stateFile)
const old=JSON.parse(oldBytes)
assert.equal(old.status,'running');assert.equal(old.pid,17380);assert.equal(old.childPid,8852)
// This receipt identifies the last tested native snapshot, not an arbitrary
// newest directory. Actual imported content is checked against prior evidence.
const snapshot=join(stateRoot,'snapshots/d29bee75-52a6-4afb-bd0c-e3c3d87557b1')
assert.equal(realpathSync(snapshot).toLowerCase(),resolve(snapshot).toLowerCase())
const files=snapshotFiles(snapshot)
const meta=JSON.parse(readFileSync(join(snapshot,'firebase-export-metadata.json')))
assert.ok(meta.firestore&&meta.auth)
const expected=JSON.parse(readFileSync('.private.local/rag-durability-20261127/restart-before.json'))
const ledgers=[]
for(const [id,policyName] of [['father-2026-11-26','policy.json'],['verify-2026-11-26','verification-policy-completed.json']]){
 const policy=JSON.parse(readFileSync(join(operator,policyName)))
 assert.equal(policy.sessionId,id)
 const file=join(operator,id,'events.jsonl'),bytes=readFileSync(file,'utf8')
 assert.ok(bytes.endsWith('\n'))
 let previous='0'
 const events=bytes.trimEnd().split('\n').map(line=>{const p=JSON.parse(line);assert.equal(p.sha,hash(JSON.stringify([previous,p.event])));previous=p.sha;return p.event})
 const uid=policy.uid??JSON.parse(readFileSync(join(operator,id,'identity.json'))).uid
 assert.ok(typeof uid==='string'&&uid.length>0)
 ledgers.push({id,file,sha:hash(bytes),uid,events})
}
const plan={oldStateSHA:hash(oldBytes),snapshot,files,ledgerSHA:ledgers.map(l=>({id:l.id,sha:l.sha})),expectedKnowledge:expected.knowledge,expectedVersions:expected.versions}
const planFile=join(out,'plan.json')
if(existsSync(planFile))assert.deepEqual(JSON.parse(readFileSync(planFile)),plan)
else {writeFileSync(join(out,'state-before.json'),oldBytes,{flag:'wx'});writeFileSync(planFile,JSON.stringify(plan,null,2),{flag:'wx'})}
const alive=pid=>{try{process.kill(pid,0);return true}catch(e){if(e.code==='EPERM')throw e;return false}}
await superviseEmulators(launcherEnvironment(process.env),{recovery:{
 async prepare(){
  assert.equal(alive(old.pid),false,'OLD_SUPERVISOR_STILL_PRESENT')
  assert.equal(alive(old.childPid),false,'OLD_FIREBASE_STILL_PRESENT')
  assert.equal(hash(readFileSync(stateFile)),plan.oldStateSHA)
  assert.deepEqual(snapshotFiles(snapshot),files)
  for(const l of ledgers)assert.equal(hash(readFileSync(l.file)),l.sha)
  return snapshot
 },
 async verify(db){
  const index=db.doc('inspireKnowledge/_index')
  // Never advertise readiness while snapshot and counters are reconciled.
  const original=(await index.get()).data();assert.equal(original.restoreStatus,'checkpointing')
  const rows=await db.collection('inspireKnowledge').get(),versions=await db.collectionGroup('versions').get()
  const sorted=xs=>xs.sort((a,b)=>a[0].localeCompare(b[0]))
  const sources=rows.docs.map(d=>[d.id,d.id==='_index'?{...d.data(),restoreStatus:'ready'}:d.data()])
  assert.deepEqual({documents:rows.size,sha256:digest(sorted(sources))},expected.knowledge)
  assert.deepEqual({documents:versions.size,sha256:digest(sorted(versions.docs.map(d=>[d.ref.path,d.data()])))},expected.versions)
  const tombstones=(await db.collection('inspireOperations').get()).docs
  for(const [kind,r]of Object.entries(expected.requests)){
   const op=tombstones.find(d=>d.id===hash(expected.uid+':'+r.operationId))?.data()
   assert.ok(op);assert.equal(op.status,kind==='completed'?'completed':'unknown');assert.equal(op.fingerprint,hash(JSON.stringify(r)))
  }
  const receipts=[]
  for(const l of ledgers){
   assert.equal(hash(readFileSync(l.file)),l.sha)
   const reservations=l.events.filter(e=>e.type==='reserve')
   const complete=reservations.filter(e=>l.events.some(v=>v.type==='validated'&&v.operationId===e.operationId)).length
   const pending=reservations.length-complete
   const usage=db.doc('inspireAccounts/'+l.uid+'/usage/guest')
   await db.runTransaction(async tx=>{
    const previous=await tx.get(usage)
    const operations=await Promise.all(reservations.map(e=>tx.get(db.doc('inspireOperations/'+hash(l.uid+':'+e.operationId)))))
    tx.set(usage,{period:'guest',completed:Math.max(previous.data()?.completed??0,complete),reserved:Math.max(previous.data()?.reserved??0,pending)},{merge:true})
    for(let i=0;i<reservations.length;i++)if(!operations[i].exists){const e=reservations[i];tx.create(operations[i].ref,{uid:l.uid,period:'guest',status:l.events.some(v=>v.type==='validated'&&v.operationId===e.operationId)?'completed':'unknown',fingerprint:'recovered-ledger:'+e.binding,recoveryLedgerSHA:l.sha})}
   })
   receipts.push({session:l.id,reservedAttempts:reservations.length,completed:complete,unknown:pending,heldNanoUSD:reservations.reduce((n,e)=>n+e.hold,0),ledgerUnchanged:hash(readFileSync(l.file))===l.sha})
  }
  assert.deepEqual(snapshotFiles(snapshot),files)
  await index.set({restoreStatus:'ready'},{merge:true})
  const report={recovered:true,knowledgeBytesVerified:true,versionsVerified:true,originalUnknownAndCompletedTombstonesPreserved:true,receipts,sourcePermissionsChanged:false,modelCalls:0}
  writeFileSync(join(out,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report))
 }
}})
