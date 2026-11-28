// Offline, in-memory query fixtures. The real retrieval function runs, but
// Firestore reads are intercepted. No source, permission or index writes.
import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {createHash,randomUUID} from 'node:crypto'
import {words,deriveSections,retrieveKnowledge} from '../functions/src/inspireKnowledge.ts'
import {requireLocalEmulators} from '../functions/src/inspireLocalService.ts'
import {prepareLunaApi} from '../functions/src/inspireLunaApi.ts'
import {emptyPreferences} from '../functions/src/inspireAccount.ts'
process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';requireLocalEmulators()
const require=createRequire(new URL('../functions/package.json',import.meta.url)),sdk=require('firebase-admin/firestore')
const sha=v=>createHash('sha256').update(v).digest('hex')
let revision=10000
const message=(id,text,correctionOf)=>({id,role:'user',text,...(correctionOf?{correctionOf}:{})})
function source(title,text,overrides={}){
 const hash=sha(text),record={collection:'INSPIRE',documentId:'fixture-'+randomUUID(),title,version:1,hash,status:'published-supporting',permittedUse:'supporting-retrieval',kind:'reference',contentClass:'content',rawFile:hash,...overrides}
 const sections=deriveSections(record,text)
 return {...record,sections,internalEligible:true,externalEligible:true,searchTerms:words(title+' '+text),externalSearchTerms:words(title+' '+text),permissions:{sourceHash:hash,internalResearch:true,externalExport:true,evidence:'SYNTHETIC OFFLINE FIXTURE ONLY',sectionHashes:sections.map(s=>s.sectionHash),...overrides.permissions}}
}
function fixture(t,rows){
 const state={rows,revision:++revision,pages:[]}
 class Query{
  constructor(filters=[],limit=Infinity,cursor=''){this.filters=filters;this.n=limit;this.cursor=cursor}
  where(field,op,value){return new Query([...this.filters,{field,op,value}],this.n,this.cursor)}
  orderBy(){return this} select(){return this}
  limit(n){return new Query(this.filters,n,this.cursor)}
  startAfter(doc){return new Query(this.filters,this.n,doc.id)}
  async get(){
   const selected=state.rows.filter(r=>r.documentId>this.cursor&&this.filters.every(({field,op,value})=>op==='=='?r[field]===value:op==='array-contains-any'&&r[field]?.some(x=>value.includes(x)))).sort((a,b)=>a.documentId.localeCompare(b.documentId)).slice(0,this.n)
   state.pages.push(selected.map(r=>r.documentId));return {size:selected.length,docs:selected.map(r=>({id:r.documentId,data:()=>r}))}
  }
 }
 t.mock.method(sdk.Firestore.prototype,'collection',function(path){assert.equal(path,'inspireKnowledge');return new Query()})
 t.mock.method(sdk.DocumentReference.prototype,'get',async function(){assert.equal(this.path,'inspireKnowledge/_index');return {data:()=>({revision:state.revision}),exists:true}})
 return state
}
test('natural follow-up retains the relevant earlier topic without matching a prewritten question',async t=>{
 const plant=source('Cây cam sành','# Cây cam sành\nCây cam sành bị vàng lá do đất ngập nước; rễ cần thoát nước.'),time=source('Thời gian','# Thời gian\nNếu chỉ còn ít thời gian thì cần sắp xếp thời gian. Nếu ít thời gian thì sao?')
 fixture(t,[time,plant])
 const history=[message('u1','Cây cam sành bị vàng lá do đất ngập nước thì làm sao thoát nước cho rễ?'),{id:'a1',role:'assistant',text:'Lời nối tổng hợp, không phải mô hình.'},message('u2','Vậy nếu chỉ có ít thời gian thì sao?')],before=JSON.stringify(history)
 assert.equal((await retrieveKnowledge(history,true))[0].documentId,plant.documentId)
 history.push({id:'a2',role:'assistant',text:'Lời nối tổng hợp.'},message('u3','Bạn nói rõ thêm được không?'))
 assert.equal((await retrieveKnowledge(history,true))[0].documentId,plant.documentId)
 assert.equal(JSON.stringify(history.slice(0,3)),before)
})
test('correction removes superseded intent only from query; ordered original history and both roles reach adapter',async t=>{
 const plant=source('Cam sành','# Cam sành\nCây cam sành vàng lá do đất ngập nước; rễ cần thoát nước.'),book=source('Truyện lịch sử','# Truyện lịch sử\nSách văn học và truyện lịch sử giúp tìm hiểu nhân vật.'),time=source('Thời gian','# Thời gian\nNếu chỉ có ít thời gian thì sao?')
 fixture(t,[plant,book,time])
 const history=[message('u1','Cây cam sành vàng lá do đất ngập nước.'),{id:'a1',role:'assistant',text:'Lời nối tổng hợp.'},message('u2','Đính chính: Tôi hỏi về sách văn học, truyện lịch sử và nhân vật.','u1')],before=JSON.stringify(history)
 const selected=await retrieveKnowledge(history,true);assert.equal(selected[0].documentId,book.documentId);assert.ok(selected.every(s=>s.documentId!==plant.documentId))
 const request={kind:'send',epoch:'offline',sessionId:'offline',conversationId:'offline',operationId:'offline',messages:history}
 const prepared=prepareLunaApi({messages:history,operatingInstructions:[],userStatedPreferences:emptyPreferences,supportingKnowledge:selected},request,true)
 assert.equal(JSON.stringify(history),before);assert.deepEqual(prepared.payload.input.slice(1),history.map(m=>({role:m.role,content:m.text})))
 assert.deepEqual(JSON.parse(prepared.payload.input[0].content).corrections,[{messageId:'u2',correctionOf:'u1'}])
})
test('exact references use self identity, not a passage mention or parent link; no implicit replacement',async t=>{
 const base=source('sources/INSPIRE-83.txt','# Bản chính\nNguồn giả định chính.'),amend=source('sources/INSPIRE-83-C.txt','# Bổ sung\nNguồn giả định bổ sung. Liên kết INSPIRE-83.',{relations:{family:'INSPIRE-83',amendment:true,relatedIds:['INSPIRE-83'],authority:'UNVERIFIED SYNTHETIC RELATION'}}),mention=source('Một bài khác','# Tham chiếu\nINSPIRE-83-C được nhắc nhiều lần, nguồn INSPIRE-83-C, bản INSPIRE-83-C.')
 fixture(t,[base,mention,amend])
 assert.deepEqual((await retrieveKnowledge('Xin giải thích INSPIRE-83-C.',true)).map(s=>s.documentId),[amend.documentId])
 assert.deepEqual((await retrieveKnowledge('Xin giải thích INSPIRE-83.',true)).map(s=>s.documentId),[base.documentId])
 const history=[message('u1','Tôi muốn xem INSPIRE-83-C.'),{id:'a1',role:'assistant',text:'Lời nối tổng hợp.'},message('u2','Nội dung này có nghĩa gì?')]
 assert.equal((await retrieveKnowledge(history,true))[0].documentId,amend.documentId)
 history.push({id:'a2',role:'assistant',text:'Lời nối.'},message('u3','Đính chính: tôi muốn xem INSPIRE-83.','u1'))
 assert.equal((await retrieveKnowledge(history,true))[0].documentId,base.documentId)
})
test('identifiers late in eligible pagination remain findable; no hardcoded ID, question or candidate cap',async t=>{
 const rows=Array.from({length:61},(_,i)=>source('Nội dung giả '+i,'# Không liên quan\nMột đoạn tham khảo độc lập.',{documentId:'a-page-'+String(i).padStart(3,'0')})),last=source('archive/INSPIRE-124-B_v9.1.md','# Amendment tổng hợp\nNguồn giả định ở trang cuối.',{documentId:'z-last-reference'})
 const state=fixture(t,[...rows,last])
 assert.deepEqual((await retrieveKnowledge('INSPIRE–124–B',true)).map(s=>s.documentId),[last.documentId])
 assert.equal(state.pages.length,2);assert.equal(new Set(state.pages.flat()).size,62)
})
test('missing or restricted exact amendment does not fall back to another document or gain export rights',async t=>{
 const mention=source('Hướng dẫn tổng hợp','# Nội dung giả\nINSPIRE-92-Z có thể được nhắc trong văn bản này.'),denied=source('INSPIRE-91-D.txt','# Bản chưa được xuất\nDữ liệu giả restricted.',{permissions:{externalExport:false}}),rules=source('INSPIRE-90-A.txt','# Quy tắc giả\nKhông có quyền vận hành.',{kind:'operating-rules'})
 fixture(t,[mention,denied,rules])
 for(const reference of ['INSPIRE-92-Z','INSPIRE-91-D','INSPIRE-90-A'])assert.deepEqual(await retrieveKnowledge(reference,true),[])
})
test('permission revision invalidates exact-reference cache without rewriting the source',async t=>{
 const row=source('INSPIRE-89-B.txt','# Dữ liệu giả\nNội dung reference.'),state=fixture(t,[row])
 assert.equal((await retrieveKnowledge('INSPIRE-89-B',true)).length,1)
 row.permissions.externalExport=false;state.revision++
 assert.deepEqual(await retrieveKnowledge('INSPIRE-89-B',true),[])
})
test('explicit topic change drops the old reference only from the derived query',async t=>{
 const old=source('INSPIRE-82-A.txt','# Bổ sung giả\nNội dung tham khảo một chủ đề khác.'),plant=source('Cam sành','# Cam sành\nCây cam sành vàng lá do đất ngập nước; rễ cần thoát nước.')
 fixture(t,[old,plant])
 const history=[message('u1','Xin giải thích INSPIRE-82-A.'),{id:'a1',role:'assistant',text:'Lời nối giả lập.'},message('u2','Chuyển sang cây cam sành vàng lá do đất ngập nước và cách thoát nước cho rễ.')],before=JSON.stringify(history)
 const found=await retrieveKnowledge(history,true)
 assert.equal(found[0].documentId,plant.documentId);assert.ok(found.every(s=>s.documentId!==old.documentId));assert.equal(JSON.stringify(history),before)
})
test.after(async()=>sdk.getFirestore().terminate())
