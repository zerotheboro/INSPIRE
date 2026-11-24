// Complete source/configuration diff, without staging or including runtime data.
import {execFileSync} from 'node:child_process'
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs'
const git=args=>execFileSync('git',args,{encoding:'utf8'})
let patch=git(['diff','--no-ext-diff','--binary'])
const untracked=git(['ls-files','--others','--exclude-standard']).trim().split(/\r?\n/).filter(Boolean)
const source=file=>/^(src\/|functions\/src\/|tests\/)/.test(file)&&/\.(ts|tsx|mjs|cjs|ps1|css)$/.test(file)||
  /^(functions\/lint\.cjs|firestore\.rules|REVIEW\.md|UNRESOLVED\.md)$/.test(file)||/^docs\/[^/]+\.md$/.test(file)
for(const file of untracked.filter(source)){
  const text=readFileSync(file,'utf8').replace(/\r\n/g,'\n')
  const lines=text.replace(/\n$/,'').split('\n')
  patch+=`diff --git a/${file} b/${file}\nnew file mode 100644\n--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,${lines.length} @@\n`
  patch+=lines.map(line=>'+'+line+'\n').join('')
  if(!text.endsWith('\n'))patch+='\\ No newline at end of file\n'
}
mkdirSync('docs/evidence/inspire-review',{recursive:true})
writeFileSync('docs/evidence/inspire-review/complete-working-tree.patch',patch)
console.log('Complete source/configuration diff: docs/evidence/inspire-review/complete-working-tree.patch')
