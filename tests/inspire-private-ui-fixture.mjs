// Disposable UI integration server: real local auth/RAG/native Controller,
// synthetic budget and provider. Never loads dotenv or a live model adapter.
import {createServer} from 'vite'
import react from '@vitejs/plugin-react'
import {mkdtempSync,writeFileSync,mkdirSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {inspirePrototype} from '../vite.config.ts'
import {createPrivateLunaService} from '../functions/src/inspireLunaService.ts'
import {lunaSessionBudget} from '../functions/src/inspireLunaBudget.ts'
import {LUNA_API} from '../functions/src/inspireLunaApi.ts'
Object.assign(process.env,{INSPIRE_PRIVATE_TEST:'1',INSPIRE_LUNA_API_PREVIEW:'1',INSPIRE_PRIVATE_CONVERSATION:'1',INSPIRE_BILLING_ROUTE:'api-key',OPENAI_API_KEY:'sk-SYNTHETIC_ONLY_NEVER_A_REAL_KEY',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099'})
const root=mkdtempSync(join(tmpdir(),'inspire-ui-provider-')),evidence=resolve('.private.local/private-ui-flow-20261128');mkdirSync(evidence,{recursive:true})
writeFileSync(join(root,'policy.json'),JSON.stringify({schema:'inspire-private-budget-v1',sessionId:'synthetic-ui',approved:true,purpose:'father',uid:null,maxAttempts:1,maxCostNanoUSD:50000000,expiresAt:null,messagesSHA:null,ownerDecision:'SYNTHETIC OFFLINE UI CHECK ONLY',model:LUNA_API.model}))
let sends=0
const service=()=>createPrivateLunaService({conversation:lunaSessionBudget(root),countInput:async()=>100,quarantine:()=>{},send:async p=>{
 if(++sends!==1)throw Error('NO_RETRY_FIXTURE')
 writeFileSync(join(evidence,'adapter-input.json'),JSON.stringify({syntheticProvider:true,request:p.request,references:p.references,payload:p.payload},null,2))
 return {id:'offline-ui-only',model:LUNA_API.model,status:'completed',usage:{input_tokens:100,output_tokens:25},output:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'Kiểm tra ngoại tuyến: bạn có thể chọn một việc quan trọng để bắt đầu. Đây là phản hồi từ provider giả.'}]}]}
}})
const vite=await createServer({configFile:false,root:resolve('.'),plugins:[react(),inspirePrototype(undefined,service)],define:{'import.meta.env.INSPIRE_PRIVATE_LOCAL':'true'},server:{host:'127.0.0.1',port:5180,strictPort:true}})
await vite.listen();console.log('OFFLINE UI FIXTURE http://127.0.0.1:5180; no real model')
