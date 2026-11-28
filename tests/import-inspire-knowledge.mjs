// Operator-only emulator import. Raw receipt is private and never a public asset.
import {readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync, lstatSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {resolve, join, sep} from 'node:path'
import {homedir} from 'node:os'
import {TextDecoder} from 'node:util'
import {requireLocalEmulators} from '../functions/src/inspireLocalService.ts'
import {importSource} from '../functions/src/inspireKnowledge.ts'
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
requireLocalEmulators()
const rawDir = resolve('.private.local/knowledge/raw')
mkdirSync(rawDir, {recursive: true})
const downloads = join(homedir(), 'Downloads')
const sources = [
  {path: resolve('docs/counseling-topics-source.md'), id: 'website-counseling', title: 'Các chủ đề tham vấn trên website INSPIRE', status: 'published-supporting', use: 'supporting-retrieval'},
  {path: join(downloads, '01_CONTENT_PATCH_FULL.md'), id: 'content-patch-20261109', title: 'WORKING CONTENT PATCH / REVIEW REQUIRED', status: 'review-required', use: 'receipt-only'},
  {path: join(downloads, 'Devamicus_INSPIRE.pdf'), id: 'devamicus-inspire-original', title: 'Devamicus INSPIRE original received; approval unverified', status: 'unverified', use: 'receipt-only'},
  {path: join(downloads, 'INSPIRE_PEC_STAGE1_5_DURABLE_ENGINE.py'), id: 'pec-stage1-5-receipt', title: 'PEC stage 1.5 source receipt; missing mock_engine dependency', status: 'unverified', use: 'receipt-only'},
  {path: join(downloads, 'INSPIRE-main.zip'), id: 'website-source-bundle', title: 'Existing INSPIRE website source bundle', status: 'unverified', use: 'receipt-only'},
]
// Original package receipts are opt-in operator work. No permission is inferred
// from the package's source history, a manifest hash, receipt or draft version.
if (process.argv.includes('--controller-originals') || process.argv.includes('--discover')) {
  const root = resolve('.private.local/controller040-preview/INSPIRE_AI_040')
  const manifestBytes = readFileSync(join(root,'manifests/package_manifest.json'))
  const packageHash = createHash('sha256').update(manifestBytes).digest('hex')
  if(packageHash!=='7e84cef6083755879364d31ed69f8d00305feab0cbcc50a94ef9d5e97753797a')throw Error('Original package manifest changed')
  for(const row of JSON.parse(manifestBytes).files.filter(row=>row.path.startsWith('sources/'))) {
    const sourcePath=resolve(root,row.path)
    if(!sourcePath.startsWith(root+sep))throw Error('Invalid original source path')
    sources.push({path:sourcePath,id:'original-'+createHash('sha256').update(row.path).digest('hex').slice(0,24),
      title:row.path,status:'review-required',use:'receipt-only',expectedHash:row.sha256,expectedBytes:row.bytes,
      kind:/MOI/i.test(row.path)?'operating-rules':'reference',
      provenance:{packageHash,relativePath:row.path,declaredVersion:'Preserved in original filename/header; not normalized or superseded',authority:'Received original; unresolved runtime/export permission'}})
  }
}
const manifestAt=process.argv.indexOf('--manifest')
if(manifestAt>=0){
  const file=resolve(process.argv[manifestAt+1]??'')
  if(!file.startsWith(resolve('.private.local')+sep))throw Error('Use an ignored .private.local source manifest')
  const entries=JSON.parse(readFileSync(file,'utf8'))
  if(!Array.isArray(entries))throw Error('Source manifest must be an array')
  sources.push(...entries.map(item=>({...item,operatorManifest:true})))
}
// Discover only INSPIRE-owned locations; never traverse neighboring projects.
// Existing IDs and operator permission metadata win over inferred receipts.
if(process.argv.includes('--discover')) {
  const receiptFile=resolve('.private.local/knowledge/receipts.json')
  const previous=existsSync(receiptFile)?JSON.parse(readFileSync(receiptFile,'utf8')):[]
  const known=new Set(sources.map(s=>resolve(s.path).toLowerCase()))
  const extensions=/\.(md|txt|pdf|docx|zip|json|py)$/i
  function discover(directory, all=false) {
    if(!existsSync(directory))return
    for(const entry of readdirSync(directory,{withFileTypes:true})) {
      const file=join(directory,entry.name)
      if(lstatSync(file).isSymbolicLink())continue
      if(entry.isDirectory()) {
        if(all || /INSPIRE/i.test(entry.name))discover(file,true)
      } else if(extensions.test(entry.name)&&(all||/INSPIRE|MOI|CONTENT_PATCH/i.test(entry.name))) {
        const absolute=resolve(file)
        if(known.has(absolute.toLowerCase()))continue
        known.add(absolute.toLowerCase())
        const id='discovered-'+createHash('sha256').update(absolute.toLowerCase()).digest('hex').slice(0,24)
        const old=previous.find(r=>r.documentId===id)
        sources.push({path:absolute,id,title:entry.name,status:old?.status??'review-required',
          use:old?.permittedUse??'receipt-only',kind:old?.kind??(/MOI/i.test(entry.name)?'operating-rules':'reference'),
          // Keep exact-hash grants only while their original bytes still match.
          ...(old?.permissions && old.permissions.sourceHash===createHash('sha256').update(readFileSync(file)).digest('hex')?{permissions:old.permissions}:{}),
          provenance:{packageHash:'unbundled',relativePath:absolute,declaredVersion:'Original filename and bytes retained; amendments are separate receipts',authority:'Received; discovery grants no permission'}})
      }
    }
  }
  discover(downloads)
  discover(resolve('.private.local/knowledge/inbox'),true)
}
const receipts = []
const oldReceiptFile=resolve('.private.local/knowledge/receipts.json')
const oldReceipts=existsSync(oldReceiptFile)?JSON.parse(readFileSync(oldReceiptFile,'utf8')):[]
for (const original of new Map(sources.map(item=>[item.id,item])).values()) {
  let item=original
  if (!existsSync(item.path)) { receipts.push({documentId: item.id, missing: true}); continue }
  const raw = readFileSync(item.path), hash = createHash('sha256').update(raw).digest('hex')
  const old=oldReceipts.find(row=>row.documentId===item.id)
  if(old&&!item.operatorManifest) {
    item=old.hash===hash?{...item,status:old.status,use:old.permittedUse,kind:old.kind,permissions:old.permissions}:
      {...item,status:'review-required',use:'receipt-only',permissions:undefined}
  }
  if((item.expectedHash&&hash!==item.expectedHash)||(item.expectedBytes!==undefined&&raw.length!==item.expectedBytes))throw Error('Original integrity mismatch: '+item.id)
  const destination = join(rawDir, hash)
  if (!existsSync(destination)) {
    try { writeFileSync(destination,raw,{flag:'wx',mode:0o600}) }
    catch(error){if(error.code!=='EEXIST')throw error}
  }
  if(createHash('sha256').update(readFileSync(destination)).digest('hex')!==hash)throw Error('Private original-copy integrity hold: '+item.id)
  const record = {collection: 'INSPIRE', documentId: item.id, title: item.title,
    status: item.status, permittedUse: item.use, rawFile: hash,
    ...(item.kind?{kind:item.kind}:{}),...(item.provenance?{provenance:item.provenance}:{}),
    ...(item.extraction?{extraction:item.extraction}:{}),...(item.relations?{relations:item.relations}:{}),
    ...(item.contentClass?{contentClass:item.contentClass}:{}),
    ...(item.permissions?{permissions:item.permissions}:{})}
  let extracted
  if(/\.(txt|md)$/i.test(item.path))extracted=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(raw)
  if(item.extractedFile){
    const extractionPath=resolve(item.extractedFile)
    if(!extractionPath.startsWith(resolve('.private.local/knowledge/extracted')+sep))throw Error('Private extraction path required')
    const result=JSON.parse(readFileSync(extractionPath,'utf8'))
    if(result.sourceHash!==hash||createHash('sha256').update(result.text).digest('hex')!==result.textHash)throw Error('Extraction integrity hold')
    extracted=result.text
  }
  if(item.noExtractedContent)extracted=''
  // Keep an immutable local metadata history as well as Firestore versions.
  // Emulator resets must not erase source history or restart version numbering.
  const historyDir=resolve('.private.local/knowledge/history',item.id)
  if(!/^[a-zA-Z][a-zA-Z0-9_-]{0,100}$/.test(item.id))throw Error('Invalid source identity')
  mkdirSync(historyDir,{recursive:true})
  const saveHistory=value=>{
    const bytes=JSON.stringify(value,null,2)
    const file=join(historyDir,createHash('sha256').update(bytes).digest('hex')+'.json')
    if(!existsSync(file))writeFileSync(file,bytes,{flag:'wx',mode:0o600})
  }
  if(old&&!old.missing)saveHistory(old)
  const same=old?.hash===hash&&Object.keys(record).every(key=>
    JSON.stringify(old[key])===JSON.stringify(record[key]))
  const minimumVersion=old?.version?(same?old.version:old.version+1):1
  const result = await importSource(record, raw, extracted,minimumVersion)
  saveHistory({...record,...result,hash})
  receipts.push({...record, ...result, hash})
  console.log(`${item.id}: ${result.changed ? 'imported' : 'unchanged'}, version ${result.version}, ${item.status}`)
}
const receiptFile=resolve('.private.local/knowledge/receipts.json')
const previous=existsSync(receiptFile)?JSON.parse(readFileSync(receiptFile,'utf8')):[]
const merged=new Map(previous.map(row=>[row.documentId,row]))
for(const row of receipts)merged.set(row.documentId,row)
writeFileSync(receiptFile, JSON.stringify([...merged.values()], null, 2))
console.log(JSON.stringify({totalReceipts:merged.size,processed:receipts.length,changed:receipts.filter(r=>r.changed).length,missing:receipts.filter(r=>r.missing).length,externalEligible:receipts.filter(r=>r.status==='published-supporting'&&r.permissions?.externalExport&&r.permissions?.internalResearch&&r.kind!=='operating-rules').length}))
process.exit(0)
