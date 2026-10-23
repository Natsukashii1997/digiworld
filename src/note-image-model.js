import {noteMeta} from './note-types.js';
// Attachments are local content-addressed IDs; image bytes never enter note text or recovery records.
export const NOTE_IMAGE_ID=/^[a-f0-9]{64}\.(?:png|jpg|webp)$/;
export const NOTE_IMAGE_MAX=20;
export const IMAGE_CHAR='\uFFFC';
const markerPattern=()=>/!\[图片\]\(note-image:([a-f0-9]{64}\.(?:png|jpg|webp))\)/g;
export function validNoteImages(images){return images===undefined||Array.isArray(images)&&images.length>0&&images.length<=NOTE_IMAGE_MAX&&new Set(images).size===images.length&&images.every(id=>typeof id==='string'&&NOTE_IMAGE_ID.test(id));}
export function imageMarker(id){if(!NOTE_IMAGE_ID.test(id))throw Error('图片引用无效');return `![图片](note-image:${id})`;}
export function splitImageRuns(runs,images=[]){const allowed=new Set(images);if(!allowed.size)return runs;return runs.flatMap(run=>{const result=[];let at=0;for(const m of run.text.matchAll(markerPattern())){if(!allowed.has(m[1]))continue;if(m.index>at)result.push({...run,text:run.text.slice(at,m.index),raw:undefined});result.push({text:IMAGE_CHAR,ink:null,imageId:m[1]});at=m.index+m[0].length;}if(!at)return[run];if(at<run.text.length)result.push({...run,text:run.text.slice(at),raw:undefined});return result;});}
export function imageIds(doc){return [...new Set(doc.lines.flatMap(l=>l.runs.filter(r=>r.imageId).map(r=>r.imageId)))].sort();}
export function noteContent(note){return note?{text:note.text,...(note.format?{format:note.format}:{}),...(note.images?.length?{images:[...note.images].sort()}:{} ),...noteMeta(note),...(note.rich?{rich:structuredClone(note.rich)}:{})}:null;}
export function imagePlainText(text,images){const allowed=new Set(images||[]);return text.replace(markerPattern(),(raw,id)=>allowed.has(id)?'[图片]':raw);}
