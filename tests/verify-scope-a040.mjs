// Local evidence runner. No deployment, provider, approval or booking commands.
import {spawnSync} from 'node:child_process'
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs'
import {join,dirname} from 'node:path'
const out='docs/evidence/scope-a040'
mkdirSync(out,{recursive:true})
const npm=process.env.npm_execpath||join(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js')
const test=(...files)=>['--import','./tests/register-ts.mjs','--test',...files]
const commands={
  'lint-chat':[npm,'--prefix','functions','run','lint:chat'],
  'lint-full':[npm,'--prefix','functions','run','lint'],
  'lint-baseline':['tests/scope-a040-lint-baseline.mjs'],
  'build-functions':[npm,'--prefix','functions','run','build'],
  'build-web':[npm,'run','build'],
  'core-and-regressions':test('tests/inspire-chat.test.mjs','tests/scope-a040-bugs.test.mjs'),
  'emulator-tests':test('tests/inspire-emulator.test.mjs','tests/inspire-consolidation.test.mjs'),
  'controller-tests':test('tests/scope-a040-integration.test.mjs'),
  'package-check':['tests/verify-controller040-package.mjs'],
  'public-build-audit':['tests/inspire-build-audit.mjs'],
  'browser-checks':['tests/inspire-browser.mjs'],
  'production-browser':['tests/inspire-browser.mjs','--production'],
}
const requested=process.argv.slice(2),names=requested.length?requested:Object.keys(commands)
const path=join(out,'executed-checks.json')
const records=existsSync(path)?JSON.parse(readFileSync(path,'utf8')): {}
let failed=false
for(const name of names){
  if(!commands[name])throw Error('Unknown local check: '+name)
  const result=spawnSync(process.execPath,commands[name],{encoding:'utf8',maxBuffer:32*1024*1024,
    env:{...process.env,METADATA_SERVER_DETECTION:'none',INSPIRE_REVIEW_EVIDENCE_DIR:out,
      INSPIRE_EVIDENCE_DIR:join(out,'browser'),
      ...(name==='production-browser'?{INSPIRE_TEST_URL:'http://127.0.0.1:5174'}:{})}})
  writeFileSync(join(out,name+'.txt'),`${result.stdout??''}${result.stderr??''}\nEXIT_CODE=${result.status}\n`)
  const expected=name==='lint-full'?1:0
  records[name]={executed:true,command:[process.execPath,...commands[name]],exitCode:result.status,expectedExitCode:expected,
    passed:result.status===expected,scope:name==='lint-full'?'Known baseline errors; see baseline comparison.':'Local offline only'}
  failed ||= result.status!==expected
  writeFileSync(path,JSON.stringify(records,null,2))
  console.log(`${records[name].passed?'PASS':'FAIL'} ${name}: exit ${result.status}`)
}
process.exitCode=failed?1:0
