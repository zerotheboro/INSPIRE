// Offline only: fake Firebase Users and local HTTP transport, no credentials,
// account creation, emulator writes or provider requests.
import test from 'node:test'
import assert from 'node:assert/strict'
import {currentIdentityToken} from '../src/services/inspireIdentity.ts'
import {createPrivateLunaTransport, createSimulationTransport, createPrivateConversationTransport} from '../src/services/InspireAIconnect.ts'
import {ConversationStore} from '../src/services/inspireConversation.ts'

const request = {kind:'send',epoch:'frozen-epoch',sessionId:'frozen-session',operationId:'frozen-operation',conversationId:'frozen-conversation',messages:[{id:'frozen-message',role:'user',text:'Câu hỏi giả định.'}]}
const unauthorized = () => Response.json({error:{code:'UNAUTHENTICATED',message:'Expired token',retry:'none'}},{status:401})
const receipt = r => Response.json({previewOnly:true,payloadSHA:'a'.repeat(64),binding:'b'.repeat(64),reservedNanoUSD:3592500,sourceCount:3,operationId:r.operationId,conversationId:r.conversationId})
const reply = (r,mode='private-model') => ({mode,epoch:r.epoch,sessionId:r.sessionId,operationId:r.operationId,conversationId:r.conversationId,replyTo:r.messages.at(-1).id,message:{id:'answer',role:'assistant',text:'Phản hồi giả định, không gọi mô hình.'}})
const active = store => store.getSnapshot().conversations[0]

test('manual unsent recovery retains message and operation, refreshes only session after server proof, and double-click sends once',async()=>{
 let count=0,recoveries=0,serial=0
 const packets=[]
 const transport=createPrivateConversationTransport(()=>{},async(_url,options)=>{
  const body=JSON.parse(options.body);packets.push(body)
  if(body.kind==='session')return Response.json({mode:'private-model',epoch:'old-epoch',sessionId:'old-session'})
  if(body.kind==='recover-unsent'){recoveries++;return Response.json({notDispatched:true,request:{...body.request,kind:'send',epoch:'restored-epoch',sessionId:'restored-session'}})}
  count++
  if(count===1)return Response.json({error:{code:'SESSION_IDENTITY',message:'UID mismatch before migration',retry:'none'}},{status:403})
  return Response.json({response:reply(body.request)})
 },async()=> 'synthetic-token')
 const store=new ConversationStore(transport,()=> 'stable-'+(++serial)),id=active(store).id
 store.draft(id,'Tin nhắn cần giữ nguyên.')
 await store.send(id)
 const original=structuredClone(active(store).pending.request)
 assert.equal(count,1);assert.equal(active(store).messages.length,1)
 await Promise.all([store.retry(id),store.retry(id)])
 assert.equal(count,2);assert.equal(recoveries,1);assert.equal(active(store).messages.length,2)
 const sent=packets.filter(p=>p.kind==='conversation').at(-1).request
 assert.equal(sent.operationId,original.operationId);assert.deepEqual(sent.messages,original.messages)
 assert.equal(sent.epoch,'restored-epoch')
})

test('unknown reservation or altered recovery proof cannot cause another generation',async()=>{
 for(const altered of [false,true]){
  let sends=0,serial=0
  const transport=createPrivateConversationTransport(()=>{},async(_url,options)=>{
   const b=JSON.parse(options.body)
   if(b.kind==='session')return Response.json({mode:'private-model',epoch:'e',sessionId:'s'})
   if(b.kind==='conversation'){sends++;return Response.json({error:{code:'SESSION_LOST',message:'Session lost',retry:'none'}},{status:409})}
   if(!altered)return Response.json({error:{code:'RESULT_UNKNOWN',message:'Durable attempt exists',retry:'none'}},{status:409})
   return Response.json({notDispatched:true,request:{...b.request,messages:[{id:'forged',role:'user',text:'altered'}]}})
  },async()=> 'synthetic-token')
  const store=new ConversationStore(transport,()=> 'bound-'+(++serial)),id=active(store).id
  store.draft(id,'Giữ nguyên tin này.');await store.send(id);await store.retry(id)
  assert.equal(sends,1);assert.equal(active(store).messages[0].text,'Giữ nguyên tin này.')
  assert.equal(active(store).error.code,altered?'RECOVERY_BINDING':'RESULT_UNKNOWN')
 }
})

test('official SDK User is restored before force-refresh; every request gets a current token for the same UID',async()=>{
 const steps=[],uid='existing-user'
 let counter=0
 const user={uid,getIdToken:async force=>{steps.push(['getIdToken',force]);return 'fake-current-'+(++counter)}}
 const auth={currentUser:null,authStateReady:async()=>{steps.push(['authStateReady']);auth.currentUser=user}}
 const packets=[]
 const transport=createPrivateLunaTransport(()=>{},async(_url,options)=>{
  packets.push(options)
  const body=JSON.parse(options.body)
  if(body.kind==='session')return Response.json({mode:'private-model',epoch:request.epoch,sessionId:request.sessionId})
  if(body.kind==='preview')return receipt(body.request)
  return Response.json(reply(body.request))
 },()=>currentIdentityToken(auth))
 await transport.connect()
 await assert.rejects(transport.send(request),{code:'AUTHORIZATION_REQUIRED'})
 const replay={...request,kind:'replay'}
 await transport.send(replay)
 assert.deepEqual(steps,Array.from({length:3},()=>[['authStateReady'],['getIdToken',true]]).flat())
 assert.deepEqual(packets.map(p=>p.headers.Authorization),['Bearer fake-current-1','Bearer fake-current-2','Bearer fake-current-3'])
 assert.deepEqual(JSON.parse(packets[1].body),{kind:'preview',request})
 assert.deepEqual(JSON.parse(packets[2].body),{kind:'execute',request:replay})
 assert.equal(auth.currentUser.uid,uid)
})

test('missing SDK user and failed refresh do not create accounts or reach HTTP',async()=>{
 let http=0
 const fetcher=async()=>{http++;throw Error('must not dispatch')}
 const missing={currentUser:null,authStateReady:async()=>{}}
 const absent=createPrivateLunaTransport(()=>{},fetcher,()=>currentIdentityToken(missing))
 await assert.rejects(absent.send(request),{code:'UNAUTHENTICATED',retry:'replay'})
 const failing={currentUser:{uid:'existing-user',getIdToken:async()=>{throw Error('do not expose token/SDK details')}},authStateReady:async()=>{}}
 const transport=createPrivateLunaTransport(()=>{},fetcher,()=>currentIdentityToken(failing))
 await assert.rejects(transport.send(request),error=>{
  assert.equal(error.code,'AUTH_REFRESH_FAILED');assert.equal(error.retry,'replay')
  assert.ok(!error.message.includes('SDK details'));return true
 })
 assert.equal(http,0)
})

test('account switch or sign-out during refresh blocks the old user request before HTTP',async()=>{
 for(const next of [null,{uid:'other-user'}]){
  let http=0,auth
  const original={uid:'existing-user',getIdToken:async()=>{auth.currentUser=next;return 'fake-original-token'}}
  auth={currentUser:original,authStateReady:async()=>{}}
  const transport=createPrivateLunaTransport(()=>{},async()=>{http++;throw Error('must not dispatch')},()=>currentIdentityToken(auth))
  await assert.rejects(transport.send(request),{code:'IDENTITY_CHANGED',retry:'none'})
  assert.equal(http,0)
 }
})

test('preview 401 permits explicit authentication recovery with byte-identical body, never automatic execution',async()=>{
 let preview=0,tokens=0
 const packets=[]
 const transport=createPrivateLunaTransport(()=>{preview++},async(_url,options)=>{
  packets.push(options)
  assert.equal(JSON.parse(options.body).kind,'preview')
  return packets.length===1?unauthorized():receipt(request)
 },async()=> 'fake-token-'+(++tokens))
 await assert.rejects(transport.send(request),{code:'UNAUTHENTICATED',retry:'replay',status:401})
 assert.equal(packets.length,1)
 await assert.rejects(transport.send({...request,kind:'replay'}),{code:'AUTHORIZATION_REQUIRED'})
 assert.equal(packets.length,2);assert.equal(preview,1)
 assert.equal(packets[0].body,packets[1].body)
 assert.notEqual(packets[0].headers.Authorization,packets[1].headers.Authorization)
})

test('execute 401 refreshes only authentication on manual replay, retaining every binding field and preventing duplicate clicks',async()=>{
 let serial=0,executeCalls=0,generations=0,tokens=0
 const packets=[]
 const transport=createPrivateLunaTransport(()=>{},async(_url,options)=>{
  packets.push(options)
  const body=JSON.parse(options.body)
  if(body.kind==='session')return Response.json({mode:'private-model',epoch:request.epoch,sessionId:request.sessionId})
  if(body.kind==='preview')return receipt(body.request)
  executeCalls++
  if(executeCalls===1)return unauthorized()
  generations++
  return Response.json(reply(body.request))
 },async()=> 'fake-token-'+(++tokens))
 const store=new ConversationStore(transport,()=> 'stable-id-'+(++serial)),id=active(store).id
 store.draft(id,'Câu hỏi giả định.')
 await store.send(id)
 const original=structuredClone(active(store).pending.request)
 assert.equal(active(store).error.code,'AUTHORIZATION_REQUIRED')
 await store.retry(id)
 assert.equal(active(store).error.code,'UNAUTHENTICATED')
 assert.equal(generations,0)
 assert.equal(active(store).messages.length,1)
 await Promise.all([store.retry(id),store.retry(id)])
 const executions=packets.filter(p=>JSON.parse(p.body).kind==='execute')
 assert.equal(executions.length,2)
 assert.equal(executions[0].body,executions[1].body)
 assert.notEqual(executions[0].headers.Authorization,executions[1].headers.Authorization)
 assert.deepEqual(JSON.parse(executions[1].body).request,{...original,kind:'replay'})
 assert.equal(generations,1)
 assert.equal(active(store).messages.length,2)
 assert.equal(serial,3) // conversation, original user message, original operation
})

test('unknown outcome, provider auth failure and lost server plan do not cause automatic retry or rebuilt preview',async()=>{
 for(const failure of ['network','OPENAI_AUTH','RESULT_UNKNOWN']){
  let previews=0,executes=0
  const transport=createPrivateLunaTransport(()=>{},async(_url,options)=>{
   const body=JSON.parse(options.body)
   if(body.kind==='preview'){previews++;return receipt(body.request)}
   executes++
   if(failure==='network')throw Error('unknown after dispatch')
   return Response.json({error:{code:failure,message:'Synthetic held error',retry:'none'}},{status:failure==='OPENAI_AUTH'?503:409})
  },async()=> 'fake-token')
  await assert.rejects(transport.send(request),{code:'AUTHORIZATION_REQUIRED'})
  await assert.rejects(transport.send({...request,kind:'replay'}),{code:failure==='network'?'CONNECTION':failure})
  assert.equal(previews,1);assert.equal(executes,1)
 }
 // A new transport cannot recover a lost approved plan by creating a preview.
 const packets=[]
 const restarted=createPrivateLunaTransport(()=>{throw Error('must not rebuild preview')},async(_url,options)=>{
  packets.push(JSON.parse(options.body))
  return Response.json({error:{code:'RESULT_UNKNOWN',message:'Plan lost',retry:'none'}},{status:409})
 },async()=> 'fake-token')
 await assert.rejects(restarted.send({...request,kind:'replay'}),{code:'RESULT_UNKNOWN',retry:'none'})
 assert.deepEqual(packets,[{kind:'execute',request:{...request,kind:'replay'}}])
 // A network failure during auth recovery must not leave a persistent right to
 // reconstruct the preview on a subsequent replay.
 const recoveryPackets=[]
 const recovery=createPrivateLunaTransport(()=>{},async(_url,options)=>{
  recoveryPackets.push(JSON.parse(options.body))
  if(recoveryPackets.length===1)return unauthorized()
  if(recoveryPackets.length===2)throw Error('lost response during authentication recovery')
  return Response.json({error:{code:'RESULT_UNKNOWN',message:'Plan lost',retry:'none'}},{status:409})
 },async()=> 'fake-token')
 await assert.rejects(recovery.send(request),{code:'UNAUTHENTICATED'})
 await assert.rejects(recovery.send({...request,kind:'replay'}),{code:'CONNECTION'})
 await assert.rejects(recovery.send({...request,kind:'replay'}),{code:'RESULT_UNKNOWN'})
 assert.deepEqual(recoveryPackets.map(p=>p.kind),['preview','preview','execute'])
})

test('simulation auth recovery also keeps request bytes and never silently creates a new operation',async()=>{
 let token=0
 const packets=[]
 const transport=createSimulationTransport(async(_url,options)=>{
  packets.push(options)
  return packets.length===1?unauthorized():Response.json(reply(JSON.parse(options.body),'simulation'))
 },async()=> 'fake-token-'+(++token))
 await assert.rejects(transport.send(request),{code:'UNAUTHENTICATED',retry:'replay'})
 assert.equal(packets.length,1)
 const replay={...request,kind:'replay'}
 await transport.send(replay)
 assert.deepEqual(JSON.parse(packets[0].body),request)
 assert.deepEqual(JSON.parse(packets[1].body),replay)
 assert.notEqual(packets[0].headers.Authorization,packets[1].headers.Authorization)
})

test('request body is captured before asynchronous token refresh, for both transports',async()=>{
 for(const privateMode of [true,false]){
  const r=structuredClone(request),original=structuredClone(r)
  let body
  const token=async()=>{r.messages[0].text='Changed while refreshing';return 'fake-token'}
  const fetcher=async(_url,options)=>{
   body=JSON.parse(options.body)
   return privateMode?receipt(original):Response.json(reply(original,'simulation'))
  }
  const transport=privateMode?createPrivateLunaTransport(()=>{},fetcher,token):createSimulationTransport(fetcher,token)
  if(privateMode)await assert.rejects(transport.send(r),{code:'AUTHORIZATION_REQUIRED'})
  else await transport.send(r)
  assert.deepEqual(privateMode?body.request:body,original)
 }
})

test('token timeout, HTTP timeout and non-JSON response are distinct; none automatically resends',async()=>{
 let calls=0
 const authentication=createPrivateLunaTransport(()=>{},async()=>{calls++;throw Error('must not fetch')},()=>new Promise(()=>{}),undefined,'api',{authentication:4,http:4})
 await assert.rejects(authentication.connect(),{code:'AUTH_TOKEN_TIMEOUT',status:401})
 assert.equal(calls,0)
 const failedToken=createPrivateLunaTransport(()=>{},async()=>{calls++;throw Error('must not fetch')},async()=>{throw Error('synthetic SDK initialization failure')})
 await assert.rejects(failedToken.connect(),{code:'AUTH_TOKEN_FAILED',status:401})
 assert.equal(calls,0)
 const http=createPrivateLunaTransport(()=>{},async(_url,options)=>{calls++;return new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Error('timeout'))))},async()=> 'fake-token',undefined,'api',{http:4})
 await assert.rejects(http.connect(),{code:'HTTP_TIMEOUT',status:504})
 assert.equal(calls,1)
 const parsing=createPrivateLunaTransport(()=>{},async()=>{calls++;return new Response('<html>not JSON</html>',{status:200})},async()=> 'fake-token')
 await assert.rejects(parsing.connect(),{code:'INVALID_HTTP_RESPONSE',status:502,retry:'none'})
 assert.equal(calls,2)
 const slowToken=createPrivateLunaTransport(()=>{},async(_url,options)=>{
  assert.equal(options.signal.aborted,false)
  return Response.json({mode:'private-model',epoch:request.epoch,sessionId:request.sessionId})
 },async()=>{await new Promise(resolve=>setTimeout(resolve,15));return 'fake-token'},undefined,'api',{authentication:100,http:4})
 await slowToken.connect()
})
