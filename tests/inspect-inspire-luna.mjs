// Read-only Codex metadata. No threads, turns, login changes, keys or inference.
import {spawn,execFileSync} from 'node:child_process'
import {createInterface} from 'node:readline'
import {mkdirSync,writeFileSync} from 'node:fs'
const out='docs/evidence/luna-private-2026-11-11'
mkdirSync(out,{recursive:true})
const binary=process.env.INSPIRE_CODEX_BIN||execFileSync('powershell.exe',[
  '-NoProfile','-Command','(Get-Command codex -ErrorAction Stop).Source'],{encoding:'utf8',windowsHide:true}).trim()
const child=spawn(binary,['app-server','--stdio'],{stdio:'pipe',windowsHide:true})
child.stderr.resume()
const waiting=new Map(),methods=[]
let sequence=0
function rpc(method,params={}){
  if(!['initialize','account/read','model/list','account/rateLimits/read'].includes(method))throw Error('METADATA_ONLY')
  methods.push(method)
  const id=++sequence
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{waiting.delete(id);reject(Error('METADATA_TIMEOUT'))},15000)
    waiting.set(id,{resolve,reject,timer})
    child.stdin.write(JSON.stringify({id,method,params})+'\n')
  })
}
createInterface({input:child.stdout}).on('line',line=>{
  try{
    const value=JSON.parse(line),pending=waiting.get(value.id)
    if(pending){clearTimeout(pending.timer);waiting.delete(value.id);value.error?pending.reject(Error('METADATA_RPC_HELD')):pending.resolve(value.result)}
    else if(value.method&&value.id!==undefined)child.stdin.write(JSON.stringify({id:value.id,error:{code:-32601,message:'Metadata inspection only'}})+'\n')
  }catch{/* Never record unfiltered process output or credentials. */}
})
child.on('error',()=>{for(const p of waiting.values()){clearTimeout(p.timer);p.reject(Error('METADATA_PROCESS_FAILED'))}waiting.clear()})
child.on('exit',()=>{for(const p of waiting.values()){clearTimeout(p.timer);p.reject(Error('METADATA_PROCESS_EXITED'))}waiting.clear()})
const evidence={inspectedAt:new Date().toISOString(),connection:'official Codex app-server over local stdio',
  requestedMethods:methods,generationRequests:0,apiKeyRead:false,privateExcerptsSent:false,
  account:null,lunaModels:[],usage:null,errors:[],paidOverageVerifiedDisabled:false}
try{
  await rpc('initialize',{clientInfo:{name:'inspire_readonly_inspector',title:'INSPIRE metadata only',version:'1.0'}})
  child.stdin.write(JSON.stringify({method:'initialized',params:{}})+'\n')
  for(const method of ['account/read','model/list','account/rateLimits/read']){
    try{
      const v=await rpc(method,method==='account/read'?{refreshToken:false}:method==='model/list'?{limit:100,includeHidden:false}:{})
      if(method==='account/read')evidence.account={type:v.account?.type??null,planType:v.account?.planType??null,requiresOpenaiAuth:v.requiresOpenaiAuth}
      if(method==='model/list')evidence.lunaModels=(v.data||[]).filter(m=>/luna/i.test(m.model||m.id||'')).map(m=>({model:m.model,id:m.id,displayName:m.displayName,hidden:m.hidden,defaultReasoningEffort:m.defaultReasoningEffort}))
      if(method==='account/rateLimits/read'){
        const r=v.rateLimits||{}
        const window=w=>w?{usedPercent:w.usedPercent,windowDurationMins:w.windowDurationMins,resetsAt:w.resetsAt}:null
        evidence.usage={planType:r.planType??null,primary:window(r.primary),secondary:window(r.secondary),rateLimitReachedType:r.rateLimitReachedType??null,
          creditDetailsPresent:!!r.credits,hasCredits:r.credits?.hasCredits??null,unlimited:r.credits?.unlimited??null}
      }
    }catch{evidence.errors.push({method,status:'UNVERIFIED_METADATA_UNAVAILABLE'})}
  }
}catch{evidence.errors.push({method:'initialize',status:'UNVERIFIED_METADATA_UNAVAILABLE'})}
finally{
  child.stdin.end();child.kill()
  for(const p of waiting.values())clearTimeout(p.timer)
  writeFileSync(out+'/connection-inspection.json',JSON.stringify(evidence,null,2))
}
console.log(JSON.stringify(evidence,null,2))
