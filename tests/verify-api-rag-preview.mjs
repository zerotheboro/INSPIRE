// Final exact RAG preview + original Controller; synthetic candidate, no model.
import assert from 'node:assert/strict'
import {readFileSync,writeFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {requireLocalEmulators} from '../functions/src/inspireLocalService.ts'
import {recheckLunaSources} from '../functions/src/inspireLunaApi.ts'
import {createLunaController} from '../functions/src/inspireLunaController.ts'
process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';requireLocalEmulators()
const local='.private.local/api-rag-final-20261125',out='docs/evidence/api-rag-2026-11-25/final-preview'
const p=JSON.parse(readFileSync(local+'/first-runtime-preview.json','utf8')),sha=s=>createHash('sha256').update(s).digest('hex')
const data=JSON.parse(p.payload.input[0].content)
assert.deepEqual(data.references,p.references);assert.equal(p.references.length,3);assert.equal(sha(p.body),p.payloadSHA)
assert.deepEqual(p.payload.input.slice(1),p.request.messages.map(m=>({role:m.role,content:m.text})))
assert.deepEqual(p.payload.tools,[]);assert.equal(p.payload.store,false);assert.equal(p.payload.max_output_tokens,512)
await recheckLunaSources(p)
const controller=createLunaController()
await controller.preflight(p)
const candidate='Đây là phản hồi giả lập chỉ dùng để kiểm tra kỹ thuật. Bạn có thể nói thêm về tình huống giả định nếu muốn.'
await controller.validate(p,candidate)
const evidence=controller.evidence()
assert.equal(evidence.length,2)
assert.ok(evidence.every(e=>e.binding===p.binding&&e.actual_execution_eligible===false&&e.user_delivery===false))
assert.equal(evidence[1].validated_sha256,sha(candidate))
writeFileSync(out+'/adapter-controller-trace.json',JSON.stringify({executed:true,liveCalls:0,candidate:'SYNTHETIC OFFLINE: NOT LUNA OUTPUT',payloadSHA:p.payloadSHA,binding:p.binding,exactOutboundPrivateFile:local+'/first-outbound.json',sourcesReachedAdapter:data.references.map(({text,...r})=>({...r,characters:text.length,textSHA:sha(text)})),checks:evidence,operatingRulesExported:false,permissionRechecked:true,publicDelivery:false},null,2))
console.log('PASS: exact three permitted passages reach API input; original Controller preflight and synthetic output binding validated; zero model calls.')
const require=createRequire(new URL('../functions/package.json',import.meta.url));await require('firebase-admin/firestore').getFirestore().terminate()
