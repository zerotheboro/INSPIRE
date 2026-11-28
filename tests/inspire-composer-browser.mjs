// Browser UI check only. Intercept every generation endpoint before dispatch.
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {existsSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {createRequire} from 'node:module'
import {setTimeout as pause} from 'node:timers/promises'
const root=resolve('.private.local/composer-browser-20261128')
const base=process.env.INSPIRE_TEST_URL || 'http://127.0.0.1:5173'
mkdirSync(root,{recursive:true})
const chrome=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync)
assert.ok(chrome)
const child=spawn(chrome,['--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking','--remote-debugging-port=9344','--user-data-dir='+resolve(root,'profile'),'about:blank'],{windowsHide:true,stdio:'ignore'})
let ws,serial=0;const waiting=new Map();const intercepted=[]
const readiness=process.argv.includes('--readiness')
const ready=process.argv.includes('--ready')
const flow=process.argv.includes('--flow')
function call(method,params={}){return new Promise((resolve,reject)=>{const id=++serial;const timer=setTimeout(()=>{waiting.delete(id);reject(Error('CDP timeout '+method))},15000);waiting.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}))})}
async function evaluate(expression){const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value}
async function until(expression){for(let i=0;i<100;i++){if(await evaluate(expression))return;await pause(100)}throw Error('Browser condition failed: '+expression)}
try{
 let tabs
 for(let i=0;i<60;i++){try{tabs=await fetch('http://127.0.0.1:9344/json/list').then(r=>r.json());break}catch{await pause(200)}}
 assert.ok(tabs,'Chromium CDP not available')
 ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl)
 await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true})})
 ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=waiting.get(m.id);if(p){clearTimeout(p.timer);waiting.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result)}}
  if(m.method==='Fetch.requestPaused'){const p=m.params;let kind;try{kind=JSON.parse(p.request.postData).kind}catch{}
   if((readiness || flow) && p.request.url.endsWith('/api/inspire-luna') && (['session','budget-status'].includes(kind) || flow && kind==='conversation' && base==='http://127.0.0.1:5180')){void call('Fetch.continueRequest',{requestId:p.requestId});return}
   intercepted.push(p.request.url);void call('Fetch.fulfillRequest',{requestId:p.requestId,responseCode:503,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify({error:{code:'OFFLINE_BROWSER_GUARD',message:'Offline browser check',retry:'none'}})).toString('base64')})}})
 await call('Page.enable');await call('Runtime.enable')
 await call('Fetch.enable',{patterns:[{urlPattern:'*/api/inspire-luna*'},{urlPattern:'*/api/inspire-chatgpt*'}]})
 await call('Page.navigate',{url:base+'/ai-inspire'})
 await until("document.readyState==='complete' && !!document.querySelector('#inspire-message')")
 if(process.argv.includes('--owner-identity')){
  assert.equal(base,'http://127.0.0.1:5174')
  Object.assign(process.env,{FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099'})
  const req=createRequire(new URL('../functions/package.json',import.meta.url)),apps=req('firebase-admin/app')
  if(!apps.getApps().length)apps.initializeApp({projectId:'demo-inspire'})
  const admin=req('firebase-admin/auth').getAuth()
  const uid=JSON.parse(readFileSync(join(process.env.LOCALAPPDATA,'INSPIRE-Luna/private-session/father-2026-11-26/identity.json'))).uid
  await admin.getUser(uid)
  const custom=await admin.createCustomToken(uid)
  await until("performance.getEntriesByType('resource').some(r=>r.name.includes('/firebase_auth.js'))")
  await evaluate(`(async()=>{const resources=performance.getEntriesByType('resource');const app=await import(resources.find(r=>r.name.includes('/firebase_app.js')).name);const sdk=await import(resources.find(r=>r.name.includes('/firebase_auth.js')).name);for(let i=0;i<80;i++){const current=app.getApps().find(a=>a.name==='inspire-local');if(current){await sdk.signInWithCustomToken(sdk.getAuth(current),${JSON.stringify(custom)});return true}await new Promise(r=>setTimeout(r,100))}throw Error('Official SDK app not initialized')})()`)
  await until("!!document.querySelector('[data-testid=quota]') && document.querySelector('.ip-mode').textContent.includes('INSPIRE AI · Bản thử riêng')")
 }
 await evaluate('document.fonts.ready.then(()=>true)')
 await evaluate("document.querySelector('#inspire-message').scrollIntoView({block:'center',behavior:'instant'})")
 await pause(200)
 const point=await evaluate("(()=>{const t=document.querySelector('#inspire-message'),r=t.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,disabled:t.disabled,readOnly:t.readOnly}})()")
 assert.equal(point.disabled,false);assert.equal(point.readOnly,false)
 console.log(JSON.stringify({point,hit:await evaluate(`(()=>{const e=document.elementFromPoint(${point.x},${point.y});return {tag:e?.tagName,id:e?.id,classes:e?.className,width:innerWidth,height:innerHeight}})()`)}))
 await call('Input.dispatchMouseEvent',{type:'mousePressed',x:point.x,y:point.y,button:'left',clickCount:1});await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x,y:point.y,button:'left',clickCount:1})
 assert.equal(await evaluate("document.activeElement.id"),'inspire-message')
 await call('Input.insertText',{text:'Hôm nay tôi muốn đọc sách.'})
 await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8})
 await call('Input.insertText',{text:' và nghỉ ngơi.'})
 await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,modifiers:8})
 await call('Input.dispatchKeyEvent',{type:'char',text:'\r',key:'Enter',modifiers:8})
 await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,modifiers:8})
 await call('Input.insertText',{text:'Dòng thứ hai.'})
 const draft=await evaluate("document.querySelector('#inspire-message').value")
 assert.equal(draft,'Hôm nay tôi muốn đọc sách và nghỉ ngơi.\nDòng thứ hai.')
 // Let backend readiness polling settle: it must not erase the draft.
 await pause(8000)
 assert.equal(await evaluate("document.querySelector('#inspire-message').value"),draft)
 if(flow){
  await until("!document.querySelector('.ip-composer button').disabled")
  await evaluate("document.querySelector('.ip-composer button').click()")
  await until("[...document.querySelectorAll('.ip-message-body')].some(e=>e.textContent.includes('provider giả'))")
  const trace=await evaluate("JSON.parse(document.querySelector('.ip-private-setup pre').textContent).connection")
  assert.ok(trace.sourceCount>0&&trace.sourceCount<=3)
  assert.ok(trace.controller.some(c=>c.phase==='preflight'));assert.ok(trace.controller.some(c=>c.phase==='candidate'&&c.validatedSHA))
  writeFileSync(resolve(root,'flow.json'),JSON.stringify({executed:true,provider:'synthetic',originalController:true,trace},null,2))
  console.log(JSON.stringify({uiSendThroughLunaEndpoint:true,realRAGPassages:trace.sourceCount,originalControllerValidated:true,displayed:true,realModelCalls:0}))
  process.exitCode=0
  ws.close();child.kill();
 } else {
 if(ready)await until("!document.querySelector('.ip-composer button').disabled")
 else assert.equal(await evaluate("document.querySelector('.ip-composer button').disabled"),true)
 assert.ok(!(await evaluate("document.querySelector('.ip-mode').textContent")).includes('Mô phỏng'))
 await evaluate("document.querySelector('a[href=\"/tham-van-tam-ly\"]').click()")
 await until("location.pathname==='/tham-van-tam-ly' && !!document.querySelector('.main-nav')")
 assert.equal(await evaluate("[...document.querySelectorAll('.main-nav a')].find(a=>a.textContent.trim()==='AI Inspire').getAttribute('href')"),'/ai-inspire?thu-rieng=1')
 await evaluate("[...document.querySelectorAll('.main-nav a')].find(a=>a.textContent.trim()==='AI Inspire').click()")
 await until("location.pathname==='/ai-inspire' && !!document.querySelector('#inspire-message')")
 assert.equal(await evaluate("document.querySelector('#inspire-message').value"),draft)
 await until("!document.querySelector('.ip-mode').textContent.includes('Đang kiểm tra')")
 let connection
 if(readiness){
  await until("!!document.querySelector('[data-testid=quota]') && !!document.querySelector('.ip-private-setup pre') && document.querySelector('.ip-private-setup pre').textContent.includes('released')")
  connection=await evaluate("(()=>{const d=JSON.parse(document.querySelector('.ip-private-setup pre').textContent);return {rag:d.rag,budget:d.connection?.budget,quota:document.querySelector('[data-testid=quota]').textContent}})()")
 }
 await call('Emulation.setDeviceMetricsOverride',{width:1365,height:900,deviceScaleFactor:1,mobile:false})
 await evaluate("document.querySelector('#inspire-message').scrollIntoView({block:'center'})")
 const desktop=await call('Page.captureScreenshot',{format:'png'})
 writeFileSync(resolve(root,'desktop.png'),Buffer.from(desktop.data,'base64'))
 await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true})
 await evaluate("document.querySelector('#inspire-message').scrollIntoView({block:'center'})")
 await pause(200)
 const mobile=await evaluate("(()=>{const r=document.querySelector('#inspire-message').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()")
 await call('Input.dispatchMouseEvent',{type:'mousePressed',...mobile,button:'left',clickCount:1});await call('Input.dispatchMouseEvent',{type:'mouseReleased',...mobile,button:'left',clickCount:1})
 await call('Input.dispatchKeyEvent',{type:'keyDown',key:'End',code:'End',windowsVirtualKeyCode:35,modifiers:2});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'End',code:'End',windowsVirtualKeyCode:35,modifiers:2})
 await call('Input.insertText',{text:' Thêm trên màn hình nhỏ.'})
 assert.equal(await evaluate("document.querySelector('#inspire-message').value"),draft+' Thêm trên màn hình nhỏ.')
 const screenshot=await call('Page.captureScreenshot',{format:'png'})
 writeFileSync(resolve(root,'mobile.png'),Buffer.from(screenshot.data,'base64'))
 const evidence={executed:true,vietnameseTyping:true,clickFocus:true,editDelete:true,newline:true,pollingPreservesDraft:true,menuPreservesPrivateRoute:true,navigationPreservesDraft:true,mobileTyping:true,sendBlocked:!ready,modelRequests:0,intercepted:intercepted.length,badge:await evaluate("document.querySelector('.ip-mode').textContent"),reason:await evaluate("document.querySelector('#inspire-send-status').textContent")}
 if(readiness)evidence.connection=connection
 writeFileSync(resolve(root,readiness?'readiness.json':'result.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence))
 }
}catch(error){
 if(ws?.readyState===1){
  const diagnostic=await evaluate("(()=>{const pre=document.querySelector('.ip-private-setup pre');return {badge:document.querySelector('.ip-mode')?.textContent,reason:document.querySelector('#inspire-send-status')?.textContent,account:document.querySelector('.ip-account-summary')?.textContent,errors:[...document.querySelectorAll('.ip-error')].map(e=>e.textContent),diagnostic:pre?.textContent}})()")
  writeFileSync(resolve(root,'browser-failure.json'),JSON.stringify(diagnostic,null,2));console.log(JSON.stringify(diagnostic))
 }
 throw error
}finally{ws?.close();child.kill()}
