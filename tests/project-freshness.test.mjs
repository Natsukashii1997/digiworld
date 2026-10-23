import test from 'node:test';
import assert from 'node:assert/strict';
import {projectStatusKey,projectLaunchSignature} from '../src/project-freshness.js';
test('project freshness is invalidated by source changes but not unrelated workspace writes',()=>{
 const base={connections:{projects:[{id:'p',active:true,localPaths:['/one']}],roots:['/'],contextBindings:{p:{currentPath:'CURRENT.md'}},projectScannedAt:'one'}};
 assert.equal(projectStatusKey(base),projectStatusKey({...base,revision:2,notes:[{text:'new'}]}));
 for(const c of [{roots:['/new']},{projects:[{id:'p',active:true,localPaths:['/two']}]},{contextBindings:{p:{currentPath:'docs/CURRENT.md'}}},{projectScannedAt:'two'},{projectCatalog:[{projectId:'p',displayName:'new'}]}])assert.notEqual(projectStatusKey(base),projectStatusKey({connections:{...base.connections,...c}}));
});
test('same state ID cannot hide changed next step, owner, handoff or root',()=>{
 const item={projectId:'p',root:'/one',current:{state:'ok',path:'CURRENT.md',fields:{stateId:'same',writer:'a',next:'one',handoff:{href:'a'}}}};
 for(const fields of [{next:'two'},{writer:'b'},{handoff:{href:'b'}}])assert.notEqual(projectLaunchSignature(item),projectLaunchSignature({...item,current:{...item.current,fields:{...item.current.fields,...fields}}}));
 assert.notEqual(projectLaunchSignature(item),projectLaunchSignature({...item,root:'/two'}));
 assert.equal(projectLaunchSignature(item),projectLaunchSignature({...item,activity:{latestAt:'new'}}));
});
