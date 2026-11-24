import assert from 'node:assert/strict'
import {readFileSync,writeFileSync,copyFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
const root='.private.local/luna-protocol-2026-11-22/v2/',out='docs/evidence/private-handoff-2026-11-22/'
const schema={};const hashes={}
for(const name of ['ThreadStartParams','TurnStartParams','TurnInterruptParams','ErrorNotification']){
 const bytes=readFileSync(root+name+'.json');schema[name]=JSON.parse(bytes);hashes[name]=createHash('sha256').update(bytes).digest('hex');copyFileSync(root+name+'.json',out+name+'.json')
}
const fields=Object.keys(schema.TurnStartParams.properties)
assert.ok(fields.includes('clientUserMessageId'));assert.ok(fields.includes('outputSchema'))
assert.ok(!fields.some(k=>/max.*token|retry/i.test(k)))
assert.ok(schema.ErrorNotification.properties.willRetry)
assert.ok(schema.ThreadStartParams.properties.allowProviderModelFallback)
assert.ok(schema.ThreadStartParams.properties.config.additionalProperties)
const adapter=readFileSync('functions/src/inspireLuna.ts','utf8');assert.ok(adapter.includes('LUNA_GENERATION_NOT_RELEASED'));assert.ok(adapter.includes('tokenCapEnforcedByProvider: false'))
const old=readFileSync('functions/src/inspireLunaApi.ts','utf8');assert.ok(old.includes('grant.maxAttempts !== 1'))
const evidence={executed:true,kind:'Offline installed-protocol and current-source inspection; not a live dispatch test',cliVersion:'0.171.0-alpha.13',generationRequests:0,schemaHashes:hashes,turnStartFields:fields,
 checks:{stableClientMessageId:'Typed field exists; does not establish model-side idempotency',outputTokenLimit:'No typed output-token cap on turn/start or thread/start; generic config is not verified enforcement. 512 remains requested only. Output schema and interrupt are not cost caps.',retries:'No typed turn-level retry-disable control; error notification has willRetry. Official provider config documents request_max_retries and stream_max_retries, but their effect on this managed ChatGPT route and all retry layers is not established.',controller:'Existing native preflight, scope guard, exact-byte validation and bound receipt tested with injected candidates; app-server response-event to Controller to private delivery is not connected.',boundedSession:'No connected durable three-attempt accounting for ChatGPT app-server. Account quotas are not session attempt limits. Existing API one-shot and rejected research runner do not grant this session.',billing:'No-additional-charge condition unresolved; no account billing change or auth action performed.',fallback:'Preferred route remains closed; no API fallback enabled.'},
 documentation:{url:'https://learn.chatgpt.com/docs/config-file/config-reference',checked:'2026-11-22',providerHTTPRetryDefault:4,providerSSERetryDefault:5,appliedToUserConfiguration:false},
 conclusion:'BLOCKED for generation. Static schema verification cannot establish transport retry, billing or token guarantees. No policy weakened.'}
writeFileSync(out+'dispatch-controls.json',JSON.stringify(evidence,null,2)+'\n');console.log('PASS: offline assertions; dispatch controls remain BLOCKED, not certified.')
