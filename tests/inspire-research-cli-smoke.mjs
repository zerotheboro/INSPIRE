// Actual operator CLI, Windows private storage and native Controller. No network.
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {resolve} from 'node:path'
import {randomUUID} from 'node:crypto'
import {mkdirSync,writeFileSync} from 'node:fs'
const python=process.env.INSPIRE_CONTROLLER_PYTHON||resolve('.tools.local/python312/python.exe')
const storage='offline-demo-'+randomUUID(),trial='cli-synthetic',draft='cli-owner-draft'
const steps=[]
function cli(command,args=[],input='',trialId=trial,expected=0){
  const r=spawnSync(python,['-X','utf8','functions/inspire_research_cli.py',command,'--storage-name',storage,'--trial',trialId,...args],{
    encoding:'utf8',input,maxBuffer:2*1024*1024,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}})
  assert.equal(r.status,expected,`${command}: ${r.stderr}`)
  const value=JSON.parse(expected===0?r.stdout:r.stderr)
  steps.push({command,trial:trialId,exitCode:r.status,status:value.status||value.held||value.purpose||null})
  return value
}
cli('init-offline')
cli('init-draft',[],'',draft)
const sources=cli('source-disclosure',[],'',draft)
assert.equal(sources.sources.length,9)
assert.equal(sources.authorized,false)
assert.ok(sources.sources.every(s=>!s.internal_authorized&&!s.export_authorized))
const disclosure=cli('approval-disclosure',['--conversation','C1'],'',draft)
assert.equal(disclosure.authorized,false)
cli('execute',['--conversation','C1','--preview-hash',disclosure.body_sha256],'',draft,2)
const preview=cli('preview',['--conversation','C1'])
const result=cli('execute',['--conversation','C1','--preview-hash',preview.body_sha256,'--operation','cli-op-1'])
const replay=cli('replay',['--operation','cli-op-1'])
assert.equal(result.sha256,replay.sha256)
assert.equal(replay.user_delivery,false)
assert.ok(result.proof.checks_executed.includes('Non-MOCK ScopeGuard'))
const review={accept:true,scores:{naturalness:4,relevance:4,continuity:4,preferences:4},
  flags:{invented_facts:false,invented_sources:false,unsafe:false,authority_claim:false,privacy_leak:false},expected_sha256:result.sha256}
for(const reviewer of ['offline-reviewer-a','offline-reviewer-b'])cli('review',['--operation','cli-op-1','--reviewer',reviewer,'--review-json','-'],JSON.stringify(review))
const final=cli('status')
assert.equal(final.attempts,1)
assert.equal(final.reserved_microUSD,160000)
assert.equal(final.inflight,null)
assert.equal(final.live_enabled,false)
assert.ok(Object.values(final.real_source_permissions).every(s=>!s.internal&&!s.export))
const out=process.env.INSPIRE_REVIEW_EVIDENCE_DIR||'docs/evidence/research-implementation'
mkdirSync(out,{recursive:true})
writeFileSync(out+'/cli-smoke-trace.json',JSON.stringify({
  executedAt:new Date().toISOString(),steps,storageLeaf:storage,
  storage:'DPAPI and owner-only Windows ACL under LocalAppData; no output data in workspace',
  ownerDisclosedSourceHashes:sources.sources.map(s=>({id:s.decision_id,source_sha256:s.source_sha256,section_sha256:s.section_sha256,internal:false,export:false})),
  firstActualSourceDisclosureBodySHA:disclosure.body_sha256,offlineRequestSHA:preview.body_sha256,
  nativeChecks:result.proof.checks_executed,quarantineOutputSHA:result.sha256,
  attempts:final.attempts,reserved_microUSD:final.reserved_microUSD,
  paidCalls:0,websiteDelivery:false,actualSourcesExported:false,quality:'Fixture scores test workflow only; no language-quality evidence'
},null,2))
console.log('PASS CLI draft denial → offline preview → native validation → encrypted quarantine → replay → two fixture reviews; one reserved attempt; no source grants or network')
