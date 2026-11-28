// Operator-only receipt staging. No SDK, importer, model or permission writer.
// Input is verbatim owner chat, NOT an original file or canonical amendment.
import {createHash} from 'node:crypto'
import {readFileSync,writeFileSync,existsSync,mkdirSync,realpathSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {pathToFileURL} from 'node:url'

const hash=value=>createHash('sha256').update(value).digest('hex')
const hold=()=>{throw Error('CHAT_AMENDMENT_RECEIPT_HOLD')}
export function prepareChatAmendment(input,now=()=>new Date().toISOString()) {
 if(!input||typeof input!=='object'||Array.isArray(input))hold()
 const keys=['amendmentId','declaredVersion','conversationId','messageId','text']
 if(Object.keys(input).some(k=>!keys.includes(k))||keys.some(k=>typeof input[k]!=='string'))hold()
 if(!/^INSPIRE-[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(input.amendmentId)||input.amendmentId.length>80)hold()
 if(!input.declaredVersion.trim()||input.declaredVersion.length>120)hold()
 for(const key of ['conversationId','messageId'])if(!/^[A-Za-z0-9_-]{1,120}$/.test(input[key]))hold()
 if(!input.text.trim()||Buffer.byteLength(input.text,'utf8')>400000)hold()
 // Reject lone surrogates rather than silently changing received characters.
 if(!input.text.isWellFormed())hold()
 const raw=Buffer.from(input.text,'utf8'),sourceHash=hash(raw)
 const documentId='chat-amendment-'+hash(JSON.stringify([input.conversationId,input.messageId,input.amendmentId])).slice(0,24)
 const family=input.amendmentId.replace(/-[A-Z]$/,'')
 const provenance={channel:'owner-conversation',conversationId:input.conversationId,
  messageId:input.messageId,claimedAmendmentId:input.amendmentId,
  locatorVerification:'operator-supplied; not platform-verified',
  declaredVersion:input.declaredVersion,receivedAt:now(),verbatimSHA256:sourceHash,
  originalFileVerified:false,originalDocumentAuthority:'pending'}
 const receipt={schema:'inspire-chat-amendment-receipt-v1',provenance,
  receiptStatus:'received-unverified',semanticApproval:'pending',
  internalResearchUse:'not-granted',externalExport:'not-granted',indexing:'not-requested',
  record:{collection:'INSPIRE',documentId,title:input.amendmentId+' · owner chat · '+input.declaredVersion,
   status:'review-required',permittedUse:'receipt-only',kind:'reference',contentClass:'content',
   rawFile:sourceHash,hash:sourceHash,
   provenance:{packageHash:'not-a-package',relativePath:'owner-conversation/'+input.conversationId+'/'+input.messageId,
    declaredVersion:input.declaredVersion,authority:'Verbatim owner chat received; original-file authority and approval pending. No runtime/export permission.'},
   relations:{family,amendment:true,relatedIds:[family],authority:'Claimed amendment relation only; unverified; does not supersede any original.'}}}
 return {raw,receipt}
}

export function stageChatAmendment(input,directory=resolve('.private.local/inbox/conversation-amendments')) {
 const prepared=prepareChatAmendment(input),{raw,receipt}=prepared
 mkdirSync(directory,{recursive:true,mode:0o700})
 if(realpathSync(directory).toLowerCase()!==resolve(directory).toLowerCase())hold()
 const metadata=join(directory,receipt.record.documentId+'.json'),source=join(directory,receipt.record.documentId+'.txt')
 if(existsSync(metadata)||existsSync(source)) {
  if(!existsSync(metadata)||!existsSync(source))hold()
  const prior=JSON.parse(readFileSync(metadata,'utf8'))
  const same={...receipt,provenance:{...receipt.provenance,receivedAt:prior.provenance?.receivedAt}}
  if(!readFileSync(source).equals(raw)||JSON.stringify(prior)!==JSON.stringify(same))hold()
  return {changed:false,documentId:prior.record.documentId,sha256:prior.record.hash,indexed:false,permissionsChanged:false}
 }
 // Exclusive creates: a changed message never overwrites a previous receipt.
 writeFileSync(source,raw,{flag:'wx',mode:0o600})
 writeFileSync(metadata,JSON.stringify(receipt),{flag:'wx',mode:0o600})
 return {changed:true,documentId:receipt.record.documentId,sha256:receipt.record.hash,indexed:false,permissionsChanged:false}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 if(process.argv[2]!=='--receive')throw Error('EXPLICIT_RECEIPT_ONLY_COMMAND_REQUIRED')
 const bytes=readFileSync(0)
 if(bytes.length>500000)hold()
 const input=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(bytes))
 console.log(JSON.stringify(stageChatAmendment(input)))
}
