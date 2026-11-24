import assert from 'node:assert/strict'
import {readdirSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {join} from 'node:path'
const walk=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(join(dir,entry.name)):[join(dir,entry.name)])
const forbidden=['PRIVATE_KNOWLEDGE_REVIEW_CANARY','PRIVATE_PROFILE_REVIEW_CANARY',
  'INSPIRE-CONTENT-PATCH-20261109-v0.1','mock_engine.pec_mock',
  'Never infer P1/P2/P3, diagnoses or intervention permission',
  'demo-inspire-local-only','127.0.0.1:9099','inspire-known-account',
  'Trích nguồn làm việc MOI-01 v1.0','NETWORK_DISABLED_SCOPE_A_BRIDGE',
  '931985119075683652b770b93f1f08c889b1acc3e74fa5dd6dcbd5caf22f8ef3']
const files=walk('dist'),hits=[]
for(const file of files){const data=readFileSync(file);for(const marker of forbidden)if(data.includes(Buffer.from(marker)))hits.push({file,marker})}
const out=process.env.INSPIRE_REVIEW_EVIDENCE_DIR||'docs/evidence/inspire-review'
mkdirSync(out,{recursive:true})
writeFileSync(join(out,'public-build-audit.json'),JSON.stringify({executed:true,
  scope:'All generated dist files, including static assets; synthetic private profile/knowledge canaries, restricted source identifiers and emulator-only auth markers.',
  scannedFiles:files.length,forbiddenMarkers:forbidden,hits,
  limitation:'Finite canary/identifier scan plus production browser/config checks. Not a proof against every possible transformed secret; no real user profile or private corpus is packaged.',
},null,2))
assert.deepEqual(hits,[])
console.log(`PASS: ${files.length} production files contain none of ${forbidden.length} private/source/emulator-auth markers.`)
