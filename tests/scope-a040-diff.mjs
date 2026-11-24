// Focused milestone diff against the pre-task dirty-tree source snapshot.
// Does not stage, restore, commit or inspect secrets/runtime data.
import {readdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs'
import {join,relative} from 'node:path'
import {spawnSync} from 'node:child_process'
const before=process.argv[2]||'.private.local/scope-a-before',out=process.argv[3]||'docs/evidence/scope-a040'
const skip=new Set(['.git','.private.local','.tools.local','node_modules','dist','lib','evidence'])
function walk(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>skip.has(e.name)?[]:e.isDirectory()?walk(join(dir,e.name)):[join(dir,e.name)])}
const source=f=>/\.(ts|tsx|mjs|cjs|js|json|css|md|py|rules|html)$/.test(f)||['.gitignore','.firebaserc'].includes(f)
const files=walk('.').map(f=>f.replaceAll('\\','/')).filter(source)
const previous=walk(before).map(f=>relative(before,f).replaceAll('\\','/')).filter(source)
let patch='',unchanged=0
const changed=[]
for(const file of [...new Set([...files,...previous])].sort()){
  const oldPath=join(before,file),old=existsSync(oldPath)?readFileSync(oldPath):undefined
  const current=existsSync(file)?readFileSync(file):undefined
  if(old&&current&&old.equals(current)){unchanged++;continue}
  changed.push(file)
  if(old&&current){
    const result=spawnSync('git',['diff','--no-ext-diff','--no-index','--',oldPath,file],{encoding:'utf8',maxBuffer:16*1024*1024})
    if(result.status!==1)throw Error('Diff failed for '+file)
    patch+=result.stdout.replace(/^diff --git .*$/m,`diff --git a/${file} b/${file}`)
      .replace(/^--- .*$/m,`--- a/${file}`).replace(/^\+\+\+ .*$/m,`+++ b/${file}`)
  }else{
    const text=(current??old).toString('utf8').replaceAll('\r',''),lines=text.replace(/\n$/,'').split('\n')
    patch+=`diff --git a/${file} b/${file}\n${current?'new':'deleted'} file mode 100644\n--- ${current?'/dev/null':'a/'+file}\n+++ ${current?'b/'+file:'/dev/null'}\n@@ ${current?'-0,0 +1,':'-1,'+lines.length+' +0,'}${current?lines.length:0} @@\n`
    patch+=lines.map(line=>(current?'+':'-')+line+'\n').join('')
  }
}
writeFileSync(join(out,'focused-working-tree.patch'),patch)
writeFileSync(join(out,'preservation.json'),JSON.stringify({executed:true,baseline:'Private pre-task source snapshot, not Git HEAD',
  unchangedSourceFiles:unchanged,changedFiles:changed,
  scope:'Source/config/docs only. Prior dirty changes are retained; generated outputs, evidence, tools, private bundle and secrets excluded.'},null,2))
console.log(JSON.stringify({changedFiles:changed,unchangedSourceFiles:unchanged}))
