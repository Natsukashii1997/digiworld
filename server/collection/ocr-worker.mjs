import {join} from 'node:path';
import {recognizeImages,finishNoteOcr} from './lib/media-import.mjs';

// 后台补图片文字（#107）：收藏先以 mediaStatus 'pending' 写入，这里逐条识别后写回。
// 只写回同一 id、同一媒体版本、仍在 pending 的卡片：期间删除或重新收藏的旧结果直接丢弃，不复活。
// 服务重启后 start() 会接着处理上次没识别完的卡片。
const RETRY_MS = 60_000;

export function createOcrWorker({root,read,write,serialized,guard,publicNote,ocrRunner}) {
  let running=null,again=false,enabled=false,timer;
  function localImages(note) {
    const prefix=`/collection-media/${note.mediaVersion}/media/${note.id}/`;
    return (note.imageOcr||[]).map(({imageUrl})=>{
      const url=String(imageUrl||''),file=url.slice(prefix.length);
      return {imageUrl:url,filePath:url.startsWith(prefix) && /^\d{2}\.[a-z]{3,4}$/.test(file) ? join(root,'versions',note.mediaVersion,'media',note.id,file) : ''};
    });
  }
  async function recognize(note) {
    await guard();
    const imageOcr=await recognizeImages(localImages(note),ocrRunner);
    await serialized(async()=>{
      const state=await read(),current=state.notes.find(n=>n.id===note.id && n.mediaVersion===note.mediaVersion && n.mediaStatus==='pending');
      if (!current) return;
      const finished=publicNote({...current,...finishNoteOcr(current,imageOcr)});
      await write({...state,notes:state.notes.map(n=>n===current?finished:n)});
    });
  }
  async function run() {
    let failed=false;
    do {
      again=false;
      const pending=(await serialized(read)).notes.filter(n=>n.mediaStatus==='pending' && /^[a-f0-9]{32}$/.test(n.mediaVersion||''));
      for (const note of pending) {
        if (!enabled) return;
        try { await recognize(note); } catch { failed=true; }
      }
    } while (again && enabled);
    return failed;
  }
  // 读写失败（如数据目录身份变化）的卡片留在 pending，过一会儿再试，不丢也不空转。
  function retryLater() {
    if (!enabled) return;
    clearTimeout(timer); timer=setTimeout(wake,RETRY_MS); timer.unref?.();
  }
  function wake() {
    if (!enabled) return;
    if (running) { again=true; return; }
    running=run().then(failed=>{if(failed)retryLater();},retryLater).finally(()=>{running=null;});
  }
  return {
    wake,
    start() { enabled=true; wake(); },
    async close() { enabled=false; clearTimeout(timer); await running; },
  };
}
