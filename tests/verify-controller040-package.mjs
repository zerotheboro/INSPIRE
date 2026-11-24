// Read-only integrity/status audit. No source import, approval or code execution.
import {readFileSync,readdirSync,writeFileSync,mkdirSync,statSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {resolve,relative,join,sep} from 'node:path'
const root=resolve('.private.local/controller040-preview/INSPIRE_AI_040')
const read=path=>readFileSync(join(root,path))
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
const manifest=JSON.parse(read('manifests/package_manifest.json'))
const mismatches=[]
for(const file of manifest.files){
  const path=resolve(root,file.path)
  if(!path.startsWith(root+sep))throw Error('Manifest escaped private root')
  try{const bytes=read(file.path);if(hash(bytes)!==file.sha256||bytes.length!==file.bytes)mismatches.push(file.path)}catch{mismatches.push(file.path)}
}
const corpus=JSON.parse(read('sources/verified_corpus_032.json'))
const sourceRecords=corpus.source_records.map(record=>({...record,
  byteVerified:hash(read(record.path))===record.sha256&&read(record.path).length===record.bytes}))
const current=JSON.parse(read('manifests/SOURCE_VERSION_MANIFEST_040.json'))
const drafts=JSON.parse(read('manifests/SOURCE_VERSION_MANIFEST_033.json'))
const statuses={}
for(const record of sourceRecords)statuses[record.approval_status]=(statuses[record.approval_status]??0)+1
const mainIds=Array.from({length:24},(_,i)=>'INSPIRE-'+String(i+1).padStart(2,'0'))
const report={executed:true,package:'INSPIRE_AI_0.4.0_PREVIEW.zip',
  archiveSha256:hash(readFileSync('C:/Users/Admin/Downloads/INSPIRE_AI_0.4.0_PREVIEW.zip')),
  manifestRole:manifest.role,payloadsChecked:manifest.files.length,mismatches,
  sourceCount:sourceRecords.length,verifiedSources:sourceRecords.filter(record=>record.byteVerified).length,
  all24MainIdsPresent:mainIds.every(id=>sourceRecords.some(record=>record.document_id===id)),
  sourceRecords,approvalStatusCounts:statuses,
  historical_MOI_A:current.historical_MOI_A,
  educationalDrafts:current.educational_draft_source_manifest,
  draftPayloadCount:drafts.new_draft_files_preserved?.length,
  architectureApproval:current.architecture_approval,clinicalValidation:current.clinical_validation,
  deploymentPermission:current.deployment_permission,
  runtimeWorkingSource:current.runtime_source_context,
  limitations:['Integrity is not approval. All original record statuses retained.','No package frontend, launcher, paid/local model, database or approval tool executed.'],
}
mkdirSync('docs/evidence/scope-a040',{recursive:true})
writeFileSync('docs/evidence/scope-a040/package-audit.json',JSON.stringify(report,null,2))
console.log(JSON.stringify({payloadsChecked:report.payloadsChecked,mismatches,verifiedSources:report.verifiedSources,all24MainIdsPresent:report.all24MainIdsPresent,statuses,
  historical_MOI_A:report.historical_MOI_A,educationalDrafts:report.educationalDrafts,workingSourceStatus:report.runtimeWorkingSource.declared_status}))
if(mismatches.length||sourceRecords.some(record=>!record.byteVerified))process.exitCode=1
