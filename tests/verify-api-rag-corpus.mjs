// Read-only corpus regression against the imported bundle; no inference.
import assert from 'node:assert/strict'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {requireLocalEmulators} from '../functions/src/inspireLocalService.ts'
process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';requireLocalEmulators()
const root='.private.local/inbox/INSPIRE_RAG_API_HANDOFF',sha=s=>createHash('sha256').update(s).digest('hex')
const manifest=JSON.parse(readFileSync(join(root,'SOURCE_MANIFEST.json'),'utf8'))
const parent=manifest.entries.find(e=>e.originalNames.includes('LESSON_CONTENT_458.jsonl'))
const raw=readFileSync(join(root,parent.path));assert.equal(sha(raw),parent.sha256)
const expected=raw.toString('utf8').trim().split(/\r?\n/).map(l=>JSON.parse(l))
assert.equal(expected.length,458);assert.equal(new Set(expected.map(l=>l.lesson_id)).size,458)
const require=createRequire(new URL('../functions/package.json',import.meta.url)),db=require('firebase-admin/firestore').getFirestore()
try {
 const docs=(await db.collection('inspireKnowledge').get()).docs.filter(d=>d.id!=='_index'),byId=new Map(docs.map(d=>[d.id,d.data()]))
 const lessons=docs.filter(d=>d.data().lesson)
 assert.equal(lessons.length,458);assert.equal(new Set(lessons.map(d=>d.data().lesson.lessonId)).size,458)
 for(const l of expected){
  const s=byId.get('lesson-'+l.lesson_id);assert.ok(s,l.lesson_id)
  assert.equal(s.lesson.contentHash,sha(l.content));assert.equal(s.lesson.parentHash,parent.sha256)
  assert.equal(s.hash,parent.sha256);assert.equal(s.lesson.status,'DRAFT');assert.equal(s.status,'review-required')
  assert.equal(s.kind,'reference');assert.equal(s.permissions.runtimeUse,'private-reference-evaluation')
  assert.equal(s.permissions.externalExport,true);assert.equal(s.permissions.sourceHash,s.hash)
  assert.equal(s.extractedText,'# '+l.title+'\n'+l.content)
  assert.ok(s.sections.length>0)
  for(const section of s.sections){assert.equal(section.lesson.lessonId,l.lesson_id);assert.equal(section.sectionHash,sha(section.text));assert.ok(s.permissions.sectionHashes.includes(section.sectionHash))}
 }
 const receipts=JSON.parse(readFileSync('.private.local/knowledge/receipts.json','utf8'))
 const volumes=manifest.entries.filter(e=>e.originalNames.some(n=>/^(CUM_\d+_|DON_VI_\d+_|INSPIRE_MOI_AND_CURRICULA_READABLE)/.test(n)))
 assert.ok(volumes.length>0)
 for(const v of [...volumes,parent]){
  const receipt=receipts.find(r=>r.hash===v.sha256&&!r.lesson);assert.ok(receipt)
  const s=byId.get(receipt.documentId);assert.ok(s);assert.deepEqual(s.sections,[]);assert.equal(s.externalEligible,false);assert.equal(s.internalEligible,false)
 }
 const report={executed:true,lessonIds:458,uniqueLessonIds:458,lessonBodiesAndHashesVerified:458,draftStatusPreserved:true,duplicateVolumeReceipts:volumes.length,duplicateVolumesIndexed:0,docs:docs.length,externallyEligibleDocuments:docs.filter(d=>d.data().externalEligible).length,heldDocuments:docs.filter(d=>!d.data().externalEligible).length,paidCalls:0}
 const out=process.env.INSPIRE_REVIEW_EVIDENCE_DIR||'docs/evidence/api-rag-2026-11-25/resume-final';mkdirSync(out,{recursive:true});writeFileSync(join(out,'corpus-check.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report))
}finally{await db.terminate()}
