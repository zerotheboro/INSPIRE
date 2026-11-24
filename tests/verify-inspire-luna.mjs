// Offline/local-only milestone evidence. No model generation command is present.
import {spawnSync} from 'node:child_process'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {resolve,dirname,join} from 'node:path'
const out='docs/evidence/luna-private-2026-11-11'
mkdirSync(out,{recursive:true})
const python=process.env.INSPIRE_CONTROLLER_PYTHON||resolve('.tools.local/python312/python.exe')
const npm=join(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js')
const node=process.execPath
const tasks={
  luna:[node,['--import','./tests/register-ts.mjs','--test','tests/inspire-luna.test.mjs']],
  conversation:[node,['--import','./tests/register-ts.mjs','--test','tests/inspire-chat.test.mjs']],
  accounts:[node,['--import','./tests/register-ts.mjs','--test','tests/inspire-emulator.test.mjs']],
  research:[python,['-X','utf8','tests/inspire-research.test.py']],
  lint:[node,[npm,'--prefix','functions','run','lint:chat']],
  'functions-build':[node,[npm,'--prefix','functions','run','build']],
  'website-build':[node,[npm,'run','build']],
  privacy:[node,['tests/inspire-build-audit.mjs']],
  'private-browser':[node,['tests/inspire-browser.mjs','--private']],
  'website-browser':[node,['tests/inspire-browser.mjs']],
  'production-browser':[node,['tests/inspire-browser.mjs','--private','--production']],
}
const names=process.argv.slice(2).length?process.argv.slice(2):Object.keys(tasks)
let results={}
try{results=JSON.parse(readFileSync(out+'/executed-checks.json','utf8')).results}catch{}
for(const name of names){
  if(!tasks[name])throw Error('Unknown local check')
  const [exe,args]=tasks[name],start=Date.now()
  // Preserve the old milestone's evidence; retain this run's trace separately.
  const previous=name==='research'?readFileSync('docs/evidence/research-implementation/offline-trace.json'):null
  const r=spawnSync(exe,args,{encoding:'utf8',maxBuffer:32*1024*1024,env:{...process.env,
    PYTHONDONTWRITEBYTECODE:'1',METADATA_SERVER_DETECTION:'none',
    INSPIRE_REVIEW_EVIDENCE_DIR:out,INSPIRE_EVIDENCE_DIR:out+'/'+name,
    ...(name==='production-browser'?{INSPIRE_TEST_URL:'http://127.0.0.1:4173'}:{})}})
  if(previous){writeFileSync(out+'/research-offline-trace.json',readFileSync('docs/evidence/research-implementation/offline-trace.json'));writeFileSync('docs/evidence/research-implementation/offline-trace.json',previous)}
  writeFileSync(out+'/'+name+'.txt',`${r.stdout??''}${r.stderr??''}\nEXIT_CODE=${r.status}\n`)
  results[name]={executed:true,at:new Date().toISOString(),command:[exe,...args],exitCode:r.status,passed:r.status===0,durationMs:Date.now()-start}
  writeFileSync(out+'/executed-checks.json',JSON.stringify({results,generationRequests:0,paidCalls:0,modelQuality:'NOT_ASSESSED',simulationOnly:true},null,2))
  console.log(`${r.status===0?'PASS':'FAIL'} ${name}`)
}
process.exitCode=names.every(n=>results[n].passed)?0:1
