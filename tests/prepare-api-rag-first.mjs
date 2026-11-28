// Exact operator review only. Key configuration is reported as a boolean.
// No login, generation send or approval writer.
import {readFileSync,writeFileSync,mkdirSync,existsSync,openSync,writeSync,fsyncSync,closeSync} from 'node:fs'
import {join} from 'node:path'
import {createRequire} from 'node:module'
import {requireLocalEmulators} from '../functions/src/inspireLocalService.ts'
import {retrieveKnowledge} from '../functions/src/inspireKnowledge.ts'
import {prepareLunaApi,recheckLunaSources,LUNA_API,lunaOneShot} from '../functions/src/inspireLunaApi.ts'
import {fatherApiEnvironment} from './start-father-api.mjs'
import {emptyPreferences} from '../functions/src/inspireAccount.ts'
process.env.OPENAI_API_KEY=fatherApiEnvironment().OPENAI_API_KEY
process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';requireLocalEmulators()
const local='.private.local/api-rag-final-20261125',out='docs/evidence/api-rag-2026-11-25/final-preview';mkdirSync(local,{recursive:true});mkdirSync(out,{recursive:true})
const request={kind:'send',epoch:'api-rag-final-review-20261125',sessionId:'api-rag-final-session-20261125',operationId:'api-rag-final-attempt-20261125',conversationId:'api-rag-final-conversation-20261125',messages:[{id:'api-rag-final-user-message',role:'user',text:'Tình huống giả định: Tôi trì hoãn một việc dù đã biết cần làm. Giúp tôi hiểu khoảng cách giữa ý định và hành động.'}]}
const refs=await retrieveKnowledge(request.messages,true)
if(!refs.length)throw Error('FIRST_RAG_SOURCE_REQUIRED')
const plan=prepareLunaApi({messages:request.messages,operatingInstructions:[],userStatedPreferences:emptyPreferences,supportingKnowledge:refs},request)
await recheckLunaSources(plan)
const file=join(local,'first-preview.json'),bytes=JSON.stringify(plan,null,2)+'\n'
if(existsSync(file)&&readFileSync(file,'utf8')!==bytes)throw Error('FROZEN_FIRST_REQUEST_CHANGED: preserve previous review, require new decision')
if(!existsSync(file)){const fd=openSync(file,'wx',0o600);try{writeSync(fd,bytes);fsyncSync(fd)}finally{closeSync(fd)}}
const outbound=join(local,'first-outbound.json')
if(existsSync(outbound)&&readFileSync(outbound,'utf8')!==plan.body)throw Error('FROZEN_OUTBOUND_CHANGED')
if(!existsSync(outbound)){const fd=openSync(outbound,'wx',0o600);try{writeSync(fd,plan.body);fsyncSync(fd)}finally{closeSync(fd)}}
const grant={schema:'inspire-luna-one-shot-v2',approved:false,model:LUNA_API.model,payloadSHA:plan.payloadSHA,binding:plan.binding,maxAttempts:1,maxCostNanoUSD:plan.reservedNanoUSD,expiresAt:'SET_AFTER_EXPLICIT_OWNER_APPROVAL_WITHIN_ONE_HOUR',ownerDecision:'PENDING_NEW_OWNER_DECISION',syntheticOnly:true,privateEvaluationOnly:true}
// Runtime-bound review is created once by prepare-api-rag-http.mjs. Do not
// replace its identity/binding when reopening the offline source preview.
if(!existsSync(join(local,'first-runtime-preview.json')))writeFileSync(join(out,'authorization-template.json'),JSON.stringify(grant,null,2))
const maxRequestReserve=(LUNA_API.maxWireBytes+4096)*LUNA_API.reserveInputNanoUSD+LUNA_API.maxOutputTokens*LUNA_API.outputNanoUSD
const summary={question:request.messages[0].text,operationId:request.operationId,model:LUNA_API.model,endpoint:LUNA_API.endpoint,maxOutputTokens:LUNA_API.maxOutputTokens,displayCharacters:2000,tools:[],store:false,automaticRetries:false,
 payloadSHA:plan.payloadSHA,binding:plan.binding,sourceCount:refs.length,sources:refs.map(({text,...r})=>({...r,characters:text.length})),inputByteBound:plan.inputTokenBound,
 pricing:{checked:'2026-11-25',expires:LUNA_API.pricingExpires,inputUSDPerMillion:0.1,outputUSDPerMillion:0.5,source:LUNA_API.modelURL},
 conservativeReservationUSD:plan.reservedNanoUSD/1e9,estimatedAtUncachedInputBoundUSD:(plan.inputTokenBound*LUNA_API.inputNanoUSD+LUNA_API.maxOutputTokens*LUNA_API.outputNanoUSD)/1e9,
 estimateMethod:'UTF-8 request bytes + 4096 overhead as conservative offline token bound; not tokenizer count. Reservation allows higher input cache-write rate, no discounted cache assumption.',
 proposedSession:{approved:false,userQuestions:50,maxResponses:50,maxAttemptsIncludingFailures:50,perRequestReservationMaxUSD:maxRequestReserve/1e9,totalReservationProposalUSD:50*maxRequestReserve/1e9,noOldGrantReused:true,existingQuotasAndRatesUnchanged:true},
 approved:false,keyConfigured:lunaOneShot().configured(),fullExactRequestPrivateFile:file,liveCalls:0}
if(!existsSync(join(local,'first-runtime-preview.json')))writeFileSync(join(out,'first-request-summary.json'),JSON.stringify(summary,null,2))
console.log(JSON.stringify({payloadSHA:plan.payloadSHA,sources:refs.length,estimateUSD:summary.estimatedAtUncachedInputBoundUSD,reserveUSD:summary.conservativeReservationUSD,keyConfigured:summary.keyConfigured,approved:false}))
const require=createRequire(new URL('../functions/package.json',import.meta.url));await require('firebase-admin/firestore').getFirestore().terminate()
