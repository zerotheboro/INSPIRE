// Synthetic MCP server. Marker records startup and actual calls separately.
import {appendFileSync} from 'node:fs'
import {createInterface} from 'node:readline'
const marker=process.argv[2]
appendFileSync(marker,'START\n')
createInterface({input:process.stdin}).on('line',line=>{
 const m=JSON.parse(line);if(m.id===undefined)return
 let result
 if(m.method==='initialize')result={protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'inspire-synthetic',version:'1'}}
 else if(m.method==='tools/list')result={tools:[{name:'canary',description:'Synthetic isolation test only',inputSchema:{type:'object',properties:{},additionalProperties:false}}]}
 else if(m.method==='tools/call'){appendFileSync(marker,'EXECUTED\n');result={content:[{type:'text',text:'SYNTHETIC_MCP_EXECUTED'}]}}
 else result={}
 process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result})+'\n')
})
