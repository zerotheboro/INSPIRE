// Explicit offline-only checks. No model, approval, booking or deployment command.
import {spawnSync} from 'node:child_process'
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs'
import {resolve,join,dirname} from 'node:path'
import {launcherEnvironment} from './start-inspire-emulators.mjs'
const out='docs/evidence/generative-preparation'
mkdirSync(out,{recursive:true})
const python=process.env.INSPIRE_CONTROLLER_PYTHON||resolve('.tools.local/python312/python.exe')
const npm=process.env.npm_execpath||join(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js')
const commands={
  'candidate-interface':[python,['-X','utf8','tests/inspire-generative.test.py']],
  'source-candidates':[python,['-X','utf8','tests/inspire-trial-source-audit.py']],
  'backend-lint':[process.execPath,[npm,'--prefix','functions','run','lint:chat']],
  'functions-build':[process.execPath,[npm,'--prefix','functions','run','build']],
  'website-build':[process.execPath,[npm,'run','build']],
  'public-build-audit':[process.execPath,['tests/inspire-build-audit.mjs']],
  'website-browser':[process.execPath,['tests/inspire-browser.mjs']],
  'production-browser':[process.execPath,['tests/inspire-browser.mjs','--production']],
}
const selected=process.argv.slice(2),names=selected.length?selected:Object.keys(commands)
const previous=join(out,'executed-checks.json')
const results=existsSync(previous)?JSON.parse(readFileSync(previous,'utf8')).results:{}
for(const name of names){
  if(!commands[name])throw Error('Unknown offline check: '+name)
  const [exe,args]=commands[name],start=Date.now()
  const r=spawnSync(exe,args,{encoding:'utf8',maxBuffer:32*1024*1024,env:{...process.env,
    PYTHONDONTWRITEBYTECODE:'1',METADATA_SERVER_DETECTION:'none',
    INSPIRE_REVIEW_EVIDENCE_DIR:out,INSPIRE_EVIDENCE_DIR:join(out,'browser'),
    ...(name==='production-browser'?{INSPIRE_TEST_URL:'http://127.0.0.1:5174'}:{})}})
  writeFileSync(join(out,name+'.txt'),`${r.stdout??''}${r.stderr??''}\nEXIT_CODE=${r.status}\n`)
  results[name]={executed:true,executedAt:new Date().toISOString(),command:[exe,...args],exitCode:r.status,passed:r.status===0,durationMs:Date.now()-start}
  console.log(`${r.status===0?'PASS':'FAIL'} ${name}: exit ${r.status}`)
}
writeFileSync(join(out,'executed-checks.json'),JSON.stringify({executedAt:new Date().toISOString(),
  liveModelEnabled:false,paidCalls:0,results,priorMilestoneEvidence:'../scope-a040/ (executed in preceding milestone, retained separately)'},null,2))
const deps={}
for(const location of ['node_modules/react','node_modules/vite','node_modules/typescript','node_modules/firebase',
  'node_modules/firebase-tools','functions/node_modules/firebase-admin','functions/node_modules/firebase-functions',
  'functions/node_modules/openai','functions/node_modules/typescript','functions/node_modules/eslint']){
  deps[location]=JSON.parse(readFileSync(join(location,'package.json'),'utf8')).version
}
const py=spawnSync(python,['-c',"import sys,json,importlib.metadata as m;print(json.dumps({'python':sys.version,'dependencies':{k:m.version(k) for k in ['pydantic','jsonschema','httpx']}}))"],{encoding:'utf8'})
const env=launcherEnvironment(process.env)
const java=spawnSync(join(env.JAVA_HOME,'bin',process.platform==='win32'?'java.exe':'java'),['-version'],{env,encoding:'utf8'})
writeFileSync(join(out,'dependency-versions.json'),JSON.stringify({executed:true,node:process.version,
  platform:process.platform,architecture:process.arch,npmDependencies:deps,python:JSON.parse(py.stdout),java:java.stderr,
  excludedFromZIP:['Python/Java portable runtimes','node_modules'],productionNode22Executed:false},null,2))
process.exitCode=Object.values(results).every(r=>r.passed)?0:1
