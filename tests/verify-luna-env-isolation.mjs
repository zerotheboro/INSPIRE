// Backend-only verification. Secret values stay in memory; output is metadata.
// No execute endpoint, model request, authorization writer or key-file fallback.
import assert from 'node:assert/strict'
import {readFileSync,readdirSync,writeFileSync,mkdirSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {spawnSync} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {fatherApiEnvironment} from './start-father-api.mjs'
const out='docs/evidence/api-env-2026-11-25',base='http://127.0.0.1:5173'
mkdirSync(out,{recursive:true})
const key=fatherApiEnvironment().OPENAI_API_KEY,keyConfigured=Boolean(key)
const git=spawnSync('git',['ls-files','--error-unmatch','--','functions/.env.local'],{encoding:'utf8',windowsHide:true})
assert.notEqual(git.status,0,'ENV_LOCAL_IS_TRACKED')
const ignored=spawnSync('git',['check-ignore','--quiet','--','functions/.env.local'],{windowsHide:true})
assert.equal(ignored.status,0,'ENV_LOCAL_NOT_IGNORED')
const walk=d=>readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(d,e.name)):[join(d,e.name)])
const hits=[],files=walk('dist'),canary='sk-offline_fixture_ENV_BUILD_CANARY_20261125'
for(const file of files){const bytes=readFileSync(file);if([key,canary].filter(Boolean).some(value=>bytes.includes(Buffer.from(value))))hits.push(file)}
assert.equal(hits.length,0,'CONFIGURATION_FOUND_IN_PUBLIC_BUILD')
const status=await fetch(base+'/api/inspire-private-status').then(r=>r.json())
assert.equal(status.modelAvailable,false);assert.equal(status.lunaApiPreview,true);assert.equal(status.chatgptPreview,false)
const routes={}
for(const path of ['/functions/.env.local','/functions/.env.local?raw','/functions/.env','/.env.local','/functions%2f.env.local','/@fs/'+resolve('functions/.env.local').replaceAll('\\','/')]){
 const r=await fetch(base+path);await r.body?.cancel();routes[path]=r.status;assert.equal(r.status,403,'PRIVATE_ENV_HTTP_HOLD')
}
const auth=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-only',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"returnSecureToken":true}'}).then(r=>r.json())
assert.equal(typeof auth.idToken,'string','DEMO_AUTH_REQUIRED')
const post=async body=>{const r=await fetch(base+'/api/inspire-luna',{method:'POST',headers:{'Content-Type':'application/json',Origin:base,Authorization:'Bearer '+auth.idToken},body:JSON.stringify(body)});assert.equal(r.status,200,'LOCAL_PREVIEW_HOLD');return r.json()}
const session=await post({kind:'session'})
const preview=await post({kind:'preview',request:{kind:'send',epoch:session.epoch,sessionId:session.sessionId,operationId:randomUUID(),conversationId:randomUUID(),messages:[{id:'config-only',role:'user',text:'zconfigprobe'+randomUUID().replaceAll('-','')}]}})
assert.equal(preview.keyConfigured,keyConfigured,'RESTART_CONFIG_MISMATCH');assert.equal(preview.payload,undefined);assert.equal(preview.instructions,undefined)
if(key)assert.ok(!JSON.stringify(preview).includes(key),'CONFIGURATION_FOUND_IN_RECEIPT')
const report={executed:true,keyConfigured,gitIgnored:true,gitTracked:false,publicBuildFiles:files.length,configurationHits:hits,envHTTP:routes,adapterInitializedWithSelectedConfiguration:true,clientReceiptContainsConfiguration:false,generation:'UNARMED',chatgptFallback:false,legacyFileFallback:false,inferenceCalls:0,grantsModified:false}
writeFileSync(out+'/isolation.json',JSON.stringify(report,null,2));console.log(JSON.stringify({keyConfigured,configurationIsolation:'PASS',inferenceCalls:0}))
