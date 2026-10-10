import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,readFile,writeFile,symlink,rm,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {ensureSenseVoiceModels} from '../server/collection/lib/local-speech-model.mjs';

test('模型首次并发下载单飞，marker链接不会越界写入，损坏模型重新校验',async()=>{
  const root=await mkdtemp(join(tmpdir(),'guiji-collection-model-'));
  try {
    const bytes=Buffer.from('synthetic model, not a real model');
    const asset={filename:'model.gguf',url:'https://fixture.invalid/model',size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
    const version=join(root,'sensevoice-small-q8-v1');await mkdir(version);
    const outside=join(root,'outside.txt');await writeFile(outside,'unchanged');await symlink(outside,join(version,'verified.json'));
    let downloads=0;
    const options={assets:[asset],fetchImpl:async()=>{downloads++;await new Promise(resolve=>setTimeout(resolve,20));return new Response(bytes);}};
    const results=await Promise.all(Array.from({length:3},()=>ensureSenseVoiceModels(root,options)));
    assert.equal(downloads,1);assert.deepEqual(results[0],results[2]);assert.equal(await readFile(outside,'utf8'),'unchanged');
    assert.equal((await readdir(version)).filter(name=>name.endsWith('.part')||name.endsWith('.tmp')).length,0);
    await writeFile(join(version,'model.gguf'),Buffer.alloc(bytes.length));
    await ensureSenseVoiceModels(root,options);assert.equal(downloads,2);assert.deepEqual(await readFile(join(version,'model.gguf')),bytes);
  } finally {await rm(root,{recursive:true,force:true});}
});
