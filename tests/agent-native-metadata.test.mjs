import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {inspectAgentWriteMetadata} from '../server/agent-write.mjs';
const exec=promisify(execFile);
test('原生macOS来源属性：目录/只读技能可读，不改属性；配置覆盖/隔离属性/ACL仍拒绝',{skip:process.platform!=='darwin'},async(t)=>{
 const dir=await fs.realpath(await fs.mkdtemp(join(tmpdir(),'wb539-meta-'))),file=join(dir,'SKILL.md');
 try{await fs.writeFile(file,'own test text');
  const attr=async p=>(await exec('/usr/bin/xattr',[p])).stdout;
  // Do not fabricate or modify OS provenance. Non-attributed environments lack this native scenario.
  if(!(await attr(dir)).includes('com.apple.provenance')||!(await attr(file)).includes('com.apple.provenance')) {t.skip('OS did not attribute this test process');return;}
  const beforeDir=await attr(dir),beforeFile=await attr(file);
  await inspectAgentWriteMetadata(dir,{readOnly:true});await inspectAgentWriteMetadata(file,{readOnly:true});
  await assert.rejects(inspectAgentWriteMetadata(file),/扩展属性|来源属性/);
  assert.equal(await attr(dir),beforeDir);assert.equal(await attr(file),beforeFile);
  await exec('/usr/bin/xattr',['-w','com.apple.quarantine','0081;00000000;WB539;',file]);
  await assert.rejects(inspectAgentWriteMetadata(file,{readOnly:true}),/扩展属性/);
  await exec('/usr/bin/xattr',['-d','com.apple.quarantine',file]);
  await exec('/usr/bin/xattr',['-w','user.wb539-unknown','test',file]);
  await assert.rejects(inspectAgentWriteMetadata(file,{readOnly:true}),/扩展属性/);
  await exec('/bin/chmod',['+a',`${process.env.USER} allow read`,dir]);
  await assert.rejects(inspectAgentWriteMetadata(dir,{readOnly:true}),/ACL/);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
