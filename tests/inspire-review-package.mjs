// Generate an allowlisted source/evidence manifest; no runtime state is copied.
import {existsSync,readdirSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {join,resolve} from 'node:path'
import assert from 'node:assert/strict'
const out='docs/evidence/inspire-review'
mkdirSync(out,{recursive:true})
const selected=new Set()
function add(file){if(existsSync(file))selected.add(file.replaceAll('\\','/'))}
function walk(dir,predicate=()=>true){
  for(const entry of readdirSync(dir,{withFileTypes:true})){
    const file=join(dir,entry.name)
    assert.ok(!entry.isSymbolicLink(),'Refuse symlink in review payload: '+file)
    if(entry.isDirectory())walk(file,predicate)
    else if(predicate(file))add(file)
  }
}
for(const file of ['.gitignore','.firebaserc','ads.txt','eslint.config.js','firebase.json','firestore.rules',
  'index.html','package.json','package-lock.json','README.md','REVIEW.md','UNRESOLVED.md',
  'tsconfig.app.json','tsconfig.json','tsconfig.node.json','vite.config.ts',
  'functions/.eslintrc.js','functions/.gitignore','functions/package.json',
  'functions/package-lock.json','functions/tsconfig.json','functions/tsconfig.dev.json','functions/lint.cjs'])add(file)
for(const dir of ['src','public','functions/src'])walk(dir)
walk('tests',file=>/\.(mjs|ps1)$/.test(file))
for(const entry of readdirSync('docs'))if(entry.endsWith('.md'))add('docs/'+entry)
walk(out,file=>/\.(json|txt|patch|tap|md)$/.test(file)&&!file.endsWith('package-manifest.json')&&!file.endsWith('zip-audit.json'))
for(const name of ['welcome-desktop.png','conversation-desktop.png','conversation-mobile.png','retry-desktop.png',
  'account-profile-desktop.png','account-profile-mobile.png','closed-production.png','browser-results.json','production-results.json'])add('docs/evidence/inspire-chat/'+name)
const forbiddenPath=/(^|\/)(node_modules|\.git|\.tools\.local|\.private\.local|dist|lib)(\/|$)|(^|\/)\.env|\.(sqlite|db|log|har|tsbuildinfo)$/i
const secretPatterns=[/-----BEGIN (?:RSA |EC )?PRIVATE KEY-----[\r\n]+[A-Za-z0-9+/=]{32,}/,
  /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{24,}/,
  /"private_key"\s*:\s*"-----BEGIN/]
const files=[...selected].sort().map(file=>{
  assert.ok(!forbiddenPath.test(file),'Forbidden package path: '+file)
  const data=readFileSync(file)
  if(!/\.(png|jpe?g|webp|gif|ico)$/i.test(file))for(const pattern of secretPatterns)assert.ok(!pattern.test(data.toString('utf8')),'Potential secret in '+file)
  return {relativePath:file,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')}
})
const results=JSON.parse(readFileSync(join(out,'executed-results.json'),'utf8'))
assert.ok(results.results.every(result=>result.passed),'Do not package a failed verification run')
writeFileSync(join(out,'package-manifest.json'),JSON.stringify({
  purpose:'INSPIRE review only; no deployment/model/source permission',
  root:'.',manifestSelfExcludedFromHashList:true,
  excluded:['node_modules','secrets/credentials','.git','.env*','private originals/raw','runtime databases/exports','browser profiles','portable tools','generated output/build caches','real user data'],
  secretScan:'Executed finite path/PEM/provider-key scan; public Firebase web configuration and explicit synthetic test fixtures are not live credentials.',files,
},null,2))
console.log(`Manifest: ${files.length} allowlisted files, ${files.reduce((sum,file)=>sum+file.bytes,0)} bytes; no excluded paths or detected live credential patterns.`)
