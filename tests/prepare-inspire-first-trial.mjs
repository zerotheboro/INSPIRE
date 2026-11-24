// Preparation only: no execute(), app-server RPC, credential access or grant.
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {firstChatgptTrial} from '../functions/src/inspireChatgptFirstTrial.ts'
const out='docs/evidence/luna-first-trial-2026-11-24';mkdirSync(out,{recursive:true})
const frozen=firstChatgptTrial().freeze()
if(frozen.authorization.approved!==false)throw Error('EXISTING_RELEASE_REQUIRES_REVIEW')
writeFileSync(out+'/frozen-request.json',JSON.stringify(frozen,null,2)+'\n')
const schemas={}
for(const name of ['ThreadStartParams','TurnStartParams','ErrorNotification']){
 const raw=readFileSync('.private.local/luna-protocol-2026-11-24/v2/'+name+'.json'),s=JSON.parse(raw)
 schemas[name]={sha256:createHash('sha256').update(raw).digest('hex'),required:s.required,fields:Object.keys(s.properties)}
}
if(schemas.TurnStartParams.fields.some(f=>/max.*token|retry/i.test(f)))throw Error('REINSPECT_NEW_PROTOCOL_CONTROLS')
writeFileSync(out+'/controls.json',JSON.stringify({cliVersion:'0.171.0-alpha.13.2',schemas,ownerBillingVerified:true,ownerBillingStatementDate:'2026-11-24',hard512TokenCapVerified:false,allManagedRetriesDisabledVerified:false,liveDispatchEnabled:false,liveCalls:0,limitation:'Frozen model input is exact, but threadId and isolated thread configuration are unresolved; no complete executable RPC request or final release exists.',reference:'https://learn.chatgpt.com/docs/config-file/config-reference'},null,2))
console.log(JSON.stringify({fingerprint:frozen.proposal.fingerprint,payloadSHA:frozen.proposal.prepared.payloadSHA,approved:false,dispatchReady:false,liveCalls:0},null,2))
