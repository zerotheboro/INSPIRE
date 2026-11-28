// Read-only audit/retrieval of the SAME demo emulator used by Vite.
// No dotenv, authentication creation, imports, inference or source mutations.
import {createRequire} from 'node:module'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {requireLocalEmulators} from '../functions/src/inspireLocalService.ts'
import {retrieveKnowledge,assertKnowledgeExport} from '../functions/src/inspireKnowledge.ts'

process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099'
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'
delete process.env.OPENAI_API_KEY
delete process.env.GOOGLE_APPLICATION_CREDENTIALS
requireLocalEmulators()
const require=createRequire(new URL('../functions/package.json',import.meta.url))
const firestore=require('firebase-admin/firestore'),db=firestore.getFirestore()
// Catch accidental test/import writes before the SDK can dispatch them.
let writeAttempts=0
const deny=()=>{writeAttempts++;throw Error('READ_ONLY_CORPUS_INSPECTION')}
for(const name of ['set','create','update','delete'])firestore.DocumentReference.prototype[name]=deny
for(const name of ['runTransaction','batch','bulkWriter','recursiveDelete'])firestore.Firestore.prototype[name]=deny
const fetcher=globalThis.fetch
globalThis.fetch=(url,options)=>{
 const u=new URL(url)
 if(u.hostname!=='127.0.0.1'||!['5173','5174','8080','9099'].includes(u.port)||!['GET',undefined].includes(options?.method))throw Error('LOCAL_READ_ONLY_HTTP_REQUIRED')
 return fetcher(url,options)
}
const output=process.argv[2]??'docs/evidence/corpus-check-2026-11-27'
const hash=value=>createHash('sha256').update(value).digest('hex')
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b))
const summary=rows=>rows.map(({id,data})=>({id,hash:data.hash,version:data.version,
 indexVersion:data.indexVersion,importSignature:data.importSignature,
 sectionsHash:hash(JSON.stringify(data.sections??[])),permissions:data.permissions,
 internalEligible:data.internalEligible,externalEligible:data.externalEligible}))
const snapshot=async()=>{
 const index=await db.doc('inspireKnowledge/_index').get()
 const all=await db.collection('inspireKnowledge').get()
 return {revision:index.exists?index.data().revision:null,
  rows:all.docs.filter(d=>d.id!=='_index').map(d=>({id:d.id,data:d.data()})).sort((a,b)=>a.id.localeCompare(b.id))}
}
const counter=values=>Object.fromEntries([...new Set(values)].map(v=>[String(v),values.filter(x=>x===v).length]))
const ref=section=>({documentId:section.documentId,version:section.version,hash:section.hash,
 sectionId:section.sectionId,sectionHash:section.sectionHash,title:section.title,headingPath:section.headingPath})
try{
 const before=await snapshot(),rows=before.rows,receipts=JSON.parse(readFileSync('.private.local/knowledge/receipts.json','utf8'))
 const ids=new Map(rows.map(r=>[r.id,r.data])),versions=[]
 for(const {id,data}of rows){const version=await db.doc('inspireKnowledge/'+id+'/versions/'+data.version).get();if(!version.exists||version.data().hash!==data.hash)versions.push(id)}
 const sections=rows.flatMap(r=>r.data.sections??[]),bindingProblems=[]
 for(const {id,data}of rows)for(const section of data.sections??[]){if(section.documentId!==id||section.version!==data.version||section.hash!==data.hash||section.sectionHash!==hash(section.text))bindingProblems.push(section.sectionId)}
 const drift=receipts.filter(r=>ids.has(r.documentId)&&(r.hash!==ids.get(r.documentId).hash||r.version!==ids.get(r.documentId).version||r.status!==ids.get(r.documentId).status||!same(r.permissions,ids.get(r.documentId).permissions)||!same(r.lesson,ids.get(r.documentId).lesson))).map(r=>r.documentId)
 const expectedWork=['website-counseling','corpus-cef55cbb7beb4e5fce595063','lesson-C04-06']
 const cases=[
  {name:'direct',messages:[{id:'u1',role:'user',text:'Khoảng cách giữa ý định và hành động là gì khi tôi trì hoãn công việc?'}],expected:expectedWork,reason:'Ít nhất một đoạn về vận hành/hành động hoặc động cơ, động lực.'},
  {name:'paraphrase',messages:[{id:'u1',role:'user',text:'Tôi biết mình nên bắt đầu nhưng cứ chần chừ. Điều gì khiến tôi không làm điều đã định?'}],expected:expectedWork,reason:'Cùng chủ đề hành động dù không lặp đúng tên tài liệu.'},
  {name:'follow-up',messages:[{id:'u1',role:'user',text:'Tôi cứ trì hoãn công việc dù đã có ý định hành động.'},{id:'a1',role:'assistant',text:'Đây chỉ là lời nối hội thoại giả lập, không phải câu trả lời đánh giá.'},{id:'u2',role:'user',text:'Vậy nếu chỉ có ít thời gian thì sao?'}],expected:expectedWork,reason:'Giữ chủ đề công việc từ lượt trước.'},
  {name:'correction',messages:[{id:'u1',role:'user',text:'Tôi muốn hỏi về trì hoãn công việc.'},{id:'a1',role:'assistant',text:'Lời nối hội thoại giả lập.'},{id:'u2',role:'user',text:'Đính chính: tôi muốn tìm hiểu ranh giới và nhu cầu trong quan hệ với người khác.',correctionOf:'u1'}],expected:['website-counseling','corpus-cef55cbb7beb4e5fce595063'],reason:'Đoạn về quan hệ/ranh giới; lời gốc giữ nguyên nhưng không dùng cho query dẫn xuất.'},
  {name:'existing-amendment',messages:[{id:'u1',role:'user',text:'Tài liệu INSPIRE-07-A đính chính nội dung gì?'}],expected:['original-8e9a8623b864c4282dc3d68c'],reason:'Ưu tiên amendment 07-A hiện đã nhận, không suy ra quyền vận hành.'},
 ]
 const tests=[]
 for(const c of cases){
  const original=JSON.stringify(c.messages)
  try{
   const found=await retrieveKnowledge(c.messages,true)
   await assertKnowledgeExport(found)
   const hit=found.some(s=>c.expected.includes(s.documentId))
   tests.push({case:c.name,questions:c.messages,expectedDocumentIds:c.expected,expectation:c.reason,selected:found.map(ref),expectedSourceFound:hit,
    status:!rows.length?'BLOCKED_EMPTY_LIVE_INDEX':hit?'EXPECTED_SOURCE_FOUND':'EXPECTED_SOURCE_NOT_IN_TOP_3',
    historyUnchanged:JSON.stringify(c.messages)===original,boundedTo3:found.length<=3,
    permissionRecheck:found.length?'EXECUTED_FOR_EACH_SELECTED_PASSAGE':'NO_PASSAGE_TO_VALIDATE'})
  }catch(error){tests.push({case:c.name,expectedDocumentIds:c.expected,status:'HELD',code:error.message})}
 }
 const held=[...ids].filter(([,d])=>!d.externalEligible).map(([id])=>id)
 const excluded=tests.flatMap(t=>t.selected??[]).filter(s=>held.includes(s.documentId))
 const after=await snapshot(),unchanged=before.revision===after.revision&&hash(JSON.stringify(summary(before.rows)))===hash(JSON.stringify(summary(after.rows)))
 const http={}
 for(const port of [5173,5174])try{const r=await fetch('http://127.0.0.1:'+port+'/api/inspire-private-status',{signal:AbortSignal.timeout(3000)});http[port]={status:r.status,configuration:await r.json()}}catch{http[port]={running:false}}
 const report={executedAt:new Date().toISOString(),project:'demo-inspire',emulator:'127.0.0.1:8080',readOnly:true,
  revision:before.revision,records:rows.length,sections:sections.length,recordsWithSections:rows.filter(r=>r.data.sections?.length).length,
  internalEligible:rows.filter(r=>r.data.internalEligible).length,externalEligible:rows.filter(r=>r.data.externalEligible).length,
  externallyEligibleSections:rows.filter(r=>r.data.externalEligible).reduce((n,r)=>n+(r.data.sections??[]).filter(s=>!r.data.permissions?.sectionHashes||r.data.permissions.sectionHashes.includes(s.sectionHash)).length,0),
  versions:counter(rows.map(r=>r.data.version)),indexVersions:counter(rows.map(r=>r.data.indexVersion)),versionSnapshotProblems:versions,
  sectionBindingProblems:bindingProblems,receiptDrift:drift,receiptRecords:receipts.length,receiptRecordsAbsent:receipts.filter(r=>!ids.has(r.documentId)).length,
  baselineExternalEligible:513,deltaFrom513:rows.filter(r=>r.data.externalEligible).length-513,
  explanation:!rows.length?'Services were stopped before this audit. No export snapshot found; existing launcher restarted a fresh empty emulator. No source import or index reconstruction was performed. 513 is historical (2026-11-26), not current.':'Compare current record/permission/version details with receipts.',
  amendments:['INSPIRE-07-A','INSPIRE-06-A','INSPIRE-12-A','INSPIRE-13-A','INSPIRE-14-A','INSPIRE-15-A','INSPIRE-MOI-01-A'].map(name=>{
   const matched=rows.filter(r=>[r.data.title,...r.data.aliases??[]].some(n=>new RegExp('(?:^|/)'+name+'(?:_|\\.)','i').test(n)))
   const original=matched.filter(r=>!/(RECONSTRUCTED|PROPOSAL|CHAT_TRANSCRIPTION)/i.test(r.data.title))
   return {claimedId:name,status:!original.length?'BLOCKED_ORIGINAL_NOT_RECEIVED_OR_PENDING':original.some(r=>r.data.externalEligible&&r.data.sections?.length)?'INDEXED_PRIVATE_REFERENCE_ONLY':'BLOCKED_NO_ELIGIBLE_INDEXED_PASSAGE',records:matched.map(r=>({id:r.id,version:r.data.version,hash:r.data.hash,sections:r.data.sections?.length??0,externalEligible:!!r.data.externalEligible}))}
  }),
  docx:ids.get('bundle-a89c8851a5c86033eb487afa')?{version:ids.get('bundle-a89c8851a5c86033eb487afa').version,sections:ids.get('bundle-a89c8851a5c86033eb487afa').sections?.length}:null,
  txt:ids.get('bundle-ab98b70908c73d33467111e3')?{version:ids.get('bundle-ab98b70908c73d33467111e3').version,sections:ids.get('bundle-ab98b70908c73d33467111e3').sections?.length}:null,
  retrieval:tests,restrictedSelections:excluded,writeAttempts,indexUnchangedDuringInspection:unchanged,
  modelCalls:0,grantChanges:false,permissionsChanged:false,localhost:http}
 mkdirSync(output,{recursive:true});writeFileSync(output+'/live-index.json',JSON.stringify(report,null,2)+'\n')
 console.log(JSON.stringify({records:report.records,sections:report.sections,externalEligible:report.externalEligible,deltaFrom513:report.deltaFrom513,revision:report.revision,indexUnchanged:unchanged,writeAttempts,modelCalls:0,cases:tests.map(t=>({case:t.case,status:t.status,selected:t.selected?.map(s=>s.documentId)}))},null,2))
}finally{await db.terminate()}
