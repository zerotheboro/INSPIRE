// Local launcher: pins source-free simulation and held ChatGPT previews.
import {spawn} from 'node:child_process'
import {resolve} from 'node:path'
import {homedir} from 'node:os'
const env={...process.env, INSPIRE_FATHER_WEEKEND:'1', INSPIRE_PRIVATE_TEST:'1',
  INSPIRE_LUNA_API_PREVIEW:'0', INSPIRE_BILLING_ROUTE:'chatgpt',
  LOCALAPPDATA:process.env.LOCALAPPDATA || resolve(homedir(), '.local', 'state')}
delete env.OPENAI_API_KEY
const p=spawn(process.execPath,[resolve('node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5173','--strictPort'],{env,stdio:'inherit'})
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>p.kill(sig))
p.once('exit',c=>process.exit(c??1))
