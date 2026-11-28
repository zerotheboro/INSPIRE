// Apply the owner's 2026-11-28 calendar-expiry decision to the EXISTING grant.
import assert from 'node:assert/strict'
import {readFileSync,writeFileSync,existsSync,renameSync} from 'node:fs'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
const dir=join(process.env.LOCALAPPDATA,'INSPIRE-Luna/private-session'),file=join(dir,'policy.json')
const bytes=readFileSync(file),p=JSON.parse(bytes)
assert.equal(p.approved,true);assert.equal(p.purpose,'father');assert.equal(p.sessionId,'father-2026-11-26');assert.equal(p.maxAttempts,10);assert.equal(p.maxCostNanoUSD,50000000)
const paths=['father-2026-11-26/events.jsonl','father-2026-11-26/identity.json','verify-2026-11-26/events.jsonl']
const sha=p=>createHash('sha256').update(readFileSync(join(dir,p))).digest('hex')
const before=paths.map(sha)
if(p.expiresAt!==null){
 assert.equal(p.expiresAt,'2026-11-27T06:57:20.798Z')
 const backup=join(dir,'policy-before-no-expiry-20261128.json')
 if(!existsSync(backup))writeFileSync(backup,bytes,{flag:'wx',mode:0o600})
 p.expiresAt=null
 p.ownerDecision+=' Owner 2026-11-28: quyền thử localhost không hết hạn theo ngày/giờ; giữ nguyên mức ngân sách/lượt và số đã tiêu thụ.'
 const pending=file+'.no-expiry.pending';writeFileSync(pending,JSON.stringify(p,null,2),{flag:'wx',mode:0o600});renameSync(pending,file)
}
assert.deepEqual(paths.map(sha),before)
console.log(JSON.stringify({applied:true,expiresAt:null,maxAttempts:p.maxAttempts,maxCostUSD:p.maxCostNanoUSD/1e9,sessionIdUnchanged:true,ledgersAndIdentityUnchanged:true}))
