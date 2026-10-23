import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
// Reproduce a real collection modal whose structured data lacks play_addr.
// All requests are intercepted; this suite never touches the real collection.
const source=await readFile('browser-extension/collection/douyin-data.js','utf8');
const id='7664016553972731199',next='7664016553972731200',safe='https://v26-webf.douyinvod.com/current.mp4';
const browser=await chromium.launch();
const results=[];
try{
 const page=await browser.newPage();
 await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
 const current=(url=safe,extra='')=>`<div class="video_${id}" data-e2e="feed-active-video" style="width:400px;height:300px"><video src="${url}"></video>${extra}</div>`;
 const cases=[
 {name:'matched visible current player supplies missing URL',html:current()+`<div class="video_${next}" data-e2e="feed-active-video"><video src="https://v26-webf.douyinvod.com/neighbor.mp4"></video></div>`,expected:safe},
 {name:'web camelCase playAddr src array works with blob DOM',html:current('blob:https://www.douyin.com/unavailable'),videoOverride:{playAddr:[{src:safe}]},expected:safe},
 {name:'empty snake field does not mask valid camel field',html:'',videoOverride:{play_addr:{},playAddr:[{src:safe}]},expected:safe},
 {name:'empty snake list does not mask valid camel list',html:'',videoOverride:{playAddr:{url_list:[],urlList:[safe]}},expected:safe},
 {name:'web authorInfo is retained',html:'',authorInfo:true,structured:safe,expected:safe},
 {name:'null video with summary is safe',html:'',nullVideo:true,expected:''},
 {name:'web bitRateList src arrays are supported',html:'',videoOverride:{bitRateList:[{playAddr:[{src:safe}]}]},expected:safe},
 {name:'snake bit_rate remains supported',html:'',videoOverride:{bit_rate:[{play_addr:{url_list:[safe]}}]},expected:safe},
 {name:'unsafe web src array never leaks',html:'',videoOverride:{playAddr:[{src:'https://v26-webf.douyinvod.com.attacker.test/x.mp4'}]},expected:''},
 {name:'richer same-ID state wins over summary',html:'',partialFirst:true,structured:safe,expected:safe},
 {name:'React current work can enrich partial router work',html:'<div id="react-work" data-e2e="aweme-detail"></div>',reactVideo:true,expected:safe},
 {name:'React neighbor cannot enrich partial current work',html:'<div id="react-work" data-e2e="aweme-detail"></div>',reactVideo:true,reactWrong:true,expected:''},
 {name:'currentSrc takes precedence over a different src attribute',html:current('https://v26-webf.douyinvod.com/stale-attribute.mp4'),setup:'currentSrc',expected:safe},
 {name:'source node supplies HTTPS when currentSrc is blob',html:current('blob:https://www.douyin.com/unavailable'),setup:'source',expected:safe},
 {name:'wrong work container refused',html:`<div class="video_${next}" data-e2e="feed-active-video"><video src="${safe}"></video></div>`,expected:''},
 {name:'substring class match refused',html:`<div class="video_${id}0" data-e2e="feed-active-video"><video src="${safe}"></video></div>`,expected:''},
 {name:'two matching visible containers refused',html:current()+current(),expected:''},
 {name:'two owned videos refused',html:current(safe,`<video src="${safe}"></video>`),expected:''},
 {name:'hidden player refused',html:`<div style="display:none">${current()}</div>`,expected:''},
 {name:'nested different player never borrowed',html:`<div class="video_${id}" data-e2e="feed-active-video" style="width:400px;height:300px"><div class="video_${next}" data-e2e="feed-active-video"><video src="${safe}"></video></div></div>`,expected:''},
 {name:'untrusted media refused',html:current('https://v26-webf.douyinvod.com.attacker.test/a.mp4'),expected:''},
 {name:'credentialed media refused',html:current('https://user:pass@v26-webf.douyinvod.com/a.mp4'),expected:''},
 {name:'nonstandard media port refused',html:current('https://v26-webf.douyinvod.com:8443/a.mp4'),expected:''},
 {name:'hidden stale match does not obscure visible player',html:`<div style="display:none">${current('https://v26-webf.douyinvod.com/stale.mp4')}</div>`+current(),expected:safe},
 {name:'blob without source refused',html:current('blob:https://www.douyin.com/unavailable'),expected:''},
 {name:'album stays image-only',html:current(),album:true,expected:''},
 {name:'structured safe media remains authoritative',html:current(),structured:'https://v26-web.douyinvod.com/from-state.mp4',expected:'https://v26-web.douyinvod.com/from-state.mp4'},
 {name:'no matching structured work refuses DOM-only guess',html:current(),wrongWork:true,expected:undefined},
 ];
 for(const t of cases){
  await page.goto(`https://www.douyin.com/user/self?modal_id=${id}&showTab=favorite_collection`);
  await page.setContent('<!doctype html><html><body>'+t.html+'</body></html>');
  await page.evaluate(({id,next,t,safe})=>{window.__ROUTER_DATA__={work:{aweme_id:t.wrongWork?next:id,desc:'同一作品的真实页面结构合成复现',video:t.structured?{play_addr:{url_list:[t.structured]}}:{cover:{url_list:['https://p3.douyinpic.com/cover.jpg']}},...(t.album?{images:[{url_list:['https://p3.douyinpic.com/album.jpg']}]}:{})}};if(t.authorInfo)window.__ROUTER_DATA__.work.authorInfo={nickname:'合成网页作者',secUid:'synthetic-author'};if(t.nullVideo)window.__ROUTER_DATA__.work.video=null;if(t.videoOverride)window.__ROUTER_DATA__.work.video=t.videoOverride;if(t.partialFirst)window.__ROUTER_DATA__={summary:{aweme_id:id,desc:'same-ID summary without media'},detail:window.__ROUTER_DATA__.work};if(t.reactVideo)document.querySelector('#react-work').__reactProps$fixture={aweme:{awemeId:t.reactWrong?next:id,desc:'current React work',video:{playAddr:[{src:safe}]}}};window.captured=[];window.addEventListener('message',e=>{if(e.data?.source==='kankan-note-page-data')window.captured.push(e.data.payload)});if(t.setup==='currentSrc')Object.defineProperty(document.querySelector('video'),'currentSrc',{value:safe});if(t.setup==='source'){Object.defineProperty(document.querySelector('video'),'currentSrc',{value:'blob:https://www.douyin.com/unavailable'});const source=document.createElement('source');source.src=safe;document.querySelector('video').appendChild(source)}}, {id,next,t,safe});
  await page.addScriptTag({content:source});await page.waitForFunction(()=>window.captured.length>0);
  const data=await page.evaluate(()=>window.captured.at(-1));
  try{assert.equal(data.videoUrl,t.expected,t.name);if(t.authorInfo)assert.equal(data.author.name,'合成网页作者');results.push({name:t.name,pass:true});}catch(e){results.push({name:t.name,pass:false,actual:data.videoUrl,expected:t.expected});}
 }
 console.log(JSON.stringify(results,null,2));assert.ok(results.every(r=>r.pass),'All exact current-player scenarios must pass');
}finally{await browser.close();}
