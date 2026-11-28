// Real demo Firestore pagination + deterministic concurrent revision changes.
import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {randomUUID,createHash} from 'node:crypto'
import {requireLocalEmulators} from '../functions/src/inspireLocalService.ts'
import {deriveSections,words,retrieveKnowledge,importSource} from '../functions/src/inspireKnowledge.ts'
process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';requireLocalEmulators()
const require=createRequire(new URL('../functions/package.json',import.meta.url)),firestore=require('firebase-admin/firestore'),{Query,FieldValue}=require('@google-cloud/firestore'),db=firestore.getFirestore()
const prefix='pagination-'+randomUUID(),marker='zzpage'+randomUUID().replaceAll('-',''),ids=[]
const sha=s=>createHash('sha256').update(s).digest('hex')
function data(id,text,allowed=true){
 const hash=sha(text),source={collection:'INSPIRE',documentId:id,version:1,hash,title:'Synthetic private source',rawFile:hash,status:'published-supporting',permittedUse:'supporting-retrieval',kind:'reference',permissions:{sourceHash:hash,internalResearch:true,externalExport:allowed,evidence:'SYNTHETIC ONLY'}}
 return {...source,sections:deriveSections(source,text),searchTerms:words(text),externalSearchTerms:allowed?words(text):[],externalEligible:allowed,internalEligible:true}
}
async function seed(){const batch=db.batch();for(let i=0;i<61;i++){const id=prefix+'-'+String(i).padStart(3,'0');ids.push(id);batch.set(db.doc('inspireKnowledge/'+id),data(id,marker+(i===60?' zlastpagebest zlastpagerare':' filler')))}const denied=prefix+'-denied';ids.push(denied);batch.set(db.doc('inspireKnowledge/'+denied),data(denied,marker+' zlastpagebest zlastpagerare',false));batch.set(db.doc('inspireKnowledge/_index'),{revision:FieldValue.increment(1)},{merge:true});await batch.commit()}
test('eligible source after first page is selected; no repeats/skips and tied ranking is stable',async t=>{
 await seed();const pages=[];const get=Query.prototype.get
 t.mock.method(Query.prototype,'get',async function(...args){const result=await get.apply(this,args);if(result.docs.some(d=>d.id.startsWith(prefix)))pages.push(result.docs.map(d=>d.id));return result})
 const query=marker+' zlastpagebest zlastpagerare',a=await retrieveKnowledge(query,true)
 assert.equal(a[0].documentId,prefix+'-060');assert.equal(a.length,3);assert.ok(a.every(s=>!s.documentId.endsWith('-denied')))
 const scanned=pages.flat();assert.equal(scanned.length,61);assert.equal(new Set(scanned).size,61);assert.deepEqual(scanned,[...scanned].sort())
 assert.deepEqual(await retrieveKnowledge(query,true),a)
 await db.doc('inspireKnowledge/_index').set({revision:FieldValue.increment(1)},{merge:true})
 assert.deepEqual(await retrieveKnowledge(query,true),a)
})
test('permission update between pages rejects mixed revision and does not poison cache',async t=>{
 const get=Query.prototype.get;let changed=false
 t.mock.method(Query.prototype,'get',async function(...args){const result=await get.apply(this,args);if(!changed&&result.size===50&&result.docs.some(d=>d.id.startsWith(prefix))){changed=true;const id=prefix+'-060',text=marker+' zlastpagebest zlastpagerare';await importSource({collection:'INSPIRE',documentId:id,title:'Revoked fixture',rawFile:sha(text),status:'review-required',permittedUse:'receipt-only',kind:'reference'},Buffer.from(text),text)}return result})
 await assert.rejects(retrieveKnowledge(marker+' zlastpagebest',true),/REVISION_CHANGED/)
 assert.equal(changed,true)
 const next=await retrieveKnowledge(marker+' zlastpagebest',true);assert.ok(next.every(s=>s.documentId!==prefix+'-060'));assert.ok(next.length<=3)
})
test('natural Vietnamese follow-up and explicit correction preserve topic relevance without query markers',async()=>{
 const orchid=prefix+'-orchid',tomato=prefix+'-tomato';ids.push(orchid,tomato)
 for(const [id,text] of [[orchid,'# Lan hồ điệp\nLan hồ điệp bị úng rễ khi tưới nhiều nước. Tưới ít lại và kiểm tra rễ giúp tránh úng rễ.'],[tomato,'# Cây cà chua\nCây cà chua có lá vàng do thiếu dinh dưỡng. Kiểm tra lá vàng và dinh dưỡng của cây cà chua.']]){const d=data(id,text);const {version,hash,sections,searchTerms,externalSearchTerms,externalEligible,internalEligible,...record}=d;await importSource(record,Buffer.from(text),text)}
 const original='Lan hồ điệp bị úng rễ khi tưới nhiều nước thì nên làm gì?'
 const messages=[{id:'u1',role:'user',text:original},{id:'a1',role:'assistant',text:'Bạn muốn nói rõ hơn không?'},{id:'u2',role:'user',text:'Vậy tưới ít lại có giúp tránh úng rễ không?'}]
 assert.equal((await retrieveKnowledge(messages,true))[0].documentId,orchid)
 const corrected=[...messages,{id:'a2',role:'assistant',text:'Có thêm chi tiết nào cần sửa không?'},{id:'u3',role:'user',text:'Đính chính: cây cà chua có lá vàng do thiếu dinh dưỡng.',correctionOf:'u1'},{id:'a3',role:'assistant',text:'Đã ghi nhận.'},{id:'u4',role:'user',text:'Đính chính: tôi hỏi về lá vàng và dinh dưỡng của cây cà chua.',correctionOf:'u2'}]
 const found=await retrieveKnowledge(corrected,true);assert.equal(found[0].documentId,tomato);assert.ok(found.every(s=>s.documentId!==orchid));assert.equal(corrected[0].text,original)
})
test('wide local query preserves late-page relevance, filtering, revision consistency and cache revocation',async t=>{
 const id='zzwide-'+randomUUID(),denied=id+'-denied',text=marker+' zzwidealpha zzwidebeta zzwidegamma'
 ids.push(id,denied)
 for(const [key,allowed] of [[id,true],[denied,false]])await db.doc('inspireKnowledge/'+key).set(data(key,text,allowed))
 await db.doc('inspireKnowledge/_index').set({revision:FieldValue.increment(1)},{merge:true})
 const first=await retrieveKnowledge(text,true)
 assert.equal(first[0].documentId,id);assert.ok(first.every(s=>s.documentId!==denied));assert.ok(first.length<=3)
 assert.deepEqual(await retrieveKnowledge(text,true),first)
 await db.doc('inspireKnowledge/_index').set({revision:FieldValue.increment(1)},{merge:true})
 const get=Query.prototype.get;let revoked=false
 t.mock.method(Query.prototype,'get',async function(...args){const page=await get.apply(this,args);if(!revoked&&page.size===50){revoked=true;await importSource({collection:'INSPIRE',documentId:id,title:'Revoked wide-query fixture',rawFile:sha(text),status:'review-required',permittedUse:'receipt-only',kind:'reference'},Buffer.from(text),text)}return page})
 await assert.rejects(retrieveKnowledge(text,true),/REVISION_CHANGED/)
 assert.equal(revoked,true)
 const next=await retrieveKnowledge(text,true)
 assert.ok(next.every(s=>s.documentId!==id&&s.documentId!==denied));assert.ok(next.length<=3)
})

test.after(async()=>{for(const id of ids)await db.recursiveDelete(db.doc('inspireKnowledge/'+id));await db.doc('inspireKnowledge/_index').set({revision:FieldValue.increment(1)},{merge:true});await db.terminate()})
