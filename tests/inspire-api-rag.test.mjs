// No production key is read. SDK fetch is intercepted before any network call.
import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {LUNA_API,prepareLunaApi,recheckLunaSources,sendLunaApi,decodeLunaApi,lunaOneShot} from '../functions/src/inspireLunaApi.ts'
import {emptyPreferences} from '../functions/src/inspireAccount.ts'
const request={kind:'send',epoch:'e',sessionId:'s',operationId:'o',conversationId:'c',messages:[{id:'u',role:'user',text:'Tình huống giả định: chọn việc làm trước.'}]}
const p=()=>prepareLunaApi({messages:request.messages,userStatedPreferences:emptyPreferences,operatingInstructions:[],supportingKnowledge:[]},request)
test('v1 spending grant cannot authorize fresh API path; stale pricing is held',()=>{
 const root=mkdtempSync(join(tmpdir(),'inspire-api-v2-')),plan=p(),now=Date.UTC(2026,10,25)
 const grant={schema:'inspire-luna-one-shot-v1',approved:true,model:LUNA_API.model,payloadSHA:plan.payloadSHA,binding:plan.binding,maxAttempts:1,maxCostNanoUSD:plan.reservedNanoUSD,expiresAt:new Date(now+60000).toISOString(),ownerDecision:'SYNTHETIC ONLY',syntheticOnly:true,privateEvaluationOnly:true}
 writeFileSync(join(root,'authorization.json'),JSON.stringify(grant));assert.equal(lunaOneShot(root,()=>now).authorized(plan),false)
 writeFileSync(join(root,'authorization.json'),JSON.stringify({...grant,schema:'inspire-luna-one-shot-v2',expiresAt:new Date(Date.parse(LUNA_API.pricingExpires)+60000).toISOString()}));assert.equal(lunaOneShot(root,()=>Date.parse(LUNA_API.pricingExpires)).authorized(plan),false)
})
test('mutating request identity or payload after preview fails exact binding',async()=>{
 const plan=p();await recheckLunaSources(plan)
 const changed=structuredClone(plan);changed.request.messages[0].id='modified';await assert.rejects(recheckLunaSources(changed),/MUTATED/)
 const tool=structuredClone(plan);tool.payload.tools=[{type:'web_search'}];await assert.rejects(recheckLunaSources(tool),/MUTATED/)
 const text='Đoạn giả định chỉ kiểm tra binding.',reference={documentId:'offline-reference',version:1,hash:'a'.repeat(64),sectionId:'offline-reference-0',title:'Synthetic',text,sourceStatus:'published-supporting',sectionHash:(await import('node:crypto')).createHash('sha256').update(text).digest('hex')}
 const detached=prepareLunaApi({messages:request.messages,userStatedPreferences:emptyPreferences,operatingInstructions:[],supportingKnowledge:[reference]},request)
 detached.references=[]
 // Must reject before any source lookup: the wire still contains that passage.
 await assert.rejects(recheckLunaSources(detached),/MUTATED/)
})
test('SDK safe errors use one attempt for 401, 404, 429 and transport abort; no raw provider text leaks',async()=>{
 const saved=globalThis.fetch
 try{
  for(const [status,code,expected] of [[401,'invalid_api_key','OPENAI_AUTH'],[404,'model_not_found','OPENAI_MODEL'],[429,'insufficient_quota','OPENAI_BILLING'],[429,'rate_limit','OPENAI_RATE'],[0,'abort','OPENAI_TRANSPORT']]){
   let calls=0;globalThis.fetch=async()=>{calls++;if(!status)throw new DOMException('RAW_PROVIDER_SECRET','AbortError');return Response.json({error:{message:'RAW_PROVIDER_SECRET',code}},{status})}
   await assert.rejects(sendLunaApi(p(),'sk-offline_fixture_not_a_real_key'),e=>e.code===expected&&e.retry==='none'&&!e.message.includes('RAW_PROVIDER_SECRET'));assert.equal(calls,1)
  }
 }finally{globalThis.fetch=saved}
})
test('malicious tool/refusal/incomplete/invalid usage responses cannot reach delivery',()=>{
 const valid={id:'fake',status:'completed',model:LUNA_API.model,usage:{input_tokens:10,output_tokens:20},output:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'Một câu trả lời giả lập.'}]}]}
 assert.deepEqual(p().payload.tools,[])
 for(const change of [{output:[{type:'function_call',name:'exec',arguments:'malicious'}]},{output:[{type:'web_search_call'}]},{status:'incomplete'},{usage:{input_tokens:-1,output_tokens:20}},{usage:{input_tokens:10,output_tokens:513}},{output:[{type:'message',role:'assistant',status:'completed',content:[{type:'refusal',refusal:'No'}]}]}])assert.throws(()=>decodeLunaApi({...valid,...change}))
})
