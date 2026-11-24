// Offline-only checks. Does not run the preparation script or release a grant.
import {spawnSync} from 'node:child_process'
import {writeFileSync,mkdirSync} from 'node:fs'
import {dirname,join} from 'node:path'
const out='docs/evidence/luna-first-trial-2026-11-24';mkdirSync(out,{recursive:true})
const npm=join(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js')
const tasks={
 tests:['--import','./tests/register-ts.mjs','--test','tests/inspire-chatgpt-first-trial.test.mjs'],
 boundary:['--import','./tests/register-ts.mjs','--test','tests/inspire-luna.test.mjs'],
 lint:['functions/lint.cjs','src/inspireChatgptFirstTrial.ts'],
 'backend-build':[npm,'--prefix','functions','run','build'],
 'website-build':[npm,'run','build']}
const results={}
for(const [name,args] of Object.entries(tasks)){
 const r=spawnSync(process.execPath,args,{encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:8*1024*1024})
 writeFileSync(out+'/'+name+'.txt',(r.stdout??'')+(r.stderr??'')+'\nEXIT_CODE='+r.status+'\n')
 results[name]={exitCode:r.status,error:r.error?.code??null};console.log(name+': '+r.status)
 writeFileSync(out+'/executed-checks.json',JSON.stringify({results,liveCalls:0,initialSandboxRun:{passed:5,total:6,failed:'Native Controller concurrent-success assertion; no successful return after roughly 20 seconds. Exact underlying cause not established.'}},null,2))
}
process.exitCode=Object.values(results).every(r=>r.exitCode===0)?0:1
