// Offline route regression: all HTTP replies are synthetic; no provider call.
import test from 'node:test'
import assert from 'node:assert/strict'
import {createDisconnectedPrivateTransport, createPrivateConversationTransport} from '../src/services/InspireAIconnect.ts'

const request = {kind:'send',epoch:'test-epoch',sessionId:'test-session',operationId:'test-operation',conversationId:'test-conversation',messages:[{id:'test-message',role:'user',text:'Câu hỏi giả định.'}]}
const answer = {mode:'private-model',epoch:request.epoch,sessionId:request.sessionId,operationId:request.operationId,conversationId:request.conversationId,replyTo:'test-message',message:{id:'test-answer',role:'assistant',text:'Phản hồi giả lập của transport.'}}

test('private Gửi selects Luna conversation endpoint, never simulation or ChatGPT preview',async()=>{
 const calls=[]
 const transport=createPrivateConversationTransport(()=>{},async(url,options)=>{
  calls.push({url,body:JSON.parse(options.body)})
  if(calls.length===1)return Response.json({mode:'private-model',epoch:request.epoch,sessionId:request.sessionId,budget:{released:true}})
  return Response.json({response:answer,diagnostics:{sourceCount:0}})
 },async()=> 'synthetic-sdk-token')
 await transport.connect()
 assert.deepEqual(await transport.send(request),answer)
 assert.deepEqual(calls.map(c=>[c.url,c.body.kind]),[['/api/inspire-luna','session'],['/api/inspire-luna','conversation']])
 assert.deepEqual(calls[1].body.request,request)
})

test('disconnected private transport cannot silently send through simulation',async()=>{
 const transport=createDisconnectedPrivateTransport()
 await assert.rejects(transport.connect(),{code:'PRIVATE_DISCONNECTED'})
 await assert.rejects(transport.send(request),{code:'PRIVATE_DISCONNECTED'})
})

test('private network failure makes one HTTP attempt and never retries or falls back',async()=>{
 let calls=0
 const transport=createPrivateConversationTransport(()=>{},async()=>{calls++;throw Error('offline connection failure')},async()=> 'synthetic-sdk-token')
 await assert.rejects(transport.send(request),{code:'CONNECTION'})
 assert.equal(calls,1)
})
