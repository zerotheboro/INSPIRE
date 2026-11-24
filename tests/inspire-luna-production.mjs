// Production-preview HTTP admission only. Never supplies auth or a model grant.
import assert from 'node:assert/strict'
import {writeFileSync,mkdirSync} from 'node:fs'
const base='http://127.0.0.1:4173',checks={}
for(const path of ['/api/inspire-luna','/api/inspire-prototype']){
 const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'session'}),signal:AbortSignal.timeout(5000)})
 assert.equal(response.status,404)
 checks[path]=response.status
}
assert.equal((await fetch(base+'/ai-inspire?thu-rieng=1')).status,200)
mkdirSync('docs/evidence/luna-api-2026-11-14',{recursive:true})
writeFileSync('docs/evidence/luna-api-2026-11-14/production-http-verification.json',JSON.stringify({executed:true,previewOnly:true,realProviderRequests:0,checks,renderedBrowser:'NOT_VERIFIED'},null,2))
console.log('PASS: production preview serves the site but both chat backends are absent (HTTP 404), even with private preview flags set.')
