import test from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {join} from 'node:path'
import {mkdirSync,writeFileSync} from 'node:fs'
import {inspirePrototype} from '../vite.config.ts'
import {validateRequest} from '../functions/src/inspireChatContract.ts'
import {launcherEnvironment} from './start-inspire-emulators.mjs'

function middleware(){
  let handler,verified=0
  const plugin=inspirePrototype(()=>({verify:async()=>{verified++;return{uid:'synthetic'}},
    accounts:{account:async()=>({}),savePreferences:async(_,value)=>value},
    handle:async data=>{validateRequest(data);return{echo:data}}}))
  plugin.configureServer({middlewares:{use:(_,fn)=>{handler=fn}}})
  return {verified:()=>verified,async call(chunks){
    let code=200,body
    const req={method:'POST',headers:{'content-type':'application/json',host:'127.0.0.1:5173',authorization:'Bearer SYNTHETIC'},
      socket:{remoteAddress:'127.0.0.1'},async *[Symbol.asyncIterator](){yield*chunks}}
    const res={setHeader(){},set statusCode(value){code=value},end(value){body=JSON.parse(value)}}
    await handler(req,res);return{code,body}
  }}
}
const base={kind:'send',epoch:'epoch',sessionId:'session',operationId:'operation',conversationId:'conversation'}
test('actual middleware preserves fragmented Vietnamese, emoji, multi-turn context and explicit correction byte-for-byte',async()=>{
  const m=middleware()
  const text='  Tôi muốn được lắng nghe. 🌿 Bác – cháu; a\u0306 vẫn giữ nguyên.  '
  const original={...base,messages:[{id:'u1',role:'user',text},{id:'a1',role:'assistant',text:'Phản hồi giả định.'},
    {id:'u2',role:'user',text:'Đính chính: ý tôi là chuyện công việc, không phải gia đình. 🙂',correctionOf:'u1'}]}
  const raw=Buffer.from(JSON.stringify(original))
  const chunks=Array.from(raw,byte=>Buffer.from([byte]))
  const before=chunks.map(chunk=>chunk.toString()).join('')
  assert.notEqual(before,raw.toString('utf8'))
  const result=await m.call(chunks)
  assert.equal(result.code,200);assert.deepEqual(result.body.echo,original)
  const profile=await m.call(Array.from(Buffer.from(JSON.stringify({kind:'preferences',value:{name:'Bác Ánh 🌿',address:'Bác – cháu'}})),byte=>Buffer.from([byte])))
  assert.deepEqual(profile.body,{name:'Bác Ánh 🌿',address:'Bác – cháu'})
  mkdirSync('docs/evidence/scope-a040',{recursive:true})
  writeFileSync('docs/evidence/scope-a040/utf8-before-after.json',JSON.stringify({executed:true,scope:'actual Vite middleware, synthetic Auth/account stub; not an emulator end-to-end probe',
    originalText:text,priorPerChunkDecoding:JSON.parse(before).messages[0].text,
    actualMiddlewareText:result.body.echo.messages[0].text,exactContextAndCorrectionPreserved:true},null,2))
})
test('actual middleware rejects malformed UTF-8 and caps original raw bytes before Auth or paid execution',async()=>{
  const m=middleware()
  assert.equal((await m.call([Buffer.from([0xc3,0x28])])).body.error.code,'INVALID_UTF8')
  const oversized=Buffer.alloc(128001,0xff)
  const result=await m.call([oversized.subarray(0,127999),oversized.subarray(127999)])
  assert.equal(result.code,413);assert.equal(result.body.error.code,'BODY_LIMIT');assert.equal(m.verified(),0)
  assert.equal((await m.call([Buffer.from('{')])).body.error.code,'INVALID_JSON')
  // Exact boundary uses a syntactically valid JSON string; dispatch is irrelevant.
  const padding=Buffer.concat([Buffer.from('{"kind":"preferences","value":""}'),Buffer.alloc(128000-33,0x20)])
  assert.equal(padding.length,128000)
  assert.notEqual((await m.call([padding])).body.error?.code,'BODY_LIMIT')
})
test('Windows/POSIX JAVA_HOME PATH and portable discovery use correct delimiters/executables without mutating parent',()=>{
  const windows={JAVA_HOME:'C:\\JDK21',Path:'C:\\Windows;C:\\other',KEEP:'unchanged'},posix={JAVA_HOME:'/opt/jdk21',PATH:'/usr/bin:/bin'}
  const w=launcherEnvironment(windows,{platform:'win32',exists:()=>false}),p=launcherEnvironment(posix,{platform:'linux',exists:()=>false})
  assert.equal(w.Path,'C:\\JDK21\\bin;C:\\Windows;C:\\other');assert.equal(p.PATH,'/opt/jdk21/bin:/usr/bin:/bin')
  assert.deepEqual(windows,{JAVA_HOME:'C:\\JDK21',Path:'C:\\Windows;C:\\other',KEEP:'unchanged'})
  assert.deepEqual(posix,{JAVA_HOME:'/opt/jdk21',PATH:'/usr/bin:/bin'})
  const discovered=launcherEnvironment({PATH:'/bin'},{platform:'darwin',tools:'/tools',list:()=>['jdk-21-fixture'],exists:path=>path==='/tools'||path==='/tools/jdk-21-fixture/bin/java'})
  assert.equal(discovered.JAVA_HOME,'/tools/jdk-21-fixture');assert.equal(discovered.PATH,'/tools/jdk-21-fixture/bin:/bin')
  const winPortable=launcherEnvironment({Path:'C:\\Windows'},{platform:'win32',tools:'C:\\tools',list:()=>['jdk-21-fixture'],exists:path=>path==='C:\\tools'||path==='C:\\tools\\jdk-21-fixture\\bin\\java.exe'})
  assert.equal(winPortable.JAVA_HOME,'C:\\tools\\jdk-21-fixture')
  const env=launcherEnvironment(process.env),java=join(env.JAVA_HOME,'bin',process.platform==='win32'?'java.exe':'java')
  const executed=spawnSync(java,['-version'],{env,encoding:'utf8'})
  assert.equal(executed.status,0);assert.match(executed.stderr,/21\./)
  writeFileSync('docs/evidence/scope-a040/launcher-regression.json',JSON.stringify({executed:true,windowsConstruction:w.Path,posixConstruction:p.PATH,
    portableExecutableDiscovery:'java.exe on Windows; java on POSIX',actualHostJavaVersion:executed.stderr,parentEnvironmentUnchanged:true,
    limitation:'Windows runtime executed; POSIX environment/discovery simulated, not a Linux/macOS launcher run.'},null,2))
})
