// Rehydrate a stopped demo emulator from existing private receipts, originals
// and extraction records. No discovery, source decisions or version promotion.
import {readFileSync,existsSync,writeFileSync,mkdirSync} from 'node:fs'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
import {TextDecoder} from 'node:util'
import {createRequire} from 'node:module'
import {requireLocalEmulators} from '../functions/src/inspireLocalService.ts'
import {importSource,knowledgeReadiness} from '../functions/src/inspireKnowledge.ts'
process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';requireLocalEmulators()
const root='.private.local/knowledge',rows=JSON.parse(readFileSync(join(root,'receipts.json'),'utf8')),sha=b=>createHash('sha256').update(b).digest('hex'),lessons=new Map(),rawCache=new Map()
const require=createRequire(new URL('../functions/package.json',import.meta.url)),db=require('firebase-admin/firestore').getFirestore()
const output=process.argv[2]??'docs/evidence/rag-restore-2026-11-27'
const report={restored:0,unchanged:0,held:0,failures:[],missingExtraction:[],intentionalReceiptOnly:[],permissionsChanged:false,versionsPromoted:false,providerCalls:0}
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b))
try{
 const prepared=[]
 // Verify all existing files before starting the write phase. Never discover
 // sources, reopen the ZIP, manufacture extraction, or replace a live version.
 for(const row of rows){
  if(row.missing||!row.hash||!row.rawFile||row.collection!=='INSPIRE'){report.failures.push({id:row.documentId,reason:'RECEIPT_INCOMPLETE'});continue}
  const path=join(root,'raw',row.rawFile)
  if(!existsSync(path)){report.failures.push({id:row.documentId,reason:'RAW_MISSING'});continue}
  if(!rawCache.has(row.hash)){const bytes=readFileSync(path);if(sha(bytes)!==row.hash)throw Error('RAW_INTEGRITY_HOLD');rawCache.set(row.hash,bytes)}
  const raw=rawCache.get(row.hash)
  const {hash,version,changed,missing,...record}=row
  let text=''
  const extracted=join(root,'extracted',row.hash+'.json')
  if(row.lesson){
   if(!lessons.has(row.hash))lessons.set(row.hash,new Map(raw.toString('utf8').trim().split(/\r?\n/).map(line=>{const l=JSON.parse(line);return[l.lesson_id,l]})))
   const lesson=lessons.get(row.hash).get(row.lesson.lessonId)
   if(!lesson||sha(lesson.content)!==row.lesson.contentHash)throw Error('LESSON_INTEGRITY_HOLD')
   text='# '+lesson.title+'\n'+lesson.content
  }else if(existsSync(extracted)){
   const x=JSON.parse(readFileSync(extracted,'utf8'))
   if(x.sourceHash!==row.hash||sha(x.text)!==x.textHash)throw Error('EXTRACTION_INTEGRITY_HOLD')
   text=x.text
  }else if(row.contentClass==='content'&&row.kind!=='operating-rules'){
   const names=[row.title,...(row.aliases||[])]
   if(names.some(name=>/\.(md|txt)$/i.test(name)))text=new TextDecoder('utf-8',{fatal:true}).decode(raw)
  }
  if(!text){
   const warning={id:row.documentId,title:row.title,hash:row.hash,reason:'NO_CACHED_OR_DIRECT_TEXT; raw and metadata retained, no sections invented'}
   if(row.permissions?.externalExport&&row.contentClass==='content'&&row.kind!=='operating-rules')report.missingExtraction.push(warning)
   else report.intentionalReceiptOnly.push(warning)
  }
  prepared.push({row,record,raw,text})
 }
 const prior=(await db.collection('inspireKnowledge').get()).docs.filter(d=>d.id!=='_index')
 const current=new Map(prior.map(d=>[d.id,d.data()]))
 for(const {row}of prepared){const old=current.get(row.documentId);if(old&&(old.hash!==row.hash||old.version!==row.version||!same(old.permissions,row.permissions)))report.failures.push({id:row.documentId,reason:'LIVE_VERSION_OR_PERMISSION_CONFLICT'})}
 if(report.failures.length)throw Error('RESTORE_PREFLIGHT_HOLD')
 await db.doc('inspireKnowledge/_index').set({restoreStatus:'restoring',expectedRecords:prepared.length},{merge:true})
 for(const {row,record,raw,text}of prepared){
  const r=await importSource(record,raw,text,row.version||1)
  if(r.version!==(row.version||1))throw Error('UNEXPECTED_RESTORE_VERSION_CHANGE')
  r.changed?report.restored++:report.unchanged++
  if(!row.permissions?.externalExport)report.held++
 }
 const actual=(await db.collection('inspireKnowledge').get()).docs.filter(d=>d.id!=='_index')
 const byId=new Map(actual.map(d=>[d.id,d.data()]))
 for(const row of rows){const s=byId.get(row.documentId);if(!s||s.hash!==row.hash||s.version!==row.version||s.status!==row.status||!same(s.permissions,row.permissions)||!same(s.lesson,row.lesson))throw Error('RESTORE_EXACT_METADATA_HOLD')}
 await db.doc('inspireKnowledge/_index').set({restoreStatus:'ready',restoreCompletedAt:new Date().toISOString(),missingExtractionCount:report.missingExtraction.length},{merge:true})
 report.live=await knowledgeReadiness()
}catch(error){report.failures.push({reason:error.message});throw error}
finally{await db.terminate();mkdirSync(output,{recursive:true});writeFileSync(join(output,'index-restore.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({restored:report.restored,unchanged:report.unchanged,held:report.held,missingExtraction:report.missingExtraction,failures:report.failures,live:report.live,providerCalls:0}))}
