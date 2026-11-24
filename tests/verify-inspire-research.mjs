// Offline execution recorder. No key, paid call, approval or deployment command.
import {spawnSync} from 'node:child_process'
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs'
import {resolve,dirname,join} from 'node:path'
const out='docs/evidence/research-implementation'
mkdirSync(out,{recursive:true})
const python=process.env.INSPIRE_CONTROLLER_PYTHON||resolve('.tools.local/python312/python.exe')
const npm=process.env.npm_execpath||join(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js')
const tasks={
  research:[python,['-X','utf8','tests/inspire-research.test.py']],
  admission:[process.execPath,['--import','./tests/register-ts.mjs','--test','tests/inspire-research-admission.test.mjs']],
  'cli-smoke':[process.execPath,['tests/inspire-research-cli-smoke.mjs']],
  catalogue:[python,['-X','utf8','tests/inspire-generative.test.py']],
  conversation:[process.execPath,['--import','./tests/register-ts.mjs','--test','tests/inspire-chat.test.mjs']],
  'account-regressions':[process.execPath,['--import','./tests/register-ts.mjs','--test','tests/inspire-emulator.test.mjs']],
  'lint-baseline':[process.execPath,['tests/scope-a040-lint-baseline.mjs']],
  lint:[process.execPath,[npm,'--prefix','functions','run','lint:chat']],
  'functions-build':[process.execPath,[npm,'--prefix','functions','run','build']],
  'website-build':[process.execPath,[npm,'run','build']],
  'public-build-audit':[process.execPath,['tests/inspire-build-audit.mjs']],
}
const file=out+'/executed-checks.json'
const previous=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{}
const results=previous.results||{}
const selected=process.argv.slice(2),names=selected.length?selected:Object.keys(tasks)
for(const name of names){
  if(!tasks[name])throw Error('Unsupported offline check: '+name)
  const [exe,args]=tasks[name],start=Date.now()
  // The older catalogue test writes its historical trace. Preserve that handoff
  // byte for byte and retain this execution's trace in the new evidence folder.
  const preserve=name==='catalogue'?['docs/evidence/generative-preparation/offline-candidate-trace.json']:
    name==='lint-baseline'?['docs/evidence/scope-a040/lint-baseline.json','docs/evidence/scope-a040/root-lint.txt']:[]
  const originals=preserve.filter(existsSync).map(file=>[file,readFileSync(file)])
  const r=spawnSync(exe,args,{encoding:'utf8',maxBuffer:32*1024*1024,
    env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',METADATA_SERVER_DETECTION:'none',INSPIRE_REVIEW_EVIDENCE_DIR:out}})
  for(const [file,original] of originals){
    writeFileSync(out+'/'+(name==='catalogue'?'catalogue-native-trace.json':file.split('/').at(-1)),readFileSync(file))
    writeFileSync(file,original)
  }
  writeFileSync(out+'/'+name+'.txt',`${r.stdout??''}${r.stderr??''}\nEXIT_CODE=${r.status}\n`)
  results[name]={executed:true,executedAt:new Date().toISOString(),command:[exe,...args],exitCode:r.status,passed:r.status===0,durationMs:Date.now()-start}
  writeFileSync(file,JSON.stringify({results,paidCalls:0,liveEnabled:false,
    scope:'Offline transports; actual Windows private storage and local Firebase emulators; not model quality'},null,2))
  console.log(`${r.status===0?'PASS':'FAIL'} ${name}: exit ${r.status}`)
}
process.exitCode=names.every(name=>results[name].passed)?0:1
