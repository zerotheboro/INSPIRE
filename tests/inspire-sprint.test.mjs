import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync,mkdtempSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {randomUUID,createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {hydrateChatgptFinal} from '../functions/src/inspireChatgptTransport.ts'
import {privateChatgptConfig,isolatedChatgptEnvironment} from '../functions/src/inspireChatgptProfile.ts'
import {requireLocalEmulators} from '../functions/src/inspireLocalService.ts'
import {importSource,retrieveKnowledge,assertKnowledgeExport} from '../functions/src/inspireKnowledge.ts'
import {prepareLunaKnowledgeInput} from '../functions/src/inspireLuna.ts'
import {emptyPreferences} from '../functions/src/inspireAccount.ts'
import {evaluationAllowance} from '../functions/src/inspireEvaluationAllowance.ts'
import {createPrivateChatgptService} from '../functions/src/inspireLunaService.ts'
process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';requireLocalEmulators()
const require=createRequire(new URL('../functions/package.json',import.meta.url)),db=require('firebase-admin/firestore').getFirestore(),prefix='sprint-'+randomUUID(),ids=[]
const sha=s=>createHash('sha256').update(s).digest('hex')
test('real app-server summary is bound to completed bytes; standalone summary and mismatched bytes are refused',()=>{
 const trace=JSON.parse(readFileSync('docs/evidence/sprint-2026-11-25/isolation/probe.json'))
 const final=trace.notifications.filter(n=>n.method==='turn/completed'),items=trace.notifications.filter(n=>n.method==='item/completed'&&n.params.item.type==='agentMessage')
 assert.equal(hydrateChatgptFinal(items,final)[0].params.turn.itemsView,'full')
 assert.throws(()=>hydrateChatgptFinal([],final))
 const changed=structuredClone(items);changed[0].params.item.text+='changed';assert.throws(()=>hydrateChatgptFinal(changed,final))
})
test('isolated process cannot inherit API keys or main profile/config',()=>{
 const root=mkdtempSync(join(tmpdir(),'inspire-profile-'));writeFileSync(join(root,'config.toml'),privateChatgptConfig())
 const env=isolatedChatgptEnvironment(root);assert.equal(env.CODEX_HOME,root);assert.equal(env.OPENAI_API_KEY,undefined);assert.equal(env.CODEX_AUTH_JSON,undefined)
 writeFileSync(join(root,'config.toml'),privateChatgptConfig()+'\n[mcp_servers.attack]\ncommand="x"');assert.throws(()=>isolatedChatgptEnvironment(root),/PROFILE_HOLD/)
})
test('draft amendment and parent stay separate reference evidence; permission revocation invalidates adapter input',async()=>{
 const parent=prefix+'-parent',amendment=prefix+'-amendment';ids.push(parent,amendment)
 async function put(id,text,amend,allowed=true){await importSource({collection:'INSPIRE',documentId:id,title:amend?'Synthetic amendment':'Synthetic parent',status:'review-required',permittedUse:'supporting-retrieval',kind:'reference',rawFile:sha(text),relations:{family:'SYNTHETIC',amendment:amend,relatedIds:[amend?parent:amendment],authority:'synthetic reference, no rule authority'},permissions:{sourceHash:sha(text),internalResearch:true,externalExport:allowed,evidence:'SYNTHETIC TEST ONLY',runtimeUse:'private-reference-evaluation',sectionHashes:[sha(text)]}},Buffer.from(text),text)}
 const p='# Parent\nzsprintamend Cây cần đất ẩm.',a='# Amendment\nzsprintamend Cây cần đất khô. Hai nguồn cố ý mâu thuẫn.'
 await put(parent,p,false);await put(amendment,a,true)
 const request={kind:'send',epoch:'e',sessionId:'s',operationId:'o',conversationId:'c',messages:[{id:'u',role:'user',text:'zsprintamend'}]}
 const prepared=await prepareLunaKnowledgeInput({messages:request.messages,userStatedPreferences:emptyPreferences,operatingInstructions:['PRIVATE OPERATING RULE'],supportingKnowledge:[]},request)
 const v=JSON.parse(prepared.text);assert.equal(v.supportingKnowledge.length,2);assert.ok(v.supportingKnowledge.every(s=>s.sourceStatus==='review-required'&&s.sourceRelations.family==='SYNTHETIC'));assert.ok(!prepared.text.includes('PRIVATE OPERATING RULE'))
 await put(amendment,a,true,false);await assert.rejects(assertKnowledgeExport(v.supportingKnowledge));assert.equal((await retrieveKnowledge('zsprintamend',true)).length,1)
})
test('private evaluation accounting preserves exhausted guest quota and still checks rate limiter',async()=>{
 const uid=prefix+'-owner',root=mkdtempSync(join(tmpdir(),'inspire-eval-integration-'))
 const identity={uid,registered:false,providers:[],email:null,createdAt:new Date().toISOString()}
 writeFileSync(join(root,'evaluation-grant.json'),JSON.stringify({schema:'inspire-private-evaluation-v1',sessionScope:'father-50-questions-v1',ownerHash:sha(uid),approved:true,maxAttempts:50,expiresAt:Date.now()+100000,route:'codex-app-server',model:'gpt-6-luna',syntheticOnly:true,publicDelivery:false,sourcePermissionSeparate:true}))
 await db.doc('inspireAccounts/'+uid+'/usage/guest').set({completed:10,reserved:0})
 let rateChecks=0,calls=0
 const s=createPrivateChatgptService({evaluation:evaluationAllowance(root),sourceFree:true,rateCheck:async()=>{rateChecks++;return {allowed:false}},offlineSender:async()=>{calls++;throw Error('must not send')}})
 const session=await s.handlePrivate({kind:'session'},identity),request={kind:'send',epoch:session.epoch,sessionId:session.sessionId,operationId:'eval',conversationId:'eval',messages:[{id:'u',role:'user',text:'Tình huống giả định.'}]}
 const preview=await s.handlePrivate({kind:'preview',request},identity);assert.equal(preview.accounting.maxAttempts,50)
 await assert.rejects(s.handlePrivate({kind:'execute',request},identity),e=>e.code==='RATE_LIMITED');assert.equal(rateChecks,1);assert.equal(calls,0)
 assert.equal((await s.accounts.account(identity)).quota.completed,10);s.close()
})
test.after(async()=>{for(const id of ids)await db.recursiveDelete(db.doc('inspireKnowledge/'+id));await db.terminate()})
