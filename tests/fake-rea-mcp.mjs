import {createInterface} from 'node:readline';
import {writeFile} from 'node:fs/promises';
import {fakeTools} from './fake-rea-update.mjs';
const output=process.argv[2],methods=[];
const lines=createInterface({input:process.stdin});
for await(const line of lines){const m=JSON.parse(line);methods.push(m.method);await writeFile(output,JSON.stringify({methods,target:process.env.HOPPER_TARGET_PATH||null,profile:process.env.REA_MCP_INPUT_SCHEMA_PROFILE}));if(m.id)console.log(JSON.stringify({jsonrpc:'2.0',id:m.id,result:m.method==='initialize'?{protocolVersion:'2025-11-25',serverInfo:{name:'rea',version:'6.5.0'},capabilities:{tools:{}}}:{tools:fakeTools()}}));}
