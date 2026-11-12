import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source=await readFile('browser-extension/collection/content.js','utf8');
const flush=()=>new Promise(resolve=>setImmediate(resolve));

// DOM / Chrome are boundary adapters; no server, browser profile or network is used.
async function contentFixture(platform) {
  class Element extends EventTarget {
    children=[];style={};dataset={};attributes={};disabled=false;isConnected=false;
    addEventListener(type,listener,options){super.addEventListener(type,listener,options);if(type==='click')this.clickListener=listener;}
    appendChild(child){child.parentElement=this;child.isConnected=true;this.children.push(child);return child;}
    remove(){this.parentElement.children=this.parentElement.children.filter(child=>child!==this);this.isConnected=false;}
    setAttribute(name,value){this.attributes[name]=value;}
    querySelectorAll(selector){return this.children.flatMap(child=>[...(selector==='button'&&child.tagName==='button'?[child]:[]),...child.querySelectorAll(selector)]);}
    querySelector(selector){return selector==='[role="status"]'?this.children.find(child=>child.attributes.role==='status')||null:null;}
    click(){this.dispatchEvent(new Event('click'));}
  }
  const id=platform==='douyin'?'douyin-7421234567890123456':'1'.repeat(24);
  const location=new URL(platform==='douyin'?'https://www.douyin.com/video/7421234567890123456':'https://www.xiaohongshu.com/explore/'+id);
  const window=new EventTarget(),document=new EventTarget(),root=new Element(),messages=[];
  const payload={id,ready:true,title:'合成收藏',content:'合成正文',imageUrls:[],type:'normal'};
  let tick,captureRequests=0,response={ok:true,status:'complete',created:true};
  Object.assign(document,{
    documentElement:root,
    createElement:tag=>Object.assign(new Element(),{tagName:tag}),
    getElementById:id=>{const find=node=>node.id===id?node:node.children.map(find).find(Boolean);return find(root);},
    querySelector:()=>null,querySelectorAll:()=>[],
  });
  const pageMessage=()=>window.dispatchEvent(Object.assign(new Event('message'),{source:window,origin:location.origin,data:{source:'kankan-note-page-data',payload}}));
  document.addEventListener('kankan-note-capture-request',()=>{captureRequests++;pageMessage();});
  vm.runInNewContext(source,{
    window,document,location,Element,URL,crypto,setTimeout,clearTimeout,
    CustomEvent:class extends Event {},setInterval:callback=>{tick=callback;},
    KANKAN_CARD_DRAG_HELPERS:{noteIdFromHref:()=>id},
    chrome:{runtime:{sendMessage(message,reply){messages.push(message);reply(response);}}},
  });
  tick();await flush();captureRequests=0;
  return {
    messages,pageMessage,
    button:mode=>document.getElementById('kankan-note-import-button'+(mode==='get'?'-get':'')),
    get captureRequests(){return captureRequests;},
    set response(value){response=value;},
  };
}

for(const platform of ['xiaohongshu','douyin']) {
  for(const mode of ['direct','get']) {
    for(const action of ['click','dispatchEvent']) {
      test(`${platform} ${mode}：网页 ${action} 不能发起收藏或 GET`,async()=>{
        const f=await contentFixture(platform),button=f.button(mode);
        if(action==='click')button.click();else button.dispatchEvent(new Event('click',{bubbles:true}));
        await flush();
        assert.equal(f.messages.length,0,JSON.stringify(f.messages));
        assert.equal(f.captureRequests,0,'拒绝必须发生在请求页面数据之前');
        assert.equal(button.disabled,false,'拒绝不能锁定按钮');
      });
    }
    test(`${platform} ${mode}：可信点击仍收藏，未知结果再次点击只查询原操作`,async()=>{
      const f=await contentFixture(platform),button=f.button(mode);
      f.response={ok:false,error:'合成连接中断'};
      // VM cannot manufacture a browser-trusted event; invoke the registered handler
      // with its trusted input here. Real pointer/keyboard input is covered in the browser suite.
      await button.clickListener({isTrusted:true});
      assert.equal(f.messages[0].type,'IMPORT_NOTE');
      assert.equal(f.messages[0].mode,mode);
      assert.equal(f.messages[0].note.title,'合成收藏');
      assert.equal(button.disabled,false);
      const operationId=f.messages[0].operationId;
      f.response={ok:true,status:'complete',created:true};
      await button.clickListener({isTrusted:true});
      assert.deepEqual(f.messages.map(message=>message.type),['IMPORT_NOTE','GET_IMPORT_STATUS']);
      assert.equal(f.messages[1].operationId,operationId);
      assert.equal(button.disabled,false);
    });
  }
  test(`${platform}：页面数据消息本身不能发起收藏，缺少可信标记的点击也不能`,async()=>{
    const f=await contentFixture(platform);
    f.pageMessage();await flush();assert.equal(f.messages.length,0);
    await f.button('get').clickListener({});await flush();assert.equal(f.messages.length,0);
  });
}
