// Explicit owner-selected direct API route. Startup/preview never generates.
import {spawn} from 'node:child_process'
import {resolve} from 'node:path'
import {readFileSync} from 'node:fs'
import {parseEnv} from 'node:util'
import {pathToFileURL} from 'node:url'
import {createServer} from 'node:net'

// Node's native dotenv parser; no expansion or frontend environment loading.
// Importing this module is inert. Only the requested backend key is selected.
export function fatherApiEnvironment(parent=process.env,file=resolve('functions/.env.local')) {
 if(!parent.LOCALAPPDATA)throw Error('LOCALAPPDATA required for authorization storage')
 const env={...parent,INSPIRE_FATHER_WEEKEND:'0',INSPIRE_PRIVATE_TEST:'1',INSPIRE_LUNA_API_PREVIEW:'1',INSPIRE_PRIVATE_CONVERSATION:'1',INSPIRE_BILLING_ROUTE:'api-key',INSPIRE_API_KEY_SOURCE:'functions/.env.local'}
 // Windows environment names are case-insensitive. An inherited key must not
 // win over the selected file, including when that file is absent or empty.
 for(const name of Object.keys(env))if(name.toUpperCase()==='OPENAI_API_KEY')delete env[name]
 env.OPENAI_API_KEY=''
 try {env.OPENAI_API_KEY=(parseEnv(readFileSync(file,'utf8').replace(/^\uFEFF/,'' )).OPENAI_API_KEY||'').trim()}
 catch(error){if(error?.code!=='ENOENT')throw Error('LOCAL_API_ENV_LOAD_HOLD')}
 return env
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 // Populate the child environment BEFORE Vite imports/initializes the adapter.
 const env=fatherApiEnvironment()
 let port
 for(const candidate of [5174]){
  const available=await new Promise(resolve=>{const probe=createServer();probe.once('error',()=>resolve(false));probe.listen(candidate,'127.0.0.1',()=>probe.close(()=>resolve(true)))})
  if(available){port=candidate;break}
 }
 if(!port)throw Error('INSPIRE_LOCAL_PORT_BUSY: fixed father:api URL uses 5174; do not start a second frontend')
 console.log(JSON.stringify({keyConfigured:Boolean(env.OPENAI_API_KEY)}))
 console.log('INSPIRE: http://127.0.0.1:'+port+'/ai-inspire?thu-rieng=1')
 const child=spawn(process.execPath,[resolve('node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',String(port),'--strictPort'],{env,stdio:'inherit',windowsHide:true})
 for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>child.kill(sig))
 child.once('exit',code=>process.exit(code??1))
}
