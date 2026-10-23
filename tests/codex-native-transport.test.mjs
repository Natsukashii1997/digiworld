import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connectCodex } from '../server/codex-native-transport.mjs';

test('native transport preserves full tool requests, replies and concurrent RPC IDs without CLI policy overrides', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'native-transport-'));
  const script = join(cwd, 'runtime.mjs');
  await writeFile(script, `
    import {createInterface} from 'node:readline';
    for await (const line of createInterface({input:process.stdin})) {
      const m=JSON.parse(line);
      if(m.method==='initialize') console.log(JSON.stringify({id:m.id,result:{userAgent:'native-test'}}));
      if(m.method==='turn/start') {
        console.log(JSON.stringify({id:m.id,result:{turn:{id:'turn-1'}}}));
        console.log(JSON.stringify({id:88,method:'item/commandExecution/requestApproval',params:{threadId:'t1',itemId:'i1',command:'read native binary'}}));
      }
      if(m.id===88 && m.result) console.log(JSON.stringify({method:'approval/observed',params:m.result}));
    }`);
  const events = [];
  const client = await connectCodex({ binary: process.execPath, args: [script], cwd, onMessage: m => events.push(m) });
  try {
    assert.equal(client.identity.userAgent, 'native-test');
    assert.deepEqual(await client.request('turn/start', {threadId:'t1',input:[]}), {turn:{id:'turn-1'}});
    for(let n=0;n<50&&!events.some(e=>e.id===88);n++) await new Promise(r=>setTimeout(r,10));
    assert.equal(events.find(e=>e.id===88).params.command,'read native binary');
    client.respond(88, {decision:'decline'});
    for(let n=0;n<50&&!events.some(e=>e.method==='approval/observed');n++) await new Promise(r=>setTimeout(r,10));
    assert.deepEqual(events.find(e=>e.method==='approval/observed').params,{decision:'decline'});
  } finally { await client.close(); await rm(cwd,{recursive:true,force:true}); }
});
