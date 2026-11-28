// Disposable synthetic grants only; never writes the operator's grant.
import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,writeFileSync,readFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
import {evaluationAllowance} from '../functions/src/inspireEvaluationAllowance.ts'
import {prepareLunaInput} from '../functions/src/inspireLuna.ts'
import {emptyPreferences} from '../functions/src/inspireAccount.ts'
const sha=s=>createHash('sha256').update(s).digest('hex')
const owner='synthetic-father-owner'
const grant={schema:'inspire-private-evaluation-v1',sessionScope:'father-50-questions-v1',ownerHash:sha(owner),approved:true,maxAttempts:50,expiresAt:10000,route:'codex-app-server',model:'gpt-6-luna',syntheticOnly:true,publicDelivery:false,sourcePermissionSeparate:true}
function fixture(g=grant){const root=mkdtempSync(join(tmpdir(),'inspire-eval-'));writeFileSync(join(root,'evaluation-grant.json'),JSON.stringify(g));return {root,a:evaluationAllowance(root,()=>100)}}
function proposal(i){const request={kind:'send',epoch:'e',sessionId:'s',conversationId:'c',operationId:'o'+i,messages:[{id:'u'+i,role:'user',text:'Tình huống giả định.'}]};const p=prepareLunaInput({messages:request.messages,userStatedPreferences:emptyPreferences,operatingInstructions:[],supportingKnowledge:[]},request);return {request,p:{...p,binding:sha(JSON.stringify([request,p.payloadSHA]))}}}
test('default/pending, wrong owner, wrong scope, expiry and forged fields fail closed',()=>{
 for(const delta of [{approved:false},{ownerHash:sha('other')},{expiresAt:99},{sessionScope:'old-three-attempt-grant'},{maxAttempts:51},{apiKey:'forged'}]){
  const {a}=fixture({...grant,...delta});assert.throws(()=>a.assertOwner(owner))
 }
 const root=mkdtempSync(join(tmpdir(),'inspire-eval-none-'));assert.throws(()=>evaluationAllowance(root).assertOwner(owner))
})
test('fifty bound attempts survive reopening; exhaustion and replay cannot multiply allowance',()=>{
 const {root}=fixture()
 for(let i=1;i<=50;i++){
  const {request,p}=proposal(i),a=evaluationAllowance(root,()=>100)
  const slot=a.ledger.consume(owner,request,p);a.ledger.receipt(slot,p,sha('synthetic output'))
 }
 const last=evaluationAllowance(root,()=>100);assert.equal(last.ledger.status().used,50)
 const q=proposal(51);assert.throws(()=>last.ledger.consume(owner,q.request,q.p),/EXHAUSTED/)
 const first=proposal(1);assert.throws(()=>last.ledger.consume(owner,first.request,first.p),/UNRESOLVED/)
 assert.equal(last.ledger.status().used,50)
})
test('unknown crash reservation blocks replacement after restart; grant revocation stops admission',()=>{
 const {root,a}=fixture(),q=proposal(1);a.ledger.consume(owner,q.request,q.p)
 const replacement=proposal(2);assert.throws(()=>evaluationAllowance(root,()=>100).ledger.consume(owner,replacement.request,replacement.p),/UNRESOLVED/)
 assert.equal(a.ledger.status().recoveryHold,true)
 writeFileSync(join(root,'evaluation-grant.json'),JSON.stringify({...grant,approved:false}))
 assert.throws(()=>evaluationAllowance(root,()=>100).assertOwner(owner))
 assert.ok(readFileSync(join(root,'attempt-1.json'),'utf8').includes('unknown'))
})
