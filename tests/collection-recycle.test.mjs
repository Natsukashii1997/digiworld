import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, rm, writeFile, appendFile, symlink, link, mkdir, lstat, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { collectionFixture, syntheticNote } from './collection-fixture.mjs';

const recycle = app => app.api('/recycle');
const organize = app => app.api('/recycle/organize', {});
const restore = (app, item) => app.api(`/recycle/${item.recycleId}/restore`, {});
async function deleted(app, index = 1, extra = {}) {
  await app.importNote(syntheticNote(index, extra));
  const note = (await app.api('/notes')).notes.find(n => n.id === syntheticNote(index).id);
  await app.api('/notes/' + note.id, undefined, 'DELETE');
  return note;
}

test('回收整理移动原媒体、唯一正文快照、标识、幂等和完整恢复', async () => {
  const opened = [], app = await collectionFixture({ platform:'darwin', runOpen:async path => opened.push(path) });
  try {
    const note = await deleted(app, 1, { title:'合成 / 已删除：笔记', content:'只属于删除快照的正文' });
    assert.equal((await recycle(app)).items[0].status, 'pending');
    const organized = await organize(app), item = organized.items[0];
    assert.equal(item.status, 'organized'); assert.equal(organized.organizedCount, 1);
    assert.equal(item.canRestore, true); assert.ok(item.path.startsWith(join(app.directory, 'collection/recycle/')));
    assert.match(await readFile(join(item.path, '笔记.txt'), 'utf8'), /已删除[\s\S]*只属于删除快照的正文[\s\S]*图片识别/);
    assert.ok(!JSON.stringify(await app.readCollection()).includes('只属于删除快照的正文'));
    assert.ok(await readFile(join(item.path, 'files/media', note.id, '01.png')));
    await assert.rejects(readFile(join(app.directory, 'collection/versions', note.mediaVersion, 'media', note.id, '01.png')), { code:'ENOENT' });
    assert.equal((await organize(app)).organizedCount, 0);
    await app.api('/recycle/open', {}); await app.api(`/recycle/${item.recycleId}/open`, {});
    assert.deepEqual(opened, [join(app.directory, 'collection/recycle'), item.path]);
    await assert.rejects(app.api('/recycle/open', { path:'/tmp' }), { status:400 });
    await restore(app, item); assert.equal((await recycle(app)).items.length, 0);
    const active = (await app.api('/notes')).notes[0]; assert.equal(active.content, '只属于删除快照的正文');
    assert.equal((await fetch(app.url + active.coverUrl)).status, 200);
    assert.ok((await readdir(join(app.directory, 'collection/recycle'))).includes(item.folder));
    assert.ok(await readFile(join(item.path,'note.json')));
    await assert.rejects(readFile(join(item.path,'files/media',note.id,'01.png')), {code:'ENOENT'});
  } finally { await app.close(); }
});

test('人工删除整个目录不复活，部分删除/篡改不伪造可恢复状态', async () => {
  const app = await collectionFixture(); try {
    await deleted(app, 2); let item = (await organize(app)).items[0];
    await rm(join(item.path, 'files/media', item.noteId, '01.png'));
    assert.equal((await recycle(app)).items[0].status, 'incomplete');
    await assert.rejects(restore(app, item), { status:409 });
    await rm(item.path, { recursive:true });
    assert.equal((await organize(app)).items[0].status, 'missing');
    await assert.rejects(readFile(join(item.path, 'note.json')), { code:'ENOENT' });
    await assert.rejects(restore(app, item), { status:409 });
    await deleted(app, 3); item = (await organize(app)).items.find(x => x.noteId === syntheticNote(3).id);
    await writeFile(join(item.path, 'note.json'), '{}');
    assert.equal((await recycle(app)).items.find(x => x.recycleId === item.recycleId).status, 'incomplete');
    await assert.rejects(restore(app, item), { status:409 });
  } finally { await app.close(); }
});

test('同帖子多次删除独立整理，活跃新版和未知历史版本不移动，恢复不覆盖', async () => {
  const app = await collectionFixture(); try {
    const old = await deleted(app, 4); await app.importNote(syntheticNote(4, { title:'新收藏' }));
    const active = (await app.api('/notes')).notes[0]; let item = (await organize(app)).items[0];
    await assert.rejects(restore(app, item), { status:409 });
    assert.equal((await fetch(app.url + active.coverUrl)).status, 200);
    await app.api('/notes/' + active.id, undefined, 'DELETE');
    const list = await organize(app); assert.equal(list.items.length, 2);
    assert.equal(new Set(list.items.map(x => x.recycleId)).size, 2);
    assert.ok(list.items.some(x => x.mediaVersion === old.mediaVersion));
    await restore(app, item); assert.equal((await app.api('/notes')).notes[0].title, old.title);
    await app.importNote(syntheticNote(5)); const first = (await app.api('/notes')).notes[0];
    await app.importNote(syntheticNote(5)); await app.api('/notes/' + first.id, undefined, 'DELETE');
    await organize(app); assert.ok(await readFile(join(app.directory, 'collection/versions', first.mediaVersion, 'media', first.id, '01.png')));
  } finally { await app.close(); }
});

test('旧删除记录和纯文本可整理，缺失的源媒体不宣称完整', async () => {
  const app = await collectionFixture(); try {
    const manual = await app.api('/notes/manual', { url:'https://fixture.invalid/text', title:'纯文本', summary:'文本内容' });
    await app.api('/notes/' + manual.note.id, undefined, 'DELETE');
    const state = await app.readCollection(); delete state.trash[0].recycleId;
    await writeFile(join(app.directory, 'collection/state.json'), JSON.stringify({ state, sha256:createHash('sha256').update(JSON.stringify(state)).digest('hex') }));
    const id = (await recycle(app)).items[0].recycleId;
    const item = (await organize(app)).items[0]; assert.equal(item.recycleId, id); assert.equal(item.canRestore, true);
    await restore(app, item); assert.equal((await app.api('/notes')).notes[0].content, '文本内容');
    const note = await deleted(app, 6); await rm(join(app.directory, 'collection/versions', note.mediaVersion), { recursive:true });
    const partial = (await organize(app)).items[0]; assert.equal(partial.status, 'incomplete'); assert.equal(partial.canRestore, false);
  } finally { await app.close(); }
});

test('跨移动和状态提交中断可核对续接；恢复中断不重复移动', async () => {
  for (const stage of ['afterPlan', 'afterArchive', 'afterMove', 'afterRestoreMove']) {
    let armed = false, crashed = false;
    const app = await collectionFixture({ recycleCheckpoint:async point => { if (armed && !crashed && point === stage) { crashed = true; throw new Error('合成中断'); } } });
    try {
      await deleted(app, 7);
      if (stage === 'afterRestoreMove') {
        const item = (await organize(app)).items[0]; armed = true;
        await assert.rejects(restore(app, item), { status:500 });
        assert.equal((await recycle(app)).items[0].status, 'restoring');
        await restore(app, item); assert.equal((await app.api('/notes')).notes.length, 1);
      } else {
        armed = true; const failed = await organize(app); assert.equal(failed.errors.length, 1);
        const complete = await organize(app); assert.equal(complete.items[0].status, 'organized');
        assert.equal((await readdir(join(app.directory, 'collection/recycle'))).length, 1);
        await restore(app, complete.items[0]); assert.equal((await app.api('/notes')).notes.length, 1);
      }
      assert.equal(crashed, true);
    } finally { await app.close(); }
  }
});

test('符号链接、硬链接和路径替换闭锁，外部文件不动', async () => {
  for (const kind of ['root-link', 'media-link', 'hard-link', 'target-conflict']) {
    const app = await collectionFixture(); try {
      const note = await deleted(app, 8), outside = join(app.directory, 'outside'); await mkdir(outside); await writeFile(join(outside, 'keep'), '不动');
      const file = join(app.directory, 'collection/versions', note.mediaVersion, 'media', note.id, '01.png');
      if (kind === 'root-link') await symlink(outside, join(app.directory, 'collection/recycle'));
      if (kind === 'media-link') { await rm(file); await symlink(join(outside, 'keep'), file); }
      if (kind === 'hard-link') await link(file, join(outside, 'copy'));
      if (kind === 'target-conflict') { const item = (await recycle(app)).items[0]; await mkdir(item.path, { recursive:true }); await writeFile(join(item.path, 'note.json'), '{}'); }
      const result = await organize(app).catch(error => ({ errors:[error] })); assert.ok(result.errors.length);
      assert.equal(await readFile(join(outside, 'keep'), 'utf8'), '不动'); assert.equal((await app.api('/notes')).notes.length, 0);
    } finally { await app.close(); }
  }
});

test('手动编辑文字保留不删除，反向中断后媒体缺失如实显示', async () => {
  let armed=false, crashed=false;
  const app=await collectionFixture({recycleCheckpoint:async point=>{if(armed&&!crashed&&point==='afterRestoreMove'){crashed=true;throw new Error('合成恢复中断');}}});
  try {
    await deleted(app,9);const item=(await organize(app)).items[0];await appendFile(join(item.path,'笔记.txt'),'\n我的人工备注');
    assert.equal((await recycle(app)).items[0].status,'incomplete');await assert.rejects(restore(app,item),{status:409});assert.match(await readFile(join(item.path,'笔记.txt'),'utf8'),/我的人工备注/);
    const note=await deleted(app,10), next=(await organize(app)).items.find(value=>value.noteId===note.id);armed=true;await assert.rejects(restore(app,next),{status:500});
    await rm(join(app.directory,'collection/versions',note.mediaVersion,'media',note.id,'01.png'));
    const interrupted=(await recycle(app)).items.find(value=>value.noteId===note.id);assert.equal(interrupted.status,'incomplete');assert.equal(interrupted.canRestore,false);
  } finally {await app.close();}
});

test('视频分析租约保护已删除版本，结束后可整理；恢复目标冲突不覆盖', async () => {
  let release, entered;const started=new Promise(resolve=>entered=resolve);let calls=0;
  const app=await collectionFixture({fetchImpl:async url=>new Response(Buffer.from('fixture media'),{headers:{'content-type':String(url).includes('video')?'video/mp4':'image/png'}}),analyzer:async()=>{if(++calls>1){entered();await new Promise(resolve=>release=resolve);}return {duration:3,transcriptSegments:[]};}});
  let analysis;
  try {
    await app.importNote(syntheticNote(11,{type:'video',videoUrl:'https://video.xhscdn.com/fixture.mp4'}));const note=(await app.api('/notes')).notes[0];
    analysis=app.api('/notes/'+note.id+'/reanalyze',{}).catch(error=>error);await started;await app.api('/notes/'+note.id,undefined,'DELETE');
    const busy=await organize(app);assert.equal(busy.organizedCount,0);assert.match(busy.errors[0].error,/分析中/);assert.ok(await readFile(join(app.directory,'collection/versions',note.mediaVersion,'media',note.id,'video.mp4')));
    release();await analysis;const item=(await organize(app)).items[0];assert.equal(item.status,'organized');
    await mkdir(join(app.directory,'collection/versions',note.mediaVersion));await writeFile(join(app.directory,'collection/versions',note.mediaVersion,'keep'),'目标不覆盖');await assert.rejects(restore(app,item),{status:409});assert.equal(await readFile(join(app.directory,'collection/versions',note.mediaVersion,'keep'),'utf8'),'目标不覆盖');
  } finally {release?.();await analysis;await app.close();}
});

test('排他移动拒绝检查后出现的空目录，不覆盖正向或恢复目标', async () => {
  for (const stage of ['beforeMove','beforeRestoreMove']) {
    let app, armed=false, created, inode;
    app=await collectionFixture({recycleCheckpoint:async point=>{
      if(armed&&point===stage){armed=false;const entry=(await app.readCollection()).trash[0];created=stage==='beforeMove'?join(app.directory,'collection/recycle',entry.recycle.folder,'files'):join(app.directory,'collection/versions',entry.mediaVersion);await mkdir(created);inode=(await lstat(created)).ino;}
    }});
    try {
      const note=await deleted(app,12);
      if(stage==='beforeMove'){armed=true;const result=await organize(app);assert.equal(result.organizedCount,0);assert.match(result.errors[0].error,/已存在/);assert.ok(await readFile(join(app.directory,'collection/versions',note.mediaVersion,'media',note.id,'01.png')));}
      else {const item=(await organize(app)).items[0];armed=true;await assert.rejects(restore(app,item),{status:409});assert.ok(await readFile(join(item.path,'files/media',note.id,'01.png')));}
      assert.equal((await lstat(created)).ino,inode);assert.deepEqual(await readdir(created),[]);
    } finally {await app.close();}
  }
});

test('移动边界父目录换成外部链接时闭锁，正向和恢复均不移出原库', async () => {
  for(const stage of ['beforeMove','beforeRestoreMove']) {
    let app, armed=false;
    app=await collectionFixture({recycleCheckpoint:async point=>{if(armed&&point===stage){armed=false;const entry=(await app.readCollection()).trash[0];const parent=stage==='beforeMove'?join(app.directory,'collection/recycle',entry.recycle.folder):join(app.directory,'collection/versions');await rename(parent,parent+'-original');await symlink(join(app.directory,'outside'),parent);}}});
    try {
      const outside=join(app.directory,'outside');await mkdir(outside);await writeFile(join(outside,'keep'),'外部保持');const note=await deleted(app,15);
      if(stage==='beforeMove'){armed=true;const result=await organize(app);assert.equal(result.organizedCount,0);assert.ok(result.errors.length);assert.ok(await readFile(join(app.directory,'collection/versions',note.mediaVersion,'media',note.id,'01.png')));}
      else {const item=(await organize(app)).items[0];armed=true;await assert.rejects(restore(app,item),{status:409});assert.ok(await readFile(join(item.path,'files/media',note.id,'01.png')));}
      assert.deepEqual(await readdir(outside),['keep']);assert.equal(await readFile(join(outside,'keep'),'utf8'),'外部保持');
    } finally {await app.close();}
  }
});
