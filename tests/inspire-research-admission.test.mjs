import test from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {randomUUID,createHash} from 'node:crypto'
import {mkdirSync,writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {createRequire} from 'node:module'
import {requireLocalEmulators} from '../functions/src/inspireLocalService.ts'
import {verifiedIdentity,AccountService} from '../functions/src/inspireAccount.ts'
process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099'
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'
process.env.METADATA_SERVER_DETECTION='none'
requireLocalEmulators()
const require=createRequire(new URL('../functions/package.json',import.meta.url))
const db=require('firebase-admin/firestore').getFirestore(),auth=require('firebase-admin/auth').getAuth()
const users=[]
async function member(){
  const email=randomUUID()+'@synthetic.invalid'
  const body=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=synthetic-test',{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password:'Synthetic-only-987!',returnSecureToken:true})}).then(r=>r.json())
  assert.ok(body.idToken,'Synthetic emulator account created')
  const identity=await verifiedIdentity(body.idToken);users.push(identity.uid)
  return{identity,token:body.idToken,subject:createHash('sha256').update(identity.uid).digest('hex')}
}
function bridge(value,env={}){
  return spawnSync(process.execPath,['--import','./tests/register-ts.mjs','functions/src/inspireResearchAdmission.ts'],
    {input:JSON.stringify(value),encoding:'utf8',env:{...process.env,...env},maxBuffer:4*1024*1024})
}
test('verified registered synthetic identity is bound; forged fields, account switching and production fail before reservation',async()=>{
  const first=await member(),second=await member()
  const identity=bridge({action:'identity',token:first.token})
  assert.equal(identity.status,0,identity.stderr)
  assert.equal(JSON.parse(identity.stdout).subject,first.subject)
  const request={kind:'send',epoch:'research',sessionId:'research',operationId:randomUUID(),conversationId:'C1',messages:[{id:'u1',role:'user',text:'Nội dung tổng hợp.'}]}
  for(const value of [
    {action:'reserve',token:first.token,subject:second.subject,request},
    {action:'reserve',token:first.token,subject:first.subject,request,quota:999},
    {action:'reserve',token:'forged-token',subject:first.subject,request},
  ])assert.notEqual(bridge(value).status,0)
  assert.notEqual(bridge({action:'identity',token:first.token},{NODE_ENV:'production'}).status,0)
  assert.equal((await new AccountService().account(first.identity)).quota.pending,0)
})
test('actual protected runner → shared emulator Auth/IP/quota → native validation → research acceptance and replay',async()=>{
  const account=await member()
  const result=spawnSync(process.env.INSPIRE_CONTROLLER_PYTHON||resolve('.tools.local/python312/python.exe'),
    ['-X','utf8','tests/inspire-research-admission.py'],{input:JSON.stringify({token:account.token}),encoding:'utf8',
      env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'},maxBuffer:4*1024*1024})
  assert.equal(result.status,0,result.stderr)
  const evidence=JSON.parse(result.stdout)
  assert.equal(evidence.mock_transport_calls,1)
  assert.equal(evidence.replay_added_calls,0)
  const state=await new AccountService().account(account.identity)
  assert.equal(state.quota.completed,1);assert.equal(state.quota.pending,0);assert.equal(state.quota.remaining,29)
  mkdirSync('docs/evidence/research-implementation',{recursive:true})
  writeFileSync('docs/evidence/research-implementation/shared-admission-trace.json',JSON.stringify({
    ...evidence,quota:state.quota,paidCalls:0,realOAuth:false,domain:'Synthetic Firebase emulators only; token never persisted'},null,2))
})
test.after(async()=>{
  for(const uid of users){
    await db.recursiveDelete(db.doc('inspireAccounts/'+uid))
    await db.doc('inspirePreferences/'+uid).delete()
    const operations=await db.collection('inspireOperations').where('uid','==',uid).get()
    await Promise.all(operations.docs.map(d=>d.ref.delete()));await auth.deleteUser(uid)
  }
  await db.terminate()
})
