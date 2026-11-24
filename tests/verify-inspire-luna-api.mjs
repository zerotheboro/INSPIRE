import {spawnSync} from 'node:child_process'
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs'
import {resolve,join,dirname,basename} from 'node:path'
const out='docs/evidence/luna-api-2026-11-14';mkdirSync(out,{recursive:true})
const node=process.execPath,npm=join(dirname(node),'node_modules/npm/bin/npm-cli.js')
const tasks={
 // These files share the emulator's index revision. Their own concurrency
 // regressions still run parallel requests; file-level work is serialized.
 core:[node,['--import','./tests/register-ts.mjs','--test','--test-concurrency=1','tests/inspire-luna-api.test.mjs','tests/inspire-chat.test.mjs','tests/inspire-luna.test.mjs','tests/inspire-emulator.test.mjs']],
 consolidation:[node,['--import','./tests/register-ts.mjs','--test','tests/inspire-consolidation.test.mjs']],
 research:[resolve('.tools.local/python312/python.exe'),['-X','utf8','tests/inspire-research.test.py']],
 lint:[node,[npm,'--prefix','functions','run','lint:chat']],
 'functions-build':[node,[npm,'--prefix','functions','run','build']],
 'website-build':[node,[npm,'run','build']],
 privacy:[node,['tests/inspire-build-audit.mjs']],
 import:[node,['--import','./tests/register-ts.mjs','tests/import-inspire-knowledge.mjs','--controller-originals']],
 http:[node,['tests/inspire-luna-http.mjs']],
 'production-http':[node,['tests/inspire-luna-production.mjs']],
}
const preserve=['docs/evidence/research-implementation/offline-trace.json','docs/evidence/inspire-review/adapter-input-trace.json']
const results=existsSync(out+'/executed-checks.json')?JSON.parse(readFileSync(out+'/executed-checks.json')).results:{}
const names=process.argv.slice(2).length?process.argv.slice(2):Object.keys(tasks)
for(const name of names){
 if(!tasks[name])throw Error('Unknown check')
 const snapshots=preserve.filter(existsSync).map(file=>[file,readFileSync(file)])
 const [exe,args]=tasks[name],start=Date.now()
 const result=spawnSync(exe,args,{encoding:'utf8',maxBuffer:32*1024*1024,windowsHide:true,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',METADATA_SERVER_DETECTION:'none',INSPIRE_REVIEW_EVIDENCE_DIR:out}})
 for(const [file,bytes] of snapshots){if(name==='research'||name==='consolidation')writeFileSync(out+'/'+name+'-'+basename(file),readFileSync(file));writeFileSync(file,bytes)}
 writeFileSync(out+'/'+name+'.txt',(result.stdout??'')+(result.stderr??'')+'\nEXIT_CODE='+result.status+'\n')
 results[name]={executed:true,passed:result.status===0,exitCode:result.status,durationMs:Date.now()-start,at:new Date().toISOString(),command:[exe,...args]}
 writeFileSync(out+'/'+name+'-result.json',JSON.stringify(results[name],null,2))
 writeFileSync(out+'/executed-checks.json',JSON.stringify({results,realProviderRequests:0,ownerAuthorizationCreated:false,modelQuality:'NOT_ASSESSED'},null,2))
 console.log((result.status===0?'PASS ':'FAIL ')+name)
}
if(names.some(name=>!results[name].passed))process.exitCode=1
