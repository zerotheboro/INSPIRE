// Read-only source selection. Writes a proposal, never permissions or a grant.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {join} from 'node:path'
import {deriveSections} from '../functions/src/inspireKnowledge.ts'
const out=process.env.INSPIRE_REVIEW_EVIDENCE_DIR||'docs/evidence/knowledge-chat-2026-11-24'
const privateOut='.private.local/knowledge-chat-20261124'
mkdirSync(out,{recursive:true});mkdirSync(privateOut,{recursive:true})
const sha=b=>createHash('sha256').update(b).digest('hex')
const receipts=JSON.parse(readFileSync('.private.local/knowledge/receipts.json','utf8'))
const verified=receipts.filter(r=>!r.missing).map(r=>{
 const bytes=readFileSync(join('.private.local/knowledge/raw',r.rawFile))
 if(sha(bytes)!==r.hash)throw Error('SOURCE_BYTES_CHANGED:'+r.documentId)
 return {...r,bytes}
})
// A limited conceptual-reference proposal, NOT the entire INSPIRE library.
// Existing drafts/amendments/superseded versions remain stored and restricted.
const choices=[
 ['INSPIRE-02.txt',/^([456])\. /],
 ['INSPIRE-07.txt',/Định nghĩa chính thức đề xuất/i],
 ['INSPIRE-08.txt',/Định nghĩa chính thức đề xuất/i],
 ['INSPIRE-09.txt',/Định nghĩa chính thức đề xuất/i],
 ['INSPIRE-10.txt',/Định nghĩa chính thức đề xuất|6\. Một lõi quan trọng/i],
 ['INSPIRE-11_v2.txt',/ĐỊNH NGHĨA CHÍNH THỨC ĐỀ XUẤT/i],
 ['INSPIRE-12.txt',/ĐỊNH NGHĨA CHÍNH THỨC ĐỀ XUẤT/i],
 ['website-counseling',null],
]
const passages=[],selected=choices.map(([name,pattern])=>{
 const r=verified.find(r=>r.documentId===name||r.title.endsWith('/'+name))
 if(!r)throw Error('MISSING_PROPOSED_SOURCE:'+name)
 const body=r.bytes.toString('utf8'),sections=deriveSections(r,body).filter(s=>!pattern||s.headingPath.some(h=>pattern.test(h)))
 if(!sections.length)throw Error('MISSING_PROPOSED_SECTION:'+name)
 passages.push(...sections)
 const statusLine=body.split(/\r?\n/).find(s=>/\*\*Trạng thái/.test(s))||'No editorial approval inferred'
 const declaredVersion=body.match(/\*\*Phiên bản:\*\*\s*([^\r\n]+)/)?.[1]?.replace(/\\/g,'').trim()||'Not declared in header'
 return {documentId:r.documentId,title:r.title,receiptVersion:r.version,declaredVersion,sha256:r.hash,
  status:r.status,permittedUse:r.permittedUse,permissions:r.permissions??null,editorialStatus:statusLine,
  proposedRole:'reference only; never operating rules, classification or intervention permission',
  proposedUse:'private synthetic evaluation; external export of selected relevant sections only',
  sections:sections.map(({text,...reference})=>reference)}
})
const proposal={collectionId:'father-reference-concepts-v1',approved:false,sourceHashesVerified:true,
 verifiedReceiptCount:verified.length,scope:'8 sources, not the entire INSPIRE corpus; existing statuses unchanged',
 maximumPerTurn:{passages:3,charactersPerPassage:1400,totalCharacters:4200},
 unresolved:['Individual sources remain editorial proposals/review-required where recorded.',
  'Owner has not permitted internal runtime research or external export for this collection.',
  'Amendments and operating documents are not silently absorbed into the selected conceptual excerpts.',
  'Actual Controller execution/user-delivery permission is not established by source permission.'],
 selected,operatingInstructions:{exportableCanonicalSourceSections:[],note:'Engineering safeguards only; original Controller remains server-side.'}}
const collectionSHA=sha(JSON.stringify(proposal))
writeFileSync(join(out,'proposed-source-collection.json'),JSON.stringify({...proposal,collectionSHA},null,2)+'\n')
writeFileSync(join(privateOut,'proposed-passages.json'),JSON.stringify({collectionSHA,approved:false,passages},null,2)+'\n')
const realEligible=verified.filter(r=>r.status==='published-supporting'&&r.permittedUse==='supporting-retrieval'&&r.kind!=='operating-rules'&&r.permissions?.sourceHash===r.hash&&r.permissions?.internalResearch&&r.permissions?.externalExport)
writeFileSync(join(out,'source-eligibility.json'),JSON.stringify({verifiedOriginalReceipts:verified.length,externallyEligibleRealSources:realEligible.map(r=>r.documentId),
 localSupportingOnly:verified.filter(r=>r.status==='published-supporting').map(({bytes,...r})=>r),
 held:verified.filter(r=>!realEligible.includes(r)).map(({bytes,...r})=>r),permissionsChanged:false},null,2)+'\n')
const lines=['BỘ NGUỒN ĐỀ XUẤT — CHƯA ĐƯỢC PHÉP','Collection: '+proposal.collectionId,'SHA-256: '+collectionSHA,'',
 'Đây là một bộ tham khảo giới hạn, không phải toàn bộ INSPIRE. Không gửi nguyên thư viện.',
 'Mỗi lượt: tối đa 3 đoạn liên quan, mỗi đoạn 1.400 ký tự, tổng 4.200; kèm ID, phiên bản, hash và vị trí.',
 'Cùng câu hỏi/lịch sử giả định và chỉ dẫn tiếng Việt của phần mềm, các đoạn đó sẽ sang OpenAI qua ChatGPT sign-in.',
 'Không gửi bản gốc, hồ sơ cá nhân, booking, tài liệu khác, hoặc quy tắc vận hành chưa được phép.',
 'Chấp thuận tham khảo không biến bản nháp thành canonical và không cấp quyền can thiệp.','',
 ...selected.flatMap(r=>[r.title,'  ID '+r.documentId+'; bản biên nhận '+r.receiptVersion+'; phiên bản tài liệu '+r.declaredVersion,
 '  SHA-256 '+r.sha256,'  Trạng thái giữ nguyên: '+r.status+' / '+r.permittedUse,
 '  '+r.editorialStatus,'  '+r.sections.length+' đoạn được liệt kê chính xác trong proposed-source-collection.json','']),
 'Các amendment, bản cũ, MOI, DPM, OSP, RDS, content patch, 458 bài học và bản tái dựng không được xuất bởi đề xuất này.',
 'Các bản gốc và lịch sử vẫn được giữ. Xem source-eligibility.json để đối chiếu toàn bộ 71 biên nhận, không phải 71 nguồn đủ quyền.']
writeFileSync(join(out,'COLLECTION.txt'),lines.join('\n')+'\n')
// Preserve the existing frozen first request byte-for-byte; no new identifiers.
const frozen=readFileSync('docs/evidence/luna-first-trial-2026-11-24/frozen-request.json')
const p=JSON.parse(frozen).proposal
if(sha(p.prepared.text)!==p.prepared.payloadSHA||p.prepared.sourceCount!==0)throw Error('FROZEN_PREVIEW_HOLD')
writeFileSync(join(out,'first-attempt-preview.json'),frozen)
writeFileSync(join(out,'first-attempt-input.txt'),p.prepared.text+'\n')
const schemas={}
for(const name of ['ThreadStartParams','TurnStartParams','ErrorNotification']){
 const raw=readFileSync('.private.local/knowledge-chat-20261124-schema/v2/'+name+'.json'),schema=JSON.parse(raw)
 schemas[name]={sha256:sha(raw),fields:Object.keys(schema.properties||{})}
}
writeFileSync(join(out,'protocol-controls.json'),JSON.stringify({schemas,hard512OutputTokenLimitVerified:false,
 managedRetriesDisabledVerified:false,isolatedToolFreeThreadVerified:false,ownerBillingConfirmed:true,liveCalls:0,
 references:['https://learn.chatgpt.com/docs/app-server','https://learn.chatgpt.com/docs/config-file/config-reference']},null,2))
console.log(JSON.stringify({verifiedReceipts:verified.length,proposedSources:selected.length,proposedSections:passages.length,collectionSHA,externallyEligible:realEligible.length,permissionsChanged:false}))
