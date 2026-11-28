// Native Firebase Auth/Firestore export only. Never copies operator grants,
// API configuration, budget ledgers or any LocalAppData directory.
import {spawn,spawnSync} from 'node:child_process'
import {existsSync,mkdirSync,readFileSync,readdirSync,realpathSync,lstatSync,openSync,writeSync,fsyncSync,closeSync,renameSync,unlinkSync,cpSync} from 'node:fs'
import {resolve,join,relative,sep} from 'node:path'
import {createHash,randomUUID} from 'node:crypto'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
const workspace=resolve(fileURLToPath(new URL('..',import.meta.url)))
export const stateRoot=resolve(workspace,'.private.local/emulator-state')
const sha=bytes=>createHash('sha256').update(bytes).digest('hex')
const pause=ms=>new Promise(r=>setTimeout(r,ms))
function directory(root){mkdirSync(root,{recursive:true,mode:0o700});if(realpathSync(root).toLowerCase()!==resolve(root).toLowerCase())throw Error('EMULATOR_STATE_PATH_HOLD')}
function atomic(file,value){const temp=file+'.'+randomUUID()+'.pending',fd=openSync(temp,'wx',0o600);try{writeSync(fd,JSON.stringify(value,null,2));fsyncSync(fd)}finally{closeSync(fd)}renameSync(temp,file)}
export function snapshotFiles(folder){
 const files=[]
 const scan=path=>{for(const entry of readdirSync(path,{withFileTypes:true})){const p=join(path,entry.name);if(lstatSync(p).isSymbolicLink())throw Error('SNAPSHOT_SYMLINK_HOLD');if(entry.isDirectory())scan(p);else{const name=relative(folder,p).split(sep).join('/');if(name!=='firebase-export-metadata.json'&&!name.startsWith('firestore_export/')&&!name.startsWith('auth_export/'))throw Error('UNEXPECTED_SNAPSHOT_FILE');files.push({name,sha256:sha(readFileSync(p))})}}}
 scan(folder);return files.sort((a,b)=>a.name.localeCompare(b.name))
}
export function copyCompletedNativeExport(source,destination){
 // Windows/OneDrive may deny HubExport's final directory rename AFTER both
 // native exports and metadata are complete. Copy verified bytes, never retry
 // inference or accept an incomplete export. Preserve the failed staging tree.
 const files=snapshotFiles(source),meta=JSON.parse(readFileSync(join(source,'firebase-export-metadata.json'),'utf8'))
 if(!meta.firestore||!meta.auth||Object.keys(meta).some(k=>!['version','firestore','auth'].includes(k)))throw Error('INCOMPLETE_NATIVE_EXPORT')
 if(existsSync(destination)&&readdirSync(destination).length)throw Error('EXPORT_DESTINATION_NOT_EMPTY')
 cpSync(source,destination,{recursive:true,force:false,errorOnExist:true})
 if(JSON.stringify(files)!==JSON.stringify(snapshotFiles(destination))||JSON.stringify(files)!==JSON.stringify(snapshotFiles(source)))throw Error('NATIVE_EXPORT_COPY_CHANGED')
 return files
}
const stagingDirectories=root=>readdirSync(root,{withFileTypes:true}).filter(d=>d.isDirectory()&&/^firebase-export-\d+[A-Za-z0-9]+$/.test(d.name)).map(d=>d.name)
export function verifiedImport(root=stateRoot){
 directory(root)
 const file=join(root,'state.json');if(!existsSync(file))return null
 const state=JSON.parse(readFileSync(file,'utf8'))
 if(state.schema!=='inspire-emulator-state-v1'||state.status!=='clean')throw Error('UNCLEAN_EMULATOR_RESTART_HOLD: do not roll back quota or unknown attempts')
 if(!/^[a-f0-9-]{36}$/.test(state.snapshotId))throw Error('SNAPSHOT_ID_HOLD')
 const folder=join(root,'snapshots',state.snapshotId)
 if(realpathSync(folder).toLowerCase()!==resolve(folder).toLowerCase())throw Error('SNAPSHOT_PATH_HOLD')
 if(JSON.stringify(snapshotFiles(folder))!==JSON.stringify(state.files))throw Error('SNAPSHOT_INTEGRITY_HOLD')
 const metadata=JSON.parse(readFileSync(join(folder,'firebase-export-metadata.json'),'utf8'))
 if(!metadata.firestore||!metadata.auth||Object.keys(metadata).some(k=>!['version','firestore','auth'].includes(k)))throw Error('SNAPSHOT_SCOPE_HOLD')
 return folder
}
function admin(){process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';process.env.METADATA_SERVER_DETECTION='none';const require=createRequire(new URL('../functions/package.json',import.meta.url));const sdk=require('firebase-admin/app');if(!sdk.getApps().length)sdk.initializeApp({projectId:'demo-inspire'});if(sdk.getApp().options.projectId!=='demo-inspire')throw Error('DEMO_ONLY');return require('firebase-admin/firestore').getFirestore()}
async function endpoint(port){try{return (await fetch('http://127.0.0.1:'+port+'/',{signal:AbortSignal.timeout(1000)})).ok}catch{return false}}
function childExit(child){return new Promise((done,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?done():reject(Error('NATIVE_EXPORT_FAILED')))})}

export async function superviseEmulators(env,{recovery}={}){
 const root=stateRoot,importPath=recovery ? await recovery.prepare() : verifiedImport(root)
 for(const port of [8080,9099])if(await endpoint(port))throw Error('EXISTING_EMULATORS: do not replace running services')
 const token=randomUUID(),stateFile=join(root,'state.json'),requestFile=join(root,'stop.json')
 const state={schema:'inspire-emulator-state-v1',status:'running',token,pid:process.pid,startedAt:new Date().toISOString(),imported:!!importPath,importPath,
  ...(recovery ? {recovery:true} : {})}
 atomic(stateFile,state)
 const child=spawn(process.execPath,[resolve(workspace,'node_modules/firebase-tools/lib/bin/firebase.js'),'emulators:start','--only','auth,firestore','--project','demo-inspire','--config',join(workspace,'firebase.json'),...(importPath?['--import',importPath]:[])],{cwd:root,env:{...env,OPENAI_API_KEY:''},stdio:'inherit',windowsHide:true})
 state.childPid=child.pid;atomic(stateFile,state)
 let stopping=false,ready=false
 const bootstrap=(async()=>{
  for(let i=0;i<180;i++){
   if(await endpoint(8080)&&await endpoint(9099)){
    const db=admin()
    if(importPath){
     const index=await db.doc('inspireKnowledge/_index').get()
     if(recovery)await recovery.verify(db)
     else if(index.data()?.restoreStatus==='checkpointing')await index.ref.set({restoreStatus:'ready'},{merge:true})
    }
    ready=true;console.log(JSON.stringify({emulatorPersistence:'ready',importedNativeSnapshot:!!importPath,grantsAndBudgetFilesImported:false}));return
   }
   await pause(1000)
  }
  throw Error('EMULATOR_START_TIMEOUT')
 })()
 const stop=async()=>{
  if(stopping)return;stopping=true
  let completedSnapshot
  try{
   await bootstrap
   if(!ready)throw Error('EMULATOR_NOT_READY')
   const db=admin(),index=db.doc('inspireKnowledge/_index'),previous=await index.get()
   if(previous.exists&&previous.data().restoreStatus!=='ready')throw Error('INDEX_NOT_READY_TO_SNAPSHOT')
   if(previous.exists)await index.set({restoreStatus:'checkpointing'},{merge:true})
   const snapshotId=randomUUID(),folder=join(root,'snapshots',snapshotId)
   directory(folder) // New immutable export target; never --force an old one.
   const oldStaging=new Set(stagingDirectories(root))
   const exporter=spawn(process.execPath,[resolve(workspace,'node_modules/firebase-tools/lib/bin/firebase.js'),'emulators:export',folder,'--only','auth,firestore','--project','demo-inspire','--config',join(workspace,'firebase.json')],{cwd:root,env:{...env,OPENAI_API_KEY:''},stdio:'inherit',windowsHide:true})
   try{await childExit(exporter)}catch(error){
    const candidates=stagingDirectories(root).filter(n=>!oldStaging.has(n))
    if(candidates.length!==1)throw error
    copyCompletedNativeExport(join(root,candidates[0]),folder)
    console.log('Native export bytes recovered after Windows final-rename failure; staging preserved.')
   }
   const finalIndex=await index.get()
   if(previous.exists&&finalIndex.data()?.revision!==previous.data().revision)throw Error('INDEX_CHANGED_DURING_EXPORT')
   const clean={schema:'inspire-emulator-state-v1',status:'clean',snapshotId,files:snapshotFiles(folder),savedAt:new Date().toISOString()}
   atomic(join(root,'checkpoint.json'),clean)
   completedSnapshot=clean
   atomic(stateFile,clean)
   // Kill only the child tree started above, after a verified native export.
   const kill=spawnSync('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,encoding:'utf8'})
   if(kill.status!==0){console.error('Owned emulator taskkill exit status: '+kill.status);throw Error('EMULATOR_STOP_FAILED')}
   await db.terminate()
   console.log(JSON.stringify({emulatorPersistence:'stopped-clean',snapshotId,grantsOrBudgetRewritten:false}))
  }catch(error){
   atomic(stateFile,{...state,status:'hold',reason:error.message,completedSnapshot})
   console.error('EMULATOR_PERSISTENCE_HOLD: '+error.message)
   stopping=false
  }
 }
 const timer=setInterval(()=>{if(existsSync(requestFile)){const command=JSON.parse(readFileSync(requestFile,'utf8'));unlinkSync(requestFile);if(command.token===token)void stop()}},1000)
 process.on('SIGINT',()=>{void stop()});process.on('SIGTERM',()=>{void stop()})
 child.once('exit',()=>{clearInterval(timer);if(!stopping)console.error('EMULATOR_EXIT_UNCLEAN: next automatic import is held')})
 bootstrap.catch(e=>{console.error(e.message)})
}

export async function requestEmulatorStop(){
 directory(stateRoot);const state=JSON.parse(readFileSync(join(stateRoot,'state.json'),'utf8'))
 if(state.status!=='running'||!state.token||!Number.isInteger(state.pid))throw Error('NO_MANAGED_EMULATOR_TO_STOP')
 process.kill(state.pid,0)
 atomic(join(stateRoot,'stop.json'),{token:state.token})
 for(let i=0;i<180;i++){const after=JSON.parse(readFileSync(join(stateRoot,'state.json'),'utf8'));if(after.status==='hold')throw Error('PERSISTENCE_HOLD: '+after.reason);if(after.status==='clean'&&!(await endpoint(8080))&&!(await endpoint(9099)))return;await pause(1000)}
 throw Error('CONTROLLED_STOP_TIMEOUT')
}
