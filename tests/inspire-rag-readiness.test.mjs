import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {knowledgeReadiness} from '../functions/src/inspireKnowledge.ts'
import {verifiedImport,snapshotFiles} from './inspire-emulator-persistence.mjs'
import {copyCompletedNativeExport} from './inspire-emulator-persistence.mjs'
import {createRequire} from 'node:module'
import {createPrivateLunaService} from '../functions/src/inspireLunaService.ts'
import {requireLocalEmulators} from '../functions/src/inspireLocalService.ts'
function dbFixture(meta,docs=[]){let reads=0;return {doc:()=>({get:async()=>({exists:!!meta,data:()=>meta})}),collection:()=>({select:()=>({get:async()=>{reads++;return {docs:docs.map((d,i)=>({id:'document'+i,data:()=>d}))}}})}),reads:()=>reads}}
test('empty, partial, unverified and unavailable index never report ready',async()=>{
 for(const meta of [null,{revision:1},{revision:2,restoreStatus:'restoring'}])assert.equal((await knowledgeReadiness(dbFixture(meta))).ready,false)
 assert.equal((await knowledgeReadiness({doc(){throw Error('OFFLINE')}})).state,'unavailable')
 const invalid=dbFixture({revision:2,restoreStatus:'ready'},[{indexVersion:2,sections:[{}],externalEligible:true}])
 assert.equal((await knowledgeReadiness(invalid)).ready,false)
})
test('ready status counts real sections, preserves warning and refreshes on revision change',async()=>{
 const meta={revision:8,restoreStatus:'ready',missingExtractionCount:1},docs=[{indexVersion:3,sections:[{},{}],externalEligible:true},{indexVersion:3,sections:[],externalEligible:false}],db=dbFixture(meta,docs)
 const [first,parallel]=await Promise.all([knowledgeReadiness(db),knowledgeReadiness(db)]);assert.deepEqual(first,parallel);assert.equal(db.reads(),1);assert.equal(first.ready,true);assert.equal(first.records,2);assert.equal(first.sections,2);assert.equal(first.externalEligible,1);assert.equal(first.warnings,1);assert.equal(first.countsKnown,true)
 await knowledgeReadiness(db);assert.equal(db.reads(),1)
 meta.restoreStatus='restoring';assert.equal((await knowledgeReadiness(db)).ready,false)
 meta.restoreStatus='ready';meta.revision++;docs[0].sections.push({});assert.equal((await knowledgeReadiness(db)).sections,3)
})
function snapshot(t){const root=mkdtempSync(join(tmpdir(),'inspire-export-fixture-'));t.after(()=>{assert.ok(resolve(root).startsWith(resolve(tmpdir(),'inspire-export-fixture-')));rmSync(root,{recursive:true,force:true})});const id='12345678-1234-1234-1234-123456789abc',dir=join(root,'snapshots',id);mkdirSync(join(dir,'firestore_export'),{recursive:true});mkdirSync(join(dir,'auth_export'));writeFileSync(join(dir,'firebase-export-metadata.json'),JSON.stringify({version:'OFFLINE',firestore:{path:'firestore_export'},auth:{path:'auth_export'}}));writeFileSync(join(dir,'firestore_export','synthetic'), 'OFFLINE CORPUS AND QUOTA ONLY');writeFileSync(join(dir,'auth_export','accounts.json'),'[]');const state={schema:'inspire-emulator-state-v1',status:'clean',snapshotId:id,files:snapshotFiles(dir)};writeFileSync(join(root,'state.json'),JSON.stringify(state));return {root,dir,state}}
test('native Auth/Firestore export scope is accepted; modified/unclean snapshots fail closed',t=>{
 const f=snapshot(t);assert.equal(verifiedImport(f.root),f.dir)
 f.state.status='running';writeFileSync(join(f.root,'state.json'),JSON.stringify(f.state));assert.throws(()=>verifiedImport(f.root),/UNCLEAN/)
 f.state.status='clean';writeFileSync(join(f.root,'state.json'),JSON.stringify(f.state));writeFileSync(join(f.dir,'firestore_export','synthetic'),'ALTERED');assert.throws(()=>verifiedImport(f.root),/INTEGRITY/)
})
test('snapshot cannot include grants, budget files or escape its private snapshot directory',t=>{
 const f=snapshot(t);writeFileSync(join(f.dir,'authorization.json'),'OFFLINE_FORGED_APPROVAL');assert.throws(()=>snapshotFiles(f.dir),/UNEXPECTED_SNAPSHOT_FILE/)
 f.state.snapshotId='../outside';writeFileSync(join(f.root,'state.json'),JSON.stringify(f.state));assert.throws(()=>verifiedImport(f.root),/SNAPSHOT_ID/)
 assert.equal(readFileSync(join(f.dir,'authorization.json'),'utf8'),'OFFLINE_FORGED_APPROVAL')
})
test('Windows export-copy fallback preserves exact native bytes and refuses incomplete or existing targets',t=>{
 const f=snapshot(t),copy=join(f.root,'copied-export')
 assert.deepEqual(copyCompletedNativeExport(f.dir,copy),snapshotFiles(f.dir))
 assert.deepEqual(snapshotFiles(copy),snapshotFiles(f.dir))
 assert.throws(()=>copyCompletedNativeExport(f.dir,copy),/DESTINATION_NOT_EMPTY/)
 writeFileSync(join(f.dir,'firebase-export-metadata.json'),'{}')
 assert.throws(()=>copyCompletedNativeExport(f.dir,join(f.root,'incomplete-copy')),/INCOMPLETE/)
})
test('live conversation rejects missing index before UID claim, quota, token counting or model dispatch',async t=>{
 process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';requireLocalEmulators()
 const old=process.env.INSPIRE_PRIVATE_CONVERSATION;process.env.INSPIRE_PRIVATE_CONVERSATION='1'
 t.after(()=>{if(old===undefined)delete process.env.INSPIRE_PRIVATE_CONVERSATION;else process.env.INSPIRE_PRIVATE_CONVERSATION=old})
 const require=createRequire(new URL('../functions/package.json',import.meta.url)),sdk=require('firebase-admin/firestore')
 t.mock.method(sdk.DocumentReference.prototype,'get',async function(){assert.equal(this.path,'inspireKnowledge/_index');return {exists:false,data:()=>undefined}})
 let claims=0,counts=0,sends=0
 const service=createPrivateLunaService({conversation:{permit(){claims++;throw Error('NOT_ALLOWED')},status:()=>({released:true})},controller:{preflight:async()=>{},validate:async()=>{},evidence:()=>[]},countInput:async()=>{counts++;return 1},send:async()=>{sends++;throw Error('MUST_NOT_GENERATE')}})
 await assert.rejects(service.handlePrivate({kind:'conversation',request:{kind:'send',epoch:'offline',sessionId:'offline',conversationId:'offline',operationId:'offline',messages:[{id:'u1',role:'user',text:'Dữ liệu giả kiểm tra thiếu index.'}]}},{uid:'synthetic',registered:false,email:null,providers:[],createdAt:new Date().toISOString()},'local'),{code:'KNOWLEDGE_NOT_READY',retry:'none'})
 assert.equal(claims,0);assert.equal(counts,0);assert.equal(sends,0)
 await sdk.getFirestore().terminate()
})
