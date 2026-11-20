import {join} from 'node:path';
import {recognizeImages,finishNoteOcr} from './lib/media-import.mjs';
import {reanalyzeStoredNoteVideo} from './lib/video-import.mjs';

// 后台补媒体（#107 图片文字、#109 视频文稿）：收藏先以 pending 写入卡片，这里逐条补完再写回。
// 只写回同一 id、同一媒体版本、仍在 pending 的卡片：期间删除或重新收藏的旧结果直接丢弃，不复活。
// 图片和视频各一条队列，长视频转写不挡图片识别；服务重启后 start() 接着处理没补完的卡片。
const RETRY_MS = 60_000;
const VIDEO_FIELDS = ['videoDuration','transcriptText','transcriptSegments','transcriptEngine','videoStatus','videoError'];

function createPendingQueue({read,serialized,select,handle}) {
  let running=null,again=false,enabled=false,timer;
  async function run() {
    let failed=false;
    do {
      again=false;
      for (const note of (await serialized(read)).notes.filter(select)) {
        if (!enabled) return failed;
        try { await handle(note); } catch { failed=true; }
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

export function createMediaWorker({root,read,write,serialized,guard,publicNote,busyVersions=new Set(),ocrRunner,analyzer,fetchImpl}) {
  const stored=note=>/^[a-f0-9]{32}$/.test(note.mediaVersion||'');
  const mediaDirectory=note=>join(root,'versions',note.mediaVersion,'media');
  async function writeBack(note,field,patch) {
    await serialized(async()=>{
      const state=await read(),current=state.notes.find(n=>n.id===note.id && n.mediaVersion===note.mediaVersion && n[field]==='pending');
      if (!current) return;
      const finished=publicNote({...current,...patch(current)});
      await write({...state,notes:state.notes.map(n=>n===current?finished:n)});
    });
  }
  function localImages(note) {
    const prefix=`/collection-media/${note.mediaVersion}/media/${note.id}/`;
    return (note.imageOcr||[]).map(({imageUrl})=>{
      const url=String(imageUrl||''),file=url.slice(prefix.length);
      return {imageUrl:url,filePath:url.startsWith(prefix) && /^\d{2}\.[a-z]{3,4}$/.test(file) ? join(mediaDirectory(note),note.id,file) : ''};
    });
  }
  const images=createPendingQueue({read,serialized,select:n=>n.mediaStatus==='pending' && stored(n),async handle(note) {
    await guard();
    const imageOcr=await recognizeImages(localImages(note),ocrRunner);
    await writeBack(note,'mediaStatus',current=>finishNoteOcr(current,imageOcr));
  }});
  const videos=createPendingQueue({read,serialized,select:n=>n.videoStatus==='pending' && stored(n),async handle(note) {
    // 占用媒体版本：转写期间「重新分析」返回正在分析，回收整理不清这份媒体。已被占用就跳过，由占用方写结果。
    if (busyVersions.has(note.mediaVersion)) return;
    busyVersions.add(note.mediaVersion);
    try {
      await guard();
      let result;
      try {
        result=await reanalyzeStoredNoteVideo(note,{mediaDirectory:mediaDirectory(note),publicBaseUrl:`/collection-media/${note.mediaVersion}`,modelDirectory:join(root,'models'),deadline:Date.now()+30*60*1000,fetchImpl,...(analyzer?{analyzer}:{})});
      } catch (error) {
        result={videoDuration:0,transcriptText:'',transcriptSegments:[],videoStatus:'partial',videoError:error instanceof Error?error.message:'本地视频分析失败'};
      }
      await writeBack(note,'videoStatus',()=>Object.fromEntries(VIDEO_FIELDS.filter(key=>result[key]!==undefined).map(key=>[key,result[key]])));
    } finally { busyVersions.delete(note.mediaVersion); }
  }});
  return {
    wake() { images.wake(); videos.wake(); },
    start() { images.start(); videos.start(); },
    close: ()=>Promise.all([images.close(),videos.close()]),
  };
}
