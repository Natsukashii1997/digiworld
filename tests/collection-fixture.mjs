import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fixture} from './fixture.mjs';
import {seed} from '../src/store.js';
const picture=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/5m8AAAAASUVORK5CYII=','base64');
export const syntheticNote=(index,extra={})=>({id:String(index).padStart(24,'0'),sourceUrl:`https://www.xiaohongshu.com/explore/${String(index).padStart(24,'0')}`,title:`合成收藏 ${index}`,content:'正文内容，设计灵感与工作方法。',imageUrls:['https://image.xhscdn.com/fixture.png?signature=private-fixture'],author:{name:'合成作者'},tags:['设计'],type:'normal',...extra});
export async function collectionFixture(options={}) {
  const app=await fixture({discovery:{collection:{runOpen:async()=>{throw new Error('合成测试禁止打开真实访达');},fetchImpl:async url=>{if(!String(url).includes('.xhscdn.com/'))throw new Error('合成测试禁止网络');return new Response(picture,{headers:{'content-type':'image/png'}});},ocrRunner:async paths=>paths.map(path=>({path,text:'图片识别：独有关键词像素收藏'})),analyzer:async()=>({duration:3,transcriptSegments:[{start:0,duration:2,text:'视频文稿合成内容'}]}),...options}}});
  await app.repository.write(seed(),{initialize:true});
  const session=await fetch(app.url+'/api/session',{headers:{'X-Workbench-Client':'1'}}).then(r=>r.json());
  const api=async(path,data,method=data===undefined?'GET':'POST',headers={})=>{const response=await fetch(app.url+'/api/collection'+path,{method,headers:{'X-Workbench-Token':session.token,...(data===undefined?{}:{'Content-Type':'application/json'}),...headers},...(data===undefined?{}:{body:JSON.stringify(data)})});const result=await response.json();if(!response.ok)throw Object.assign(new Error(result.error),{status:response.status});return result;};
  // 图片文字识别在收藏完成后由后台补（#107）；默认等后台补完再返回，需要观察 pending 时传 {waitOcr:false}。
  const importNote=async(note,operationId=crypto.randomUUID(),{waitOcr=true}={})=>{await api('/notes/import',{note,operationId});for(let i=0;i<200;i++){const result=await api('/operations/'+operationId);if(result.status!=='processing'){if(waitOcr && result.mediaStatus==='pending')for(let j=0;j<200;j++){const stored=(await api('/notes')).notes.find(n=>n.id===result.noteId);if(stored?.mediaStatus!=='pending')break;await new Promise(resolve=>setTimeout(resolve,10));}return result;}await new Promise(resolve=>setTimeout(resolve,10));}throw new Error('合成导入超时');};
  return {...app,api,importNote,readCollection:async()=>JSON.parse(await readFile(join(app.directory,'collection/state.json'),'utf8')).state};
}
