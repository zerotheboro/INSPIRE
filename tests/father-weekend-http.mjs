// Run with the source-free weekend launcher and fresh demo emulators.
import assert from 'node:assert/strict'
const base='http://127.0.0.1:5173'
const call=(path,body,token)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)})
const status=await fetch(base+'/api/inspire-private-status').then(r=>r.json());assert.equal(status.chatgptPreview,true);assert.equal(status.lunaApiPreview,undefined);assert.equal(status.modelAvailable,false)
assert.equal((await call('/api/inspire-chatgpt',{kind:'session'})).status,401)
const auth=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"returnSecureToken":true}'}).then(r=>r.json())
const session=await (await call('/api/inspire-chatgpt',{kind:'session'},auth.idToken)).json()
const request={kind:'send',operationId:'op-test',conversationId:'tc',sessionId:session.sessionId,epoch:session.epoch,messages:[{id:'u1',role:'user',text:'Tình huống giả định: bạn có biết tài liệu nào không?'}]}
const preview=await (await call('/api/inspire-chatgpt',{kind:'preview',request},auth.idToken)).json()
assert.equal(preview.sourceCount,0,JSON.stringify(preview));assert.equal(preview.previewOnly,true);assert.equal(preview.accounting.used,0);assert.ok(!('payload' in preview));assert.ok(!('text' in preview));assert.ok(!('instructions' in preview))
assert.equal((await call('/api/inspire-chatgpt',{kind:'execute',request},auth.idToken)).status,403)
assert.equal((await call('/api/inspire-luna',{kind:'session'},auth.idToken)).status,503)
for(const path of ['/docs/evidence/luna-first-trial-2026-11-24/frozen-request.json','/functions/src/inspireLuna.ts?raw','/docs/private-chatgpt-readiness-2026-11-23.txt','/.private.local/controller040-preview/INSPIRE_AI_040/manifests/package_manifest.json','/tests/father-weekend.test.mjs','/vite.config.ts?raw']) assert.ok([403,404].includes((await fetch(base+path)).status),path)
assert.equal((await fetch(base+'/src/data/counselingTopics.ts')).status,200)
console.log('PASS private HTTP: local status/auth, redacted source-free preview, held generation, API route closed, private paths denied, public article module reachable')
const sim=await (await call('/api/inspire-prototype',{kind:'session'},auth.idToken)).json()
const messages=[]
for(const [i,text] of ['Giả định: tôi đang chuẩn bị bữa tối.','Nếu chỉ có nửa tiếng thì sao?','Tôi đính chính: là bữa trưa.'].entries()){
 messages.push({id:'user'+i,role:'user',text,...(i===2?{correctionOf:'user0'}:{})})
 const r=await call('/api/inspire-prototype',{...request,epoch:sim.epoch,sessionId:sim.sessionId,operationId:'op'+i,messages},auth.idToken),data=await r.json()
 assert.equal(r.status,200,JSON.stringify(data));assert.equal(data.response.mode,'simulation');assert.equal(data.knowledge.sourceCount,0);assert.ok(!('text' in data.knowledge));messages.push(data.response.message)
}
console.log('PASS three authenticated HTTP turns through native simulation including follow-up and correction')
