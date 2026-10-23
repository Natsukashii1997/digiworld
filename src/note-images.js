import {request} from './api.js';
import {NOTE_IMAGE_ID,NOTE_IMAGE_MAX} from './note-image-model.js';
const cache=new Map();let cachedBytes=0;
function remember(value){if(cache.has(value.id))return;cache.set(value.id,value);cachedBytes+=value.size;while(cachedBytes>32*1024*1024){const [id,old]=cache.entries().next().value;cache.delete(id);cachedBytes-=old.size;}}
const MAX_BYTES=8*1024*1024,types=new Set(['image/png','image/jpeg','image/webp']);
async function decode(blob){
 const url=URL.createObjectURL(blob),image=new Image();
 try{image.src=url;await image.decode();if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>40000000)throw Error('图片尺寸过大，请缩小后再粘贴');return {width:image.naturalWidth,height:image.naturalHeight};}
 catch(e){if(e.message.includes('尺寸'))throw e;throw Error('图片无法读取，请重新复制PNG、JPG或WebP图片');}finally{URL.revokeObjectURL(url);}
}
export async function uploadNoteImages(files,signal){
 if(!files.length||files.length>NOTE_IMAGE_MAX)throw Error('每张便签最多20张图片');
 for(const f of files){if(!types.has(f.type))throw Error('请粘贴PNG、JPG或WebP图片');if(!f.size||f.size>MAX_BYTES)throw Error('单张图片不能超过8 MB');await decode(f);}
 const ids=[];
 for(const file of files){if(signal?.aborted)throw Error('图片插入已取消');const data=new Uint8Array(await file.arrayBuffer()),result=await request('/note-images',{data},'POST',true,{signal});if(!NOTE_IMAGE_ID.test(result.id||''))throw Error('图片保存结果无效');remember({...result,data,blob:new Blob([data],{type:result.type})});ids.push(result.id);}
 return ids;
}
export async function readNoteImage(id,signal){
 if(!NOTE_IMAGE_ID.test(id||''))throw Error('图片引用无效');if(signal?.aborted)throw Error('图片读取已取消');if(cache.has(id))return cache.get(id);
 const value=await request('/note-images/'+id+'/read',{},'POST',true,{signal});
 if(value.id!==id||!types.has(value.type)||!(value.data instanceof Uint8Array)||!value.data.length||value.data.length>MAX_BYTES)throw Error('图片读取结果无效');
 const result={...value,blob:new Blob([value.data],{type:value.type})};remember(result);return result;
}
export async function clipboardImages(doc){
 const ids=[...new Set(doc.lines.flatMap(l=>l.runs.filter(r=>r.imageId).map(r=>r.imageId)))],result={};
 let total=0;
 for(const id of ids){const value=await readNoteImage(id);let blob=value.blob,kind=id.split('.').at(-1),dimensions=await decode(blob);
  if(kind==='webp'){const url=URL.createObjectURL(blob),image=new Image();try{image.src=url;await image.decode();const canvas=document.createElement('canvas');canvas.width=dimensions.width;canvas.height=dimensions.height;canvas.getContext('2d').drawImage(image,0,0);blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('图片复制准备失败')),'image/png'));kind='png';}finally{URL.revokeObjectURL(url);}}
  const bytes=new Uint8Array(await blob.arrayBuffer());total+=bytes.length;if(total>7400000)throw Error('图片总量较大，无法一次复制，请分张复制图片');let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));result[id]={...dimensions,kind,dataURL:`data:${blob.type};base64,${btoa(binary)}`,hex:[...bytes].map(n=>n.toString(16).padStart(2,'0')).join('')};
 }
 return result;
}
