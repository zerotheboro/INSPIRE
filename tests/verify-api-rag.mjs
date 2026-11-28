// Allowlisted offline/emulator checks only. No authorization or real inference.
import {spawnSync} from 'node:child_process'
import {mkdirSync,writeFileSync} from 'node:fs'
import {join,dirname} from 'node:path'
// Keep earlier failing runs intact; choose a fresh directory explicitly.
const out=process.env.INSPIRE_REVIEW_EVIDENCE_DIR||'docs/evidence/api-rag-2026-11-25/resume-final';mkdirSync(out,{recursive:true})
const npm=join(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js'),test=f=>['--import','./tests/register-ts.mjs','--test',f]
const tasks={api:test('tests/inspire-luna-api.test.mjs'),safeguards:test('tests/inspire-api-rag.test.mjs'),conversation:test('tests/inspire-chat.test.mjs'),retrieval:test('tests/inspire-knowledge-conversation.test.mjs'),pagination:test('tests/inspire-pagination.test.mjs'),corpus:['--import','./tests/register-ts.mjs','tests/verify-api-rag-corpus.mjs'],quotas:test('tests/inspire-emulator.test.mjs'),backend:[npm,'--prefix','functions','run','build'],website:[npm,'run','build'],lint:['functions/lint.cjs','src/inspireLunaApi.ts','src/inspireLunaService.ts','src/inspireKnowledge.ts','src/inspireLocalService.ts','src/inspireReviewReceipt.ts'],privacy:['tests/inspire-build-audit.mjs']}
const results={};for(const name of process.argv.slice(2).length?process.argv.slice(2):Object.keys(tasks)){
 if(!tasks[name])throw Error('OFFLINE_ALLOWLIST_ONLY')
 const r=spawnSync(process.execPath,tasks[name],{encoding:'utf8',windowsHide:true,timeout:600000,maxBuffer:16000000,env:{...process.env,INSPIRE_REVIEW_EVIDENCE_DIR:out}})
 writeFileSync(out+'/'+name+'.txt',(r.stdout||'')+(r.stderr||'')+'\nEXIT_CODE='+r.status+'\n');results[name]={exitCode:r.status,error:r.error?.code??null};console.log(name+': '+r.status)
 writeFileSync(out+'/results.json',JSON.stringify({results,paidCalls:0,scope:'Focused offline/emulator checks; historical 48/49 unchanged'},null,2))
}process.exitCode=Object.values(results).every(r=>r.exitCode===0)?0:1
