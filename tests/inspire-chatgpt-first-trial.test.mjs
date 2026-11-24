// Test-only releases exist in disposable temp folders, never the owner store.
import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {spawnSync} from 'node:child_process'
import {firstChatgptTrial,firstChatgptProposal} from '../functions/src/inspireChatgptFirstTrial.ts'
const temp=()=>mkdtempSync(join(tmpdir(),'inspire-first-trial-fixture-'))
const fakeController={preflight:async()=>{},validate:async()=>{},evidence:()=>[]}
const reply=p=>Promise.resolve({operationId:p.operationId,binding:p.binding,payloadSHA:p.payloadSHA,model:p.model,text:'Bạn có thể liệt kê các việc, rồi chọn một việc nhỏ để bắt đầu.'})
function fixture(root,options={}){return firstChatgptTrial(root,{controller:fakeController,recheck:async()=>{},offlineSender:reply,...options})}
function authorizeFixture(root){const file=join(root,'authorization.json'),a=JSON.parse(readFileSync(file));writeFileSync(file,JSON.stringify({...a,approved:true}))}

test('frozen source-free content, identity and pending authorization survive reopen byte-for-byte',()=>{
 const root=temp(),a=fixture(root).freeze(),bytes=readFileSync(join(root,'proposal.json'))
 assert.deepEqual(firstChatgptTrial(root).freeze(),a);assert.deepEqual(readFileSync(join(root,'proposal.json')),bytes)
 assert.equal(a.authorization.approved,false);assert.equal(a.authorization.maxAttempts,1)
 assert.equal(a.proposal.controls.billing,'owner-confirmed-2026-11-24')
 assert.equal(a.proposal.dispatchReady,false);assert.ok(a.proposal.unresolvedRPCFields.includes('threadId'))
 const input=JSON.parse(a.proposal.prepared.text)
 assert.deepEqual(input.supportingKnowledge,[]);assert.equal(input.messages.length,1)
 assert.equal(input.messages[0].id,'synthetic-first-question')
 assert.equal(input.messages[0].text,'Tình huống giả định: Tôi có một ngày nhiều việc. Giúp tôi chọn việc nên làm trước.')
 assert.deepEqual(a.proposal,firstChatgptProposal())
})
test('pending grant, changed request/payload/limits or source injection cannot reach transport',async()=>{
 const root=temp();let calls=0;const run=fixture(root,{offlineSender:async p=>{calls++;return reply(p)}}),{proposal}=run.freeze()
 await assert.rejects(run.execute(proposal));assert.equal(existsSync(join(root,'first-attempt.json')),false)
 authorizeFixture(root)
 for(const mutate of [p=>p.request.messages[0].id='new',p=>p.request.messages[0].text='changed',p=>p.prepared.text+=' ',p=>p.outbound.model='other',p=>p.controls.maxAttempts=3,p=>p.outbound.input[0].text='private source']){
  const bad=structuredClone(proposal);mutate(bad);await assert.rejects(run.execute(bad),/BINDING/)
 }
 const file=join(root,'authorization.json'),auth=JSON.parse(readFileSync(file));writeFileSync(file,JSON.stringify({...auth,maxAttempts:3}));await assert.rejects(run.execute(proposal),/BINDING/)
 assert.equal(calls,0);assert.equal(existsSync(join(root,'first-attempt.json')),false)
})
test('even a test grant cannot enable the default live path; production refuses preparation',async()=>{
 const root=temp(),run=firstChatgptTrial(root),{proposal}=run.freeze();authorizeFixture(root)
 await assert.rejects(run.execute(proposal),/TECHNICAL_HOLD/);assert.equal(existsSync(join(root,'first-attempt.json')),false)
 const old=process.env.NODE_ENV;process.env.NODE_ENV='production'
 try{assert.throws(()=>fixture(root).freeze(),/STORAGE_HOLD/)}finally{if(old===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=old}
})
test('one attempt under concurrent execution, success replay and process reopen; native Controller binds exact output',async()=>{
 const root=temp();let calls=0
 const run=firstChatgptTrial(root,{recheck:async sections=>assert.deepEqual(sections,[]),offlineSender:async p=>{calls++;return reply(p)}}),{proposal}=run.freeze();authorizeFixture(root)
 const results=await Promise.allSettled([run.execute(proposal),run.execute(proposal)])
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1,JSON.stringify(results));assert.equal(calls,1)
 await assert.rejects(fixture(root).execute(proposal),/EEXIST/)
 const proof=run.evidence();assert.equal(proof.length,2);assert.equal(proof[1].user_delivery,false);assert.equal(proof[1].actual_execution_eligible,false)
 const out='docs/evidence/luna-first-trial-2026-11-24';mkdirSync(out,{recursive:true});writeFileSync(out+'/controller-trace.json',JSON.stringify({syntheticOnly:true,liveCalls:0,fingerprint:proposal.fingerprint,proof,receipt:JSON.parse(readFileSync(join(root,'receipt.json')))},null,2))
})
test('transport failure and process crash consume the sole attempt without replacement',async()=>{
 const root=temp();let calls=0;const run=fixture(root,{offlineSender:async()=>{calls++;throw Error('unknown result')}}),{proposal}=run.freeze();authorizeFixture(root)
 await assert.rejects(run.execute(proposal),/unknown result/);await assert.rejects(fixture(root).execute(proposal),/EEXIST/);assert.equal(calls,1)
 const crashRoot=temp();fixture(crashRoot).freeze();authorizeFixture(crashRoot)
 const code=`import {firstChatgptTrial,firstChatgptProposal} from './functions/src/inspireChatgptFirstTrial.ts';await firstChatgptTrial(${JSON.stringify(crashRoot)},{controller:{preflight:async()=>{},validate:async()=>{},evidence:()=>[]},recheck:async()=>{},offlineSender:async()=>process.exit(19)}).execute(firstChatgptProposal())`
 const child=spawnSync(process.execPath,['--import','./tests/register-ts.mjs','--input-type=module','-e',code],{encoding:'utf8',windowsHide:true})
 assert.equal(child.status,19,child.stderr);await assert.rejects(fixture(crashRoot).execute(firstChatgptProposal()),/EEXIST/)
})
test('corrupt persisted proposal is never repaired or silently regenerated',()=>{
 const root=temp();fixture(root).freeze();writeFileSync(join(root,'proposal.json'),'{')
 assert.throws(()=>fixture(root).freeze());assert.equal(readFileSync(join(root,'proposal.json'),'utf8'),'{')
})
