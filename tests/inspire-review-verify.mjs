// Review-only verification driver. No deploy, provider or booking commands.
import {spawnSync,execFileSync} from 'node:child_process'
import {createRequire} from 'node:module'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {resolve,dirname,join} from 'node:path'
const out=resolve('docs/evidence/inspire-review')
mkdirSync(out,{recursive:true})
const npm=process.env.npm_execpath||join(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js')
const results=[]
function run(name,args,{expected=0,env={}}={}){
  const start=Date.now()
  const result=spawnSync(process.execPath,args,{encoding:'utf8',maxBuffer:32*1024*1024,
    env:{...process.env,METADATA_SERVER_DETECTION:'none',...env}})
  writeFileSync(join(out,name+'.txt'),`${process.execPath} ${args.join(' ')}\n\n${result.stdout??''}${result.stderr??''}\nEXIT_CODE=${result.status}\n`)
  const record={name,executed:true,exitCode:result.status,expectedExitCode:expected,passed:result.status===expected,durationMs:Date.now()-start}
  results.push(record);console.log(`${record.passed?'PASS':'FAIL'} ${name}: exit ${result.status}`)
  return result
}
run('backend-lint-touched',[npm,'--prefix','functions','run','lint:chat'])
run('backend-lint-full',[npm,'--prefix','functions','run','lint','--','--format','json','--output-file',join(out,'backend-lint-full.json')],{expected:1})
const require=createRequire(new URL('../functions/package.json',import.meta.url))
process.env.ESLINT_USE_FLAT_CONFIG='false'
const {ESLint}=require('eslint')
const functions=resolve('functions'),file=join(functions,'src/index.ts')
const lint=new ESLint({cwd:functions,overrideConfigFile:join(functions,'.eslintrc.js'),useEslintrc:false})
const head=execFileSync('git',['show','HEAD:functions/src/index.ts'],{encoding:'utf8'})
const [baseline]=await lint.lintText(head,{filePath:file})
const full=JSON.parse(readFileSync(join(out,'backend-lint-full.json'),'utf8'))
const current=full.find(result=>result.filePath===file)
const simplify=messages=>messages.map(({ruleId,line,column,message,severity})=>({ruleId,line,column,message,severity}))
const unchanged=head.replaceAll('\r','')===readFileSync(file,'utf8').replaceAll('\r','')
const matched=unchanged&&JSON.stringify(simplify(baseline.messages))===JSON.stringify(simplify(current?.messages??[]))
const introduced=full.filter(result=>result.filePath!==file).reduce((sum,result)=>sum+result.errorCount,0)
writeFileSync(join(out,'lint-baseline-comparison.json'),JSON.stringify({executed:true,
  unchangedBaselineFile:'functions/src/index.ts',unchanged,baselineErrors:baseline.errorCount,
  currentErrors:current?.errorCount,exactRuleLineMessageMatch:matched,introducedErrorsInOtherBackendFiles:introduced,
  messages:simplify(baseline.messages)},null,2))
if(!matched||introduced!==0)results.push({name:'lint-baseline-comparison',passed:false})
run('root-lint-config-preexisting',['--input-type=module','-e',"await import('./eslint.config.js')"],{expected:1})
writeFileSync(join(out,'root-lint-baseline.json'),JSON.stringify({
  unchanged:execFileSync('git',['show','HEAD:eslint.config.js'],{encoding:'utf8'}).replaceAll('\r','')===readFileSync('eslint.config.js','utf8').replaceAll('\r',''),
  note:'Unmodified root frontend flat configuration is separate from Functions ESLint 8; its missing dependency/import failure is pre-existing.'},null,2))
run('source-integrity-audit',['tests/inspire-source-audit.mjs'])
run('functions-build',[npm,'--prefix','functions','run','build'])
run('conversation-tests',['--import','./tests/register-ts.mjs','--test','tests/inspire-chat.test.mjs'])
run('emulator-tests',['--import','./tests/register-ts.mjs','--test','tests/inspire-emulator.test.mjs'])
run('targeted-consolidation-tests',['--import','./tests/register-ts.mjs','--test','tests/inspire-consolidation.test.mjs'])
run('production-build',[npm,'run','build'])
run('public-build-audit',['tests/inspire-build-audit.mjs'])
run('development-browser',['tests/inspire-browser.mjs'])
run('production-browser',['tests/inspire-browser.mjs','--production'],{env:{INSPIRE_TEST_URL:'http://127.0.0.1:5174'}})
writeFileSync(join(out,'executed-results.json'),JSON.stringify({executed:true,results,
  expectedFailures:'Full backend lint contains only unchanged index.ts failures; root flat config is unchanged and missing existing dependencies.',
  notVerified:['Controller integration','real OAuth','model quality','clinical validity','production authorization','actual-source runtime approvals']},null,2))
process.exitCode=results.every(result=>result.passed)?0:1
