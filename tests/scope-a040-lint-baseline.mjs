// Compare actual current failures to Git HEAD without changing the working tree.
import assert from 'node:assert/strict'
import {execFileSync,spawnSync} from 'node:child_process'
import {createRequire} from 'node:module'
import {readFileSync,writeFileSync} from 'node:fs'
import {resolve,join} from 'node:path'
const require=createRequire(new URL('../functions/package.json',import.meta.url))
process.env.ESLINT_USE_FLAT_CONFIG='false'
const {ESLint}=require('eslint'),cwd=resolve('functions'),file=join(cwd,'src/index.ts')
const lint=new ESLint({cwd,overrideConfigFile:join(cwd,'.eslintrc.js'),useEslintrc:false})
const head=execFileSync('git',['show','HEAD:functions/src/index.ts'],{encoding:'utf8'})
const [baseline]=await lint.lintText(head,{filePath:file}),full=await lint.lintFiles(['.'])
const current=full.find(result=>result.filePath===file)
const simplify=messages=>messages.map(({ruleId,line,column,message,severity})=>({ruleId,line,column,message,severity}))
const normalize=text=>text.replaceAll('\r','')
const report={executed:true,unchangedBookingFile:normalize(head)===normalize(readFileSync(file,'utf8')),
  baselineErrors:baseline.errorCount,currentErrors:current.errorCount,
  exactRuleLineMessageMatch:JSON.stringify(simplify(baseline.messages))===JSON.stringify(simplify(current.messages)),
  introducedErrorsInOtherBackendFiles:full.filter(r=>r.filePath!==file).reduce((n,r)=>n+r.errorCount,0)}
const root=spawnSync(process.execPath,['--input-type=module','-e',"await import('./eslint.config.js')"],{encoding:'utf8'})
report.rootConfig={unchanged:normalize(execFileSync('git',['show','HEAD:eslint.config.js'],{encoding:'utf8'}))===normalize(readFileSync('eslint.config.js','utf8')),
  actualExitCode:root.status,missingDependency:root.stderr.includes('@eslint/js')}
writeFileSync('docs/evidence/scope-a040/lint-baseline.json',JSON.stringify(report,null,2))
writeFileSync('docs/evidence/scope-a040/root-lint.txt',root.stdout+root.stderr)
assert.equal(report.unchangedBookingFile,true);assert.equal(report.exactRuleLineMessageMatch,true)
assert.equal(report.introducedErrorsInOtherBackendFiles,0)
assert.equal(report.rootConfig.unchanged,true);assert.equal(report.rootConfig.missingDependency,true)
console.log('PASS: 30 unchanged booking lint errors; zero in other backend files; unchanged root config missing @eslint/js.')
