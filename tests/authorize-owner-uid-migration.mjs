// Records the owner's existing one-time UID migration decision; no new budget.
import assert from 'node:assert/strict'
import {readFileSync,writeFileSync,existsSync} from 'node:fs'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
const root=join(process.env.LOCALAPPDATA,'INSPIRE-Luna/private-session')
const p=JSON.parse(readFileSync(join(root,'policy.json')))
assert.equal(p.sessionId,'father-2026-11-26');assert.equal(p.purpose,'father');assert.equal(p.maxAttempts,10);assert.equal(p.maxCostNanoUSD,50000000);assert.equal(p.expiresAt,null)
const uid=JSON.parse(readFileSync(join(root,p.sessionId,'identity.json'))).uid
const bytes=readFileSync(join(root,p.sessionId,'events.jsonl'),'utf8')
const file=join(root,'uid-migration.json')
if(!existsSync(file))writeFileSync(file,JSON.stringify({schema:'inspire-owner-uid-migration-v1',approved:true,sessionId:p.sessionId,fromUID:uid,toUID:null,phase:'pending',ledgerSHA:createHash('sha256').update(bytes).digest('hex'),ownerDecision:'Owner 2026-11-28: Liên kết UID hiện tại của giao diện vào phiên thử cũ một lần; giữ nguyên ledger, số lượt đã dùng và ngân sách còn lại. Select verified Firebase SDK UID only on the owner Send action.'},null,2),{flag:'wx',mode:0o600})
const saved=JSON.parse(readFileSync(file));assert.equal(saved.sessionId,p.sessionId)
console.log(JSON.stringify({migrationAuthorized:true,oneTime:true,phase:saved.phase,maxAttempts:p.maxAttempts,budgetUSD:p.maxCostNanoUSD/1e9,noExtraAllowance:true}))
