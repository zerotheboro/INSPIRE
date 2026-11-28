// Optional operator command: managed ChatGPT login only, no thread/turn methods.
import {spawn,execFileSync} from 'node:child_process'
import {createInterface} from 'node:readline'
import {mkdirSync,writeFileSync,existsSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {privateChatgptConfig,isolatedChatgptEnvironment} from '../functions/src/inspireChatgptProfile.ts'
const profile=resolve(process.env.INSPIRE_CHATGPT_PROFILE||join(process.env.LOCALAPPDATA||'','INSPIRE-Private-ChatGPT'))
if(/onedrive|dropbox|google drive/i.test(profile)||profile.toLowerCase().startsWith(resolve('.').toLowerCase()))throw Error('Nonsynced private profile required')
if(!process.argv.includes('--login')){
 console.log('Prepared managed-login command. Set INSPIRE_CHATGPT_PROFILE to a nonsynced local folder, then run this script with --login. No account login or generation performed.');process.exit(0)
}
mkdirSync(profile,{recursive:true,mode:0o700})
const file=join(profile,'config.toml');if(!existsSync(file))writeFileSync(file,privateChatgptConfig(),{flag:'wx',mode:0o600})
const env=isolatedChatgptEnvironment(profile)
const binary=execFileSync('powershell.exe',['-NoProfile','-Command','(Get-Command codex).Source'],{encoding:'utf8',windowsHide:true}).trim()
const child=spawn(binary,['app-server','--stdio'],{cwd:profile,env,windowsHide:true,stdio:'pipe'})
child.stderr.resume();let id=0;const pending=new Map()
function rpc(method,params){if(!['initialize','account/read','account/login/start'].includes(method))throw Error('LOGIN_ONLY');return new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});child.stdin.write(JSON.stringify({id:n,method,params})+'\n')})}
createInterface({input:child.stdout}).on('line',line=>{try{const m=JSON.parse(line),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error('Managed login unavailable')):p.resolve(m.result)}else if(m.method==='account/login/completed'){console.log(m.params.success?'Đăng nhập hoàn tất. Generation vẫn bị khóa.':'Đăng nhập chưa hoàn tất.');child.kill()}else if(m.id!==undefined)child.stdin.write(JSON.stringify({id:m.id,error:{code:-32601,message:'Login only'}})+'\n')}catch{}})
const timer=setTimeout(()=>child.kill(),300000);child.on('exit',()=>clearTimeout(timer))
try{await rpc('initialize',{clientInfo:{name:'inspire_private_login',version:'1.0'}});child.stdin.write('{"method":"initialized","params":{}}\n');const a=await rpc('account/read',{refreshToken:false});if(a.account?.type==='chatgpt'){console.log('Profile riêng đã đăng nhập ChatGPT; chưa generation.');child.kill()}else{const r=await rpc('account/login/start',{type:'chatgpt'});if(r.type!=='chatgpt')throw Error('No billing fallback');console.log('Mở URL đăng nhập do app-server cấp trên máy này:\n'+r.authUrl+'\nKhông gửi token hoặc secret vào chat.')}}catch(e){console.error(e.message);child.kill();process.exitCode=1}
