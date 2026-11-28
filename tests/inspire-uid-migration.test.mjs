// Real demo Firestore, synthetic identities/budget only. No dotenv/model calls.
import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {randomUUID} from 'node:crypto'
import {createRequire} from 'node:module'
import {requireLocalEmulators} from '../functions/src/inspireLocalService.ts'
import {lunaSessionBudget} from '../functions/src/inspireLunaBudget.ts'
import {lunaHash,LUNA_API} from '../functions/src/inspireLunaApi.ts'
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';requireLocalEmulators()
const sdk=createRequire(new URL('../functions/package.json',import.meta.url)),db=sdk('firebase-admin/firestore').getFirestore()
test('one owner UID migration conserves quota, unknown holds, ledger and budget; crash resume is idempotent',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'inspire-uid-')),session='synthetic-'+randomUUID(),old='old-'+randomUUID(),next='new-'+randomUUID()
 const marker=db.doc('inspireUIDMigrations/'+lunaHash(session+':'+old))
 t.after(async()=>{for(const uid of [old,next]){await db.recursiveDelete(db.doc('inspireAccounts/'+uid));await db.doc('inspireIdentityLinks/'+uid).delete();for(const d of(await db.collection('inspireOperations').where('uid','==',uid).get()).docs)await d.ref.delete()}await marker.delete();rmSync(dir,{recursive:true,force:true});await db.terminate()})
 const p={schema:'inspire-private-budget-v1',sessionId:session,approved:true,purpose:'father',uid:null,maxAttempts:10,maxCostNanoUSD:50000000,expiresAt:null,messagesSHA:null,ownerDecision:'SYNTHETIC ONLY',model:LUNA_API.model}
 mkdirSync(join(dir,session));writeFileSync(join(dir,'policy.json'),JSON.stringify(p));writeFileSync(join(dir,session,'identity.json'),JSON.stringify({uid:old}))
 let previous='0';const events=[{type:'reserve',operationId:'one',binding:'synthetic',hold:6465500},{type:'validated',operationId:'one',binding:'synthetic'},{type:'reserve',operationId:'unknown',binding:'unknown',hold:7000000}]
 const bytes=events.map(event=>{const sha=lunaHash(JSON.stringify([previous,event]));previous=sha;return JSON.stringify({event,sha})}).join('\n')+'\n'
 writeFileSync(join(dir,session,'events.jsonl'),bytes)
 const m={schema:'inspire-owner-uid-migration-v1',approved:true,sessionId:session,fromUID:old,toUID:null,phase:'pending',ownerDecision:'SYNTHETIC ONLY',ledgerSHA:lunaHash(bytes)}
 writeFileSync(join(dir,'uid-migration.json'),JSON.stringify(m))
 await db.doc('inspireAccounts/'+old+'/usage/guest').set({period:'guest',completed:1,reserved:1})
 await db.doc('inspireAccounts/'+next+'/usage/guest').set({period:'guest',completed:2,reserved:0})
 const budget=lunaSessionBudget(dir)
 assert.equal(budget.status(next).pendingMigration,true)
 await budget.migrateIdentity(next)
 assert.equal(budget.status(next).reservedAttempts,2);assert.equal(budget.status(next).heldNanoUSD,13465500)
 assert.deepEqual((await db.doc('inspireAccounts/'+next+'/usage/guest').get()).data(),{period:'guest',completed:3,reserved:1})
 assert.equal((await db.doc('inspireOperations/'+lunaHash(next+':unknown')).get()).data().status,'unknown')
 assert.throws(()=>budget.permit(old),{code:'SESSION_IDENTITY'});assert.throws(()=>budget.permit('third-user'),{code:'SESSION_IDENTITY'})
 // Simulate crash after transactional quota commit, before local binding commit.
 writeFileSync(join(dir,session,'identity.json'),JSON.stringify({uid:old}));writeFileSync(join(dir,'uid-migration.json'),JSON.stringify({...m,toUID:next,phase:'selected'}))
 await lunaSessionBudget(dir).migrateIdentity(next)
 assert.equal((await db.doc('inspireAccounts/'+next+'/usage/guest').get()).data().completed,3)
 assert.equal(readFileSync(join(dir,session,'events.jsonl'),'utf8'),bytes)
 assert.deepEqual(JSON.parse(readFileSync(join(dir,'policy.json'))),p)
 assert.equal(JSON.parse(readFileSync(join(dir,'uid-migration.json'))).phase,'complete')
})
