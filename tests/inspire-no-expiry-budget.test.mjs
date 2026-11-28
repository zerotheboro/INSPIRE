import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {lunaSessionBudget} from '../functions/src/inspireLunaBudget.ts'
import {lunaHash,LUNA_API} from '../functions/src/inspireLunaApi.ts'
test('non-expiring father authority preserves consumed and unknown reservations through restart',t=>{
 const dir=mkdtempSync(join(tmpdir(),'inspire-budget-expiry-'));t.after(()=>rmSync(dir,{recursive:true,force:true}))
 const p={schema:'inspire-private-budget-v1',sessionId:'synthetic-session',approved:true,purpose:'father',uid:'synthetic-uid',maxAttempts:10,maxCostNanoUSD:50000000,expiresAt:null,messagesSHA:null,ownerDecision:'SYNTHETIC owner no calendar expiry',model:LUNA_API.model}
 writeFileSync(join(dir,'policy.json'),JSON.stringify(p));mkdirSync(join(dir,p.sessionId))
 const events=[{type:'reserve',operationId:'completed',binding:'synthetic',hold:6465500},{type:'validated',operationId:'completed',binding:'synthetic'},{type:'reserve',operationId:'uncertain',binding:'synthetic',hold:7000000},{type:'dispatch',operationId:'uncertain',binding:'synthetic'},{type:'held',operationId:'uncertain',binding:'synthetic',code:'OUTCOME_UNKNOWN'}]
 let previous='0';const bytes=events.map(event=>{const sha=lunaHash(JSON.stringify([previous,event]));previous=sha;return JSON.stringify({event,sha})}).join('\n')+'\n'
 const file=join(dir,p.sessionId,'events.jsonl');writeFileSync(file,bytes)
 for(const now of ['2026-11-28','2026-12-01']){const state=lunaSessionBudget(dir,()=>Date.parse(now)).status(p.uid);assert.equal(state.released,true);assert.equal(state.reservedAttempts,2);assert.equal(state.heldNanoUSD,13465500);assert.equal(state.lastHeld.code,'OUTCOME_UNKNOWN')}
 assert.equal(readFileSync(file,'utf8'),bytes)
 assert.equal(lunaSessionBudget(dir,()=>Date.parse('2026-11-28')).status('other-user').released,false)
 // Pricing freshness remains independent of the owner's non-expiring grant.
 assert.equal(lunaSessionBudget(dir,()=>Date.parse('2026-12-03')).status(p.uid).released,false)
 p.purpose='verification';writeFileSync(join(dir,'policy.json'),JSON.stringify(p))
 assert.equal(lunaSessionBudget(dir,()=>Date.parse('2026-11-28')).status(p.uid).released,false)
})
