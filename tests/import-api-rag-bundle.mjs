// Operator-only owner-directed private RAG merge. No inference or live release.
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs'
import {resolve,join,sep} from 'node:path'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {TextDecoder} from 'node:util'
import {createRequire} from 'node:module'
import {requireLocalEmulators} from '../functions/src/inspireLocalService.ts'
import {importSource,deriveSections} from '../functions/src/inspireKnowledge.ts'
process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';requireLocalEmulators()
const root=resolve('.private.local/inbox/INSPIRE_RAG_API_HANDOFF'),privateRoot=resolve('.private.local/knowledge')
const sha=b=>createHash('sha256').update(b).digest('hex')
const manifestBytes=readFileSync(join(root,'SOURCE_MANIFEST.json')),manifest=JSON.parse(manifestBytes),taskHash=sha(readFileSync(join(root,'CODEX_API_RAG_TASK.md')))
const receiptsPath=join(privateRoot,'receipts.json'),old=JSON.parse(readFileSync(receiptsPath,'utf8')),merged=new Map(old.map(r=>[r.documentId,r])),byHash=new Map(old.filter(r=>r.hash).map(r=>[r.hash,r]))
const require=createRequire(new URL('../functions/package.json',import.meta.url)),db=require('firebase-admin/firestore').getFirestore()
const report={verifiedPayloads:0,imported:0,unchanged:0,lessons:0,eligible:0,held:[],errors:[],references:[],decision:{authority:'Owner request 2026-11-25: execute CODEX_API_RAG_TASK.md section 2; private reference research/export only',taskHash,manifestHash:sha(manifestBytes),actualPermissionIssued:false,liveAllowanceIssued:false}}
const evidence=JSON.stringify(report.decision)
const rawDir=join(privateRoot,'raw');mkdirSync(rawDir,{recursive:true})
const historyDir=join(privateRoot,'history');mkdirSync(historyDir,{recursive:true})
async function put(record,raw,text,grant){
 const hash=sha(raw),prior=merged.get(record.documentId)
 const source={...record,hash,version:prior?.version||1}
 const sections=text?deriveSections(source,text):[]
 if(grant&&sections.length){record.permittedUse='supporting-retrieval';record.permissions={sourceHash:hash,internalResearch:true,externalExport:true,evidence,runtimeUse:'private-reference-evaluation',sectionHashes:sections.map(s=>s.sectionHash)}}
 const minimum=prior?.version||1
 const result=await importSource(record,raw,text,minimum)
 const row={...record,hash,...result};merged.set(record.documentId,row)
 const dir=join(historyDir,record.documentId);mkdirSync(dir,{recursive:true});for(const r of [prior,row].filter(Boolean)){const bytes=JSON.stringify(r,null,2);const file=join(dir,sha(bytes)+'.json');if(!existsSync(file))writeFileSync(file,bytes,{flag:'wx'})}
 result.changed?report.imported++:report.unchanged++
 if(grant&&sections.length){report.eligible++;report.references.push({documentId:record.documentId,hash,version:result.version,sections:sections.length})}
}
const entries=manifest.entries
for(const row of entries){
 const file=resolve(root,row.path);if(!file.startsWith(root+sep))throw Error('BUNDLE_PATH_HOLD')
 const raw=readFileSync(file);if(sha(raw)!==row.sha256||raw.length!==row.bytes)throw Error('BUNDLE_INTEGRITY_HOLD')
 report.verifiedPayloads++
 const rawFile=join(rawDir,row.sha256);if(!existsSync(rawFile))writeFileSync(rawFile,raw,{flag:'wx'})
 const prior=byHash.get(row.sha256),name=row.originalNames[0],title=name
 const id=prior?.documentId||'bundle-'+sha(row.origins[0]).slice(0,24)
 const record={collection:'INSPIRE',documentId:id,title:prior?.title||title,status:prior?.status||'review-required',permittedUse:'receipt-only',rawFile:row.sha256,kind:'reference',contentClass:'content',aliases:[...new Set([...(prior?.aliases||[]),...row.originalNames])],origins:[...new Set([...(prior?.origins||[]),...row.origins])],provenance:{packageHash:sha(manifestBytes),relativePath:row.path,declaredVersion:(row.headerVersionMentions||[]).join('; ')||'Original bytes/header retained',authority:row.semanticApproval+'; '+row.role}}
 const isLesson=row.originalNames.includes('LESSON_CONTENT_458.jsonl')
 const volume=/^(CUM_\d+_|DON_VI_\d+_|INSPIRE_MOI_AND_CURRICULA_READABLE)/.test(name)
 const governance=/MOI|OSP|RDS|CSS|DPC|PEC|WORK|OWNER_|GENESIS|POLICY|QUY_TAC|QUYEN|CAPABILITY|SAFETY|APPROVAL|RUNTIME|CONTRACT/i.test(name)
 const management=/REGISTER|REGISTRY|MANIFEST|INDEX|CATALOG|COVERAGE|README|SHA256|PROVENANCE|MISSING|DUPLICATE|HANDOFF|PASTE_INTO|WORK_NHAN|QUYEN|SCORER|SYNTHETIC_CASE|TEXT_TRANSFER|RECOVERY|STATUS|PENDING|SEARCH_SCOPE|HISTORICAL|SOURCE_INTEGRITY|EXCLUDED|BATCH_INTAKE|VERSION_MATRIX|CHAT_TRANSCRIPTION_CHECKS|^0[1-9]_|^1[0-4]_/i.test(name)
 if(isLesson){
  const lessons=raw.toString('utf8').split(/\r?\n/).filter(Boolean).map(l=>JSON.parse(l)),seen=new Set()
  for(const lesson of lessons){
   if(seen.has(lesson.lesson_id)||!/^[A-Z0-9-]+$/.test(lesson.lesson_id)||typeof lesson.content!=='string'||sha(lesson.content)!==lesson.content_sha256)throw Error('LESSON_INTEGRITY_HOLD')
   seen.add(lesson.lesson_id)
   const lr={...record,documentId:'lesson-'+lesson.lesson_id,title:lesson.lesson_id+' · '+lesson.title,status:'review-required',lesson:{lessonId:lesson.lesson_id,moduleId:lesson.module_id,kind:lesson.kind,contentHash:lesson.content_sha256,parentHash:row.sha256,status:'DRAFT'}}
   await put(lr,raw,'# '+lesson.title+'\n'+lesson.content,true);report.lessons++
  }
  report.held.push({documentId:id,reason:'JSONL parent preserved; individual lessons indexed'});await put({...record,contentClass:'receipt'},raw,'',false);continue
 }
 let text=''
 try{
  if(!volume&&!management&&!governance){
   if(/\.(md|txt)$/i.test(row.path))text=new TextDecoder('utf-8',{fatal:true}).decode(raw)
   else if(/\.docx$/i.test(row.path)){
    const code="import sys,importlib.util; from pathlib import Path; s=importlib.util.spec_from_file_location('x',Path('tests/extract-inspire-corpus.py')); m=importlib.util.module_from_spec(s);s.loader.exec_module(m);print(m.extract(Path(sys.argv[1]).read_bytes(),'.docx')[0],end='')"
    const r=spawnSync(resolve('.tools.local/python312/python.exe'),['-X','utf8','-c',code,file],{encoding:'utf8',maxBuffer:1000000,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});if(r.status!==0)throw Error('DOCX_EXTRACTION_FAILED');text=r.stdout
   }
  }
  if(governance){record.kind='operating-rules';report.held.push({documentId:id,reason:'Governance/operating text retained; not authorized operating instructions'})}
  else if(volume||management||!text){record.contentClass='receipt';report.held.push({documentId:id,reason:volume?'Duplicate curriculum volume; lesson records indexed':'Management/register/non-content receipt'})}
  await put(record,raw,text,!!text&&!governance&&!management&&!volume)
 }catch(e){report.errors.push({documentId:id,error:e.message});throw e}
}
// Existing local content outside the bundle remains part of the owner scope.
for(const prior of old){
 if(entries.some(r=>r.sha256===prior.hash)||!prior.hash||prior.kind==='operating-rules'||(prior.contentClass&&prior.contentClass!=='content'))continue
 const snapshot=await db.doc('inspireKnowledge/'+prior.documentId).get(),s=snapshot.data()
 if(!s?.sections?.length||/CONTENT.PATCH|MOI.*RECONSTRUCT/i.test(prior.title)){report.held.push({documentId:prior.documentId,reason:'Specific draft/proposal restriction or no index content'});continue}
 const {version,hash,changed,...record}=prior;void version;void hash;void changed
 await put(record,readFileSync(join(rawDir,prior.rawFile)),s.extractedText,true)
}
writeFileSync(receiptsPath,JSON.stringify([...merged.values()],null,2))
writeFileSync(join(privateRoot,'api-rag-import-report.json'),JSON.stringify(report,null,2))
writeFileSync(join(privateRoot,'owner-api-rag-scope.json'),JSON.stringify(report.decision,null,2))
console.log(JSON.stringify({verified:report.verifiedPayloads,changed:report.imported,unchanged:report.unchanged,lessons:report.lessons,eligible:report.eligible,held:report.held.length,errors:report.errors.length}))
await db.terminate()
