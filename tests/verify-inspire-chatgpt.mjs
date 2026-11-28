// Offline only. Allowlisted local checks; no app-server generation or API SDK.
import {spawnSync} from 'node:child_process'
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs'
import {join,dirname} from 'node:path'
const out=process.env.INSPIRE_REVIEW_EVIDENCE_DIR||'docs/evidence/chatgpt-connection-2026-11-23'
mkdirSync(out,{recursive:true})
const npm=join(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js')
const test=file=>['--import','./tests/register-ts.mjs','--test',file]
const tasks={session:test('tests/inspire-chatgpt-session.test.mjs'),boundary:test('tests/inspire-luna.test.mjs'),
 'full-path':test('tests/inspire-chatgpt-path.test.mjs'),
 conversation:test('tests/inspire-chat.test.mjs'),
 allowance:test('tests/inspire-evaluation-allowance.test.mjs'),
 sprint:test('tests/inspire-sprint.test.mjs'),
 'private-service':test('tests/inspire-chatgpt-emulator.test.mjs'),retrieval:test('tests/inspire-knowledge-conversation.test.mjs'),quotas:test('tests/inspire-emulator.test.mjs'),
 'functions-build':[npm,'--prefix','functions','run','build'],'website-build':[npm,'run','build'],
 lint:['functions/lint.cjs','src/inspireKnowledge.ts','src/inspireChatgptTransport.ts','src/inspireChatgptProfile.ts','src/inspireEvaluationAllowance.ts','src/inspireLocalService.ts','src/inspireChatgptSession.ts','src/inspireLunaService.ts','src/inspireLunaController.ts','src/inspireLuna.ts','src/inspireReviewReceipt.ts'],privacy:['tests/inspire-build-audit.mjs']}
let results={};try{results=JSON.parse(readFileSync(out+'/executed-checks.json')).results}catch{}
const names=process.argv.slice(2).length?process.argv.slice(2):Object.keys(tasks)
for(const name of names){
 if(!tasks[name])throw Error('OFFLINE_ALLOWLIST_ONLY')
 const start=Date.now(),r=spawnSync(process.execPath,tasks[name],{windowsHide:true,encoding:'utf8',maxBuffer:16*1024*1024,timeout:180000,env:{...process.env,INSPIRE_REVIEW_EVIDENCE_DIR:out,PYTHONDONTWRITEBYTECODE:'1',METADATA_SERVER_DETECTION:'none'}})
 writeFileSync(out+'/'+name+'.txt',(r.stdout??'')+(r.stderr??'')+'\nEXIT_CODE='+r.status+'\n')
 results[name]={executed:true,exitCode:r.status,error:r.error?.code??null,durationMs:Date.now()-start,command:[process.execPath,...tasks[name]]}
 writeFileSync(out+'/executed-checks.json',JSON.stringify({results,liveCalls:0,scope:'Focused offline checks; not a rerun or replacement of the historical 48/49 suite'},null,2))
 console.log(name+': '+r.status)
}
process.exitCode=names.every(n=>results[n].exitCode===0)?0:1
