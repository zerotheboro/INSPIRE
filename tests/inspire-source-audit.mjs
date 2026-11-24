// Byte-level receipt audit only. This script never changes approval or imports.
import {existsSync,readFileSync,statSync,mkdirSync,writeFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {resolve,join} from 'node:path'
import {homedir} from 'node:os'
const evidence=resolve('docs/evidence/inspire-review')
mkdirSync(evidence,{recursive:true})
const receiptFile=resolve('.private.local/knowledge/receipts.json')
const receipts=existsSync(receiptFile)?JSON.parse(readFileSync(receiptFile,'utf8')):[]
const downloads=join(homedir(),'Downloads')
const originals={
  'website-counseling':resolve('docs/counseling-topics-source.md'),
  'content-patch-20261109':join(downloads,'01_CONTENT_PATCH_FULL.md'),
  'devamicus-inspire-original':join(downloads,'Devamicus_INSPIRE.pdf'),
  'pec-stage1-5-receipt':join(downloads,'INSPIRE_PEC_STAGE1_5_DURABLE_ENGINE.py'),
  'website-source-bundle':join(downloads,'INSPIRE-main.zip'),
}
const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex')
const verified=Object.entries(originals).map(([id,file])=>{
  const receipt=receipts.find(item=>item.documentId===id)
  const raw=receipt&&resolve('.private.local/knowledge/raw',receipt.hash)
  const originalHash=existsSync(file)?hash(file):null
  const rawHash=raw&&existsSync(raw)?hash(raw):null
  return {documentId:id,originalFile:file.split(/[\\/]/).at(-1),
    originalPresent:existsSync(file),originalBytes:existsSync(file)?statSync(file).size:null,
    sha256:originalHash,storedRawSha256:rawHash,receiptSha256:receipt?.hash??null,
    byteVerified:!!originalHash&&originalHash===rawHash&&originalHash===receipt?.hash,
    configuredStatus:receipt?.status??'no-receipt',configuredUse:receipt?.permittedUse??'no-receipt',
    establishedUserFacingRuntimePermission:false,
    permissionEvidence:'No separate approval evidence found in inspected materials; receipt and configured use do not establish approval.',
  }
})
let archiveDocuments=[],archiveCheck='unavailable'
if(existsSync(originals['website-source-bundle'])){
  const quoted=originals['website-source-bundle'].replaceAll("'","''")
  const script=`Add-Type -AssemblyName System.IO.Compression.FileSystem; $a=[IO.Compression.ZipFile]::OpenRead('${quoted}'); try { @($a.Entries | Where-Object { $_.FullName -match '\\.(md|txt|pdf|docx)$' } | ForEach-Object { $_.FullName }) | ConvertTo-Json -Compress } finally { $a.Dispose() }`
  try {const parsed=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-Command',script],{encoding:'utf8'}));archiveDocuments=Array.isArray(parsed)?parsed:[parsed];archiveCheck='executed-central-directory-only'}
  catch {archiveCheck='blocked archive directory read'}
}
const report={executed:true,scope:['repository','known original Downloads files','private receipts/raw copies','attached filenames','accessible Pages titles (no relevant sources found)'],
  originalSources:verified,
  establishedRuntimePermissions:[],
  configuredSupportingSources:verified.filter(item=>item.configuredUse==='supporting-retrieval').map(item=>({documentId:item.documentId,note:'Previously configured website supporting text. Publication/configuration alone is not a separate permission receipt; not certified as authoritative.'})),
  reviewOnlyDraftOrUnverified:verified.filter(item=>item.configuredUse!=='supporting-retrieval').map(item=>({documentId:item.documentId,status:item.configuredStatus})),
  archiveCheck,archiveDocuments,
  missingDependencies:['24-document original INSPIRE bundle is not byte-accessible in the checked locations; no request to resend documents individually was made.',
    'Controller 0.4.0 contract/package and authoritative Knowledge Core not available in checked sources.',
    'Available PEC stage 1.5 Python file requires missing mock_engine.pec_mock and explicitly declares test-only use.',
    '458 original lessons and direct historical MOI-01-A verification evidence not available; draft/pending status retained.',
    'Separate user-facing runtime permission evidence for actual sources remains unresolved.'],
  approvalChangesMade:false,paidModelCalled:false,
}
writeFileSync(join(evidence,'source-integrity-and-permissions.json'),JSON.stringify(report,null,2))
console.log(`Byte verified ${verified.filter(item=>item.byteVerified).length}/${verified.length} known original files and raw copies. Established actual-source runtime permissions: 0. No approval changes.`)
if(verified.some(item=>!item.byteVerified))process.exitCode=1
