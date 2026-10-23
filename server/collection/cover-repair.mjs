import fs, {constants} from 'node:fs/promises';
import {join,basename,extname} from 'node:path';
import {failure} from '../repository.mjs';
import {isAllowedRemoteImageUrl,localizeNoteMedia} from './lib/media-import.mjs';

// Narrow recovery: one failed video cover only. Video/analysis and grouping stay intact.
export function createCoverRepair({root,read,write,guard,serialized,busyVersions,publicNote,fetchImpl,ocrRunner}) {
  function eligible(note,version) {
    if (!note || note.mediaVersion!==version) throw failure('收藏已变化，请刷新后重试封面',409);
    if (note.type!=='video' || note.videoStatus!=='ready' || !note.videoUrl || note.coverUrl || note.imageUrls?.length || note.sourceImageUrls?.length!==1) throw failure('仅支持补回已有视频缺失的单张封面',409);
    return note;
  }
  return async function repairCover(id,body) {
    if (!/^[a-f0-9]{32}$/.test(body?.expectedMediaVersion||'') || !isAllowedRemoteImageUrl(body?.imageUrl)) throw failure('封面地址或版本无效',400);
    const note=await serialized(async()=>{
      const current=eligible((await read()).notes.find(n=>n.id===id),body.expectedMediaVersion);
      if (busyVersions.has(current.mediaVersion)) throw failure('收藏媒体正在处理，请稍后重试',409);
      busyVersions.add(current.mediaVersion);return current;
    });
    let stage,createdPath,createdUrl;
    try {
      await guard();stage=await fs.mkdtemp(join(root,'.cover-'));
      const result=await localizeNoteMedia({...note,imageUrls:[body.imageUrl]}, {mediaDirectory:stage,publicBaseUrl:'/staged',fetchImpl,...(ocrRunner?{ocrRunner}:{})});
      if (result.mediaStatus!=='ready' || result.imageUrls.length!==1) throw failure(result.mediaError||'封面处理失败，原收藏未修改',502);
      return await serialized(async()=>{
        const state=await read(),current=eligible(state.notes.find(n=>n.id===id),note.mediaVersion);
        await guard();
        const parents=[join(root,'versions'),join(root,'versions',note.mediaVersion),join(root,'versions',note.mediaVersion,'media'),join(root,'versions',note.mediaVersion,'media',id)];
        for (const directory of parents) {const info=await fs.lstat(directory);if(!info.isDirectory()||info.isSymbolicLink())throw failure('媒体目录身份异常',409);}
        const staged=join(stage,id,basename(result.coverUrl)),extension=extname(staged);
        for (let index=1;index<=99;index++) {
          const name=String(index).padStart(2,'0')+extension,destination=join(parents.at(-1),name);
          try {await fs.copyFile(staged,destination,constants.COPYFILE_EXCL);createdPath=destination;createdUrl=`/collection-media/${note.mediaVersion}/media/${id}/${name}`;break;}
          catch(error) {if(error.code!=='EEXIST')throw error;}
        }
        if (!createdPath) throw failure('封面文件位置已占满',409);
        const imageHandle=await fs.open(createdPath,constants.O_RDONLY|constants.O_NOFOLLOW);
        try {await imageHandle.sync();} finally {await imageHandle.close();}
        const directoryHandle=await fs.open(parents.at(-1),'r');
        try {await directoryHandle.sync();} finally {await directoryHandle.close();}
        const stored=publicNote({...current,coverUrl:createdUrl,imageUrls:[createdUrl],sourceImageUrls:[body.imageUrl],imageOcr:result.imageOcr.map(item=>({...item,imageUrl:createdUrl})),ocrText:result.ocrText,mediaStatus:'ready',mediaError:''});
        const saved=await write({...state,notes:state.notes.map(n=>n.id===id?stored:n)});
        return {note:saved.notes.find(n=>n.id===id),revision:saved.revision};
      });
    } catch(error) {
      // A rename may have committed before fsync/readback failed. Never delete a
      // potentially referenced image until a fresh read proves it unreferenced.
      if (createdPath) {
        let recovery;
        try {recovery=await serialized(async()=>{const state=await read();return {state,note:state.notes.find(n=>n.id===id),referenced:[...state.notes,...(state.trash||[])].some(n=>n.coverUrl===createdUrl||n.imageUrls?.includes(createdUrl))};});}
        catch {throw failure('封面写入结果待核对，请刷新收藏；图片已保留',409);}
        if (recovery.note?.coverUrl===createdUrl) return {note:recovery.note,revision:recovery.state.revision};
        if (!recovery.referenced) await fs.rm(createdPath,{force:true});
      }
      throw error;
    } finally {
      try {if (stage) await fs.rm(stage,{recursive:true,force:true});}
      finally {busyVersions.delete(note.mediaVersion);}
    }
  };
}
