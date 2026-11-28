// Offline configuration tests. All dotenv values/keys here are synthetic.
import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,writeFileSync,existsSync,mkdirSync,statSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {randomUUID} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {fatherApiEnvironment} from './start-father-api.mjs'
import {lunaOneShot,prepareLunaApi,LUNA_API} from '../functions/src/inspireLunaApi.ts'
import {emptyPreferences} from '../functions/src/inspireAccount.ts'
const fake=()=> 'sk-offline_fixture_'+randomUUID().replaceAll('-','')
const temp=()=>mkdtempSync(join(tmpdir(),'inspire-env-fixture-'))
function envKey(t,value){const old=process.env.OPENAI_API_KEY;if(value===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=value;t.after(()=>{if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old})}
const request={kind:'send',epoch:'offline',sessionId:'offline',operationId:'offline',conversationId:'offline',messages:[{id:'u1',role:'user',text:'Tình huống tổng hợp kiểm tra cấu hình.'}]}
const plan=()=>prepareLunaApi({messages:request.messages,operatingInstructions:[],supportingKnowledge:[],userStatedPreferences:emptyPreferences},request)
function authorize(root,p){const now=Date.UTC(2026,10,25);writeFileSync(join(root,'authorization.json'),JSON.stringify({schema:'inspire-luna-one-shot-v2',approved:true,model:LUNA_API.model,payloadSHA:p.payloadSHA,binding:p.binding,maxAttempts:1,maxCostNanoUSD:p.reservedNanoUSD,expiresAt:new Date(now+60000).toISOString(),ownerDecision:'SYNTHETIC OFFLINE FIXTURE ONLY',syntheticOnly:true,privateEvaluationOnly:true}));return lunaOneShot(root,()=>now)}

test('native file loader selects only backend key, overrides inherited keys and pins API route',()=>{
 const root=temp(),file=join(root,'.env.local'),value=fake(),other=fake()
 writeFileSync(file,'\uFEFF# synthetic\nexport OPENAI_API_KEY="'+value+'"\nVITE_DO_NOT_EXPORT='+other+'\nNODE_OPTIONS=ignored\nINSPIRE_BILLING_ROUTE=chatgpt\n')
 const env=fatherApiEnvironment({LOCALAPPDATA:root,OPENAI_API_KEY:other,openai_api_key:other,KEEP_ME:'unchanged'},file)
 assert.ok(env.OPENAI_API_KEY===value,'FILE_KEY_NOT_SELECTED')
 assert.equal(Object.keys(env).filter(k=>k.toUpperCase()==='OPENAI_API_KEY').length,1)
 assert.equal(env.VITE_DO_NOT_EXPORT,undefined);assert.equal(env.NODE_OPTIONS,undefined)
 assert.equal(env.KEEP_ME,'unchanged');assert.equal(env.INSPIRE_BILLING_ROUTE,'api-key');assert.equal(env.INSPIRE_FATHER_WEEKEND,'0')
 assert.equal(env.INSPIRE_API_KEY_SOURCE,'functions/.env.local')
})

test('missing/empty selected file clears inherited key and never reads neighboring .env',()=>{
 const root=temp(),file=join(root,'.env.local'),parent={LOCALAPPDATA:root,OPENAI_API_KEY:fake()}
 writeFileSync(join(root,'.env'),'OPENAI_API_KEY='+fake())
 assert.equal(fatherApiEnvironment(parent,file).OPENAI_API_KEY,'')
 writeFileSync(file,'OPENAI_API_KEY=   \n');assert.equal(fatherApiEnvironment(parent,file).OPENAI_API_KEY,'')
 writeFileSync(file,'VITE_OPENAI_API_KEY='+fake());assert.equal(fatherApiEnvironment(parent,file).OPENAI_API_KEY,'')
})

test('unreadable configuration fails closed without returning file values',()=>{
 const root=temp(),directory=join(root,'not-a-file');mkdirSync(directory)
 assert.throws(()=>fatherApiEnvironment({LOCALAPPDATA:root},directory),{message:'LOCAL_API_ENV_LOAD_HOLD'})
})

test('adapter consumes environment key and leaves legacy key file unchanged',t=>{
 const root=temp(),value=fake();envKey(t,value)
 const legacy=join(root,'api-key.txt');writeFileSync(legacy,fake());const before=statSync(legacy)
 const p=plan(),store=authorize(root,p);assert.equal(store.configured(),true)
 assert.ok(store.consume(p)===value,'ADAPTER_DID_NOT_USE_ENV_KEY')
 const after=statSync(legacy);assert.equal(after.mtimeMs,before.mtimeMs);assert.equal(after.size,before.size)
 assert.throws(()=>store.consume(p));assert.equal(existsSync(join(root,'first-attempt.json')),true)
})

test('legacy file cannot enable or supply a missing environment key',t=>{
 const root=temp();envKey(t,undefined);writeFileSync(join(root,'api-key.txt'),fake())
 const p=plan(),store=authorize(root,p);assert.equal(store.configured(),false)
 assert.throws(()=>store.consume(p),/LUNA_AUTHORIZATION_OR_STORAGE_HOLD/)
 assert.equal(existsSync(join(root,'first-attempt.json')),false)
 process.env.OPENAI_API_KEY=' \t ';assert.equal(store.configured(),false)
})

test('spawn environment is loaded before adapter import/initialization in a fresh Node process',()=>{
 const root=temp(),value=fake(),file=join(root,'.env.local');writeFileSync(file,"OPENAI_API_KEY='"+value+"'\n")
 const env=fatherApiEnvironment({...process.env,EXPECTED_SYNTHETIC_KEY:value},file)
 const code="import {lunaOneShot} from "+JSON.stringify(pathToFileURL(resolve('functions/src/inspireLunaApi.ts')).href)+"; if(process.env.OPENAI_API_KEY!==process.env.EXPECTED_SYNTHETIC_KEY)throw Error('BOOT_ORDER_HOLD');console.log(JSON.stringify({keyConfigured:lunaOneShot().configured()}))"
 const stdout=execFileSync(process.execPath,['--import',pathToFileURL(resolve('tests/register-ts.mjs')).href,'--input-type=module','-e',code],{env,encoding:'utf8',windowsHide:true})
 assert.deepEqual(JSON.parse(stdout),{keyConfigured:true});assert.ok(!stdout.includes(value),'SECRET_IN_CHILD_OUTPUT')
})
