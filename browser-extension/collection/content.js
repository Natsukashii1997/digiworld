const BUTTON_ID = 'kankan-note-import-button';
const BUTTON_GROUP_ID = 'kankan-note-import-actions';
const PAYLOAD_PREFIX = 'KANKAN_NOTE:';
const CARD_PAYLOAD_PREFIX = 'KANKAN_CARD:';
const PAGE_DATA_SOURCE = 'kankan-note-page-data';
const PAGE_DATA_REQUEST_EVENT = 'kankan-note-capture-request';
let cachedPageData = null;
let requestedNoteId = '';
let navigationGeneration = 0;
const pendingOperations=new Map();
function syncNoteContext() {
  const id=getNoteId().toLowerCase();
  if(id!==requestedNoteId){navigationGeneration++;requestedNoteId=id;cachedPageData=null;document.getElementById(BUTTON_GROUP_ID)?.remove();document.dispatchEvent(new CustomEvent(PAGE_DATA_REQUEST_EVENT));}
  return id;
}

function getNoteId() {
  if(location.hostname==='www.douyin.com'){const url=new URL(location.href),id=url.searchParams.get('modal_id')||url.pathname.match(/^\/(?:video|note)\/(\d{15,25})\/?$/)?.[1];return /^\d{15,25}$/.test(id||'')?'douyin-'+id:'';}
  return globalThis.KANKAN_CARD_DRAG_HELPERS?.noteIdFromHref(location.href) || '';
}

function noteCardFromDragTarget(target) {
  if (!(target instanceof Element) || target.closest(`#${BUTTON_ID}`)) return null;
  const elements = globalThis.KANKAN_CARD_DRAG_HELPERS?.findNoteCardElements(target, location.href);
  const link = elements?.link;
  if (!link) return null;

  try {
    const sourceUrl = new URL(link.getAttribute('href'), location.href);
    if (!['www.xiaohongshu.com', 'm.xiaohongshu.com'].includes(sourceUrl.hostname)) return null;
    const id = globalThis.KANKAN_CARD_DRAG_HELPERS?.noteIdFromHref(sourceUrl.toString());
    if (!id) return null;

    const card = elements.card || link.parentElement?.parentElement?.parentElement;
    const title = card?.querySelector('[class*="title"]')?.textContent?.trim()
      || (link.textContent || '').trim()
      || '这条笔记';

    return { id, sourceUrl: sourceUrl.toString(), title };
  } catch {
    return null;
  }
}

function firstText(selectors) {
  for (const selector of selectors) {
    const value = document.querySelector(selector)?.textContent?.trim();
    if (value) return value;
  }
  return '';
}

function metaContent(property) {
  return document.querySelector(`meta[property="${property}"]`)?.content?.trim()
    || document.querySelector(`meta[name="${property}"]`)?.content?.trim()
    || '';
}

function bestSrcsetUrl(value) {
  if (typeof value !== 'string') return '';
  const candidates = value.split(',').map((candidate) => {
    const [url, descriptor = '0w'] = candidate.trim().split(/\s+/);
    return { url, size: Number.parseFloat(descriptor) || 0 };
  });
  return candidates.sort((a, b) => b.size - a.size)[0]?.url || '';
}

function imageUrlFromElement(image) {
  return bestSrcsetUrl(image.getAttribute('srcset'))
    || bestSrcsetUrl(image.parentElement?.querySelector('source')?.getAttribute('srcset'))
    || image.currentSrc
    || image.getAttribute('data-src')
    || image.src
    || '';
}

function isNoteImageUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && (url.hostname.endsWith('.xhscdn.com') || url.hostname.endsWith('.xhsimg.com'));
  } catch {
    return false;
  }
}

function normalizeNoteImageUrl(value) {
  if (typeof value !== 'string') return '';
  const normalized = value.replace(/^http:/i, 'https:');
  return isNoteImageUrl(normalized) ? normalized : '';
}

function collectImages(root) {
  const urls = new Set(
    Array.isArray(cachedPageData?.imageUrls)
      ? cachedPageData.imageUrls.map(normalizeNoteImageUrl).filter(Boolean)
      : [],
  );
  root?.querySelectorAll('.note-content img, .swiper-slide img, [class*="note-content"] img, [class*="carousel"] img').forEach((image) => {
    const url = normalizeNoteImageUrl(imageUrlFromElement(image));
    if (url) urls.add(url);
  });

  return Array.from(urls).slice(0, 20);
}

function collectVideoUrl(root) {
  const candidates = [];
  const addCandidate = (value, context, baseScore = 0) => {
    const url = normalizeNoteVideoUrl(value);
    if (!url) return;
    const parsed = new URL(url);
    const score = baseScore
      + (/video/i.test(parsed.hostname) ? 6 : 0)
      + (/video|media|stream|h264|h265|avc|hevc|master|originVideo/i.test(context) ? 5 : 0)
      + (/video|stream/i.test(parsed.pathname) ? 2 : 0)
      - (/webpic|image|avatar|cover/i.test(`${parsed.hostname} ${context}`) ? 8 : 0);
    if (score >= 5) candidates.push({ url, score });
  };

  addCandidate(cachedPageData?.videoUrl, 'cached video state', 20);
  root?.querySelectorAll('video, video source').forEach((node) => {
    addCandidate(node.currentSrc, 'video currentSrc', 15);
    for (const attribute of ['src', 'data-src', 'data-url', 'data-video-src']) {
      addCandidate(node.getAttribute(attribute), `video ${attribute}`, 12);
    }
  });

  return candidates.sort((a, b) => b.score - a.score)[0]?.url || '';
}

function normalizeNoteVideoUrl(value) {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value.replace(/^http:/i, 'https:'));
    return url.protocol === 'https:'
      && (url.hostname.endsWith('.xhscdn.com') || url.hostname.endsWith('.xhsimg.com'))
      && !/\.(?:avif|gif|heic|heif|jpe?g|png|webp)(?:$|\?)/i.test(url.pathname)
      ? url.toString()
      : '';
  } catch {
    return '';
  }
}

function collectTags(root) {
  const tags = new Set(cachedPageData?.tags||[]);
  root?.querySelectorAll('#detail-desc a, .desc a, [class*="desc"] a').forEach((node) => {
    const value = node.textContent?.trim().replace(/^#/, '');
    if (value && value.length <= 40) tags.add(value);
  });
  return Array.from(tags).slice(0, 20);
}

function currentDetailRoot(id) {
  const direct=document.querySelector(`[data-note-id="${id}"], [data-noteid="${id}"]`);
  if(direct)return direct;
  for(const root of document.querySelectorAll('#noteContainer, .note-detail, [class*="note-detail"]')) {
    if([...root.querySelectorAll('a[href]')].some(link=>globalThis.KANKAN_CARD_DRAG_HELPERS?.noteIdFromHref(link.href)===id))return root;
  }
  return null;
}

function captureCurrentNote() {
  const id = syncNoteContext();
  if (!id) throw new Error('请先打开一条小红书笔记或抖音作品详情');
  if(cachedPageData?.id!==id || !cachedPageData.ready)throw new Error(cachedPageData?.id===id && cachedPageData.error || '当前笔记尚在加载，请稍后再试');
  const generation=navigationGeneration,root=currentDetailRoot(id);

  const title = cachedPageData.title || '未命名收藏';
  const content = cachedPageData.content || '';
  const douyin=id.startsWith('douyin-');
  const imageUrls = douyin ? (cachedPageData.imageUrls || []) : collectImages(root);
  const videoUrl = douyin ? (cachedPageData.videoUrl || '') : collectVideoUrl(root);
  const type = cachedPageData.type === 'video' ? 'video' : 'normal';
  if (type === 'video' && !videoUrl) {
    throw new Error('没有读取到视频，请先播放几秒再试');
  }
  if(generation!==navigationGeneration||getNoteId().toLowerCase()!==id)throw new Error('笔记已切换，请重新收藏当前帖');

  return {
    id,
    sourceUrl: id.startsWith('douyin-') ? `https://www.douyin.com/${type==='video'?'video':'note'}/${id.slice(7)}` : location.href,
    title,
    content,
    imageUrls,
    coverUrl: imageUrls[0] || '',
    videoUrl,
    author: cachedPageData.author || {name:'未知作者'},
    tags: id.startsWith('douyin-') ? (cachedPageData.tags || []) : collectTags(root),
    type,
  };
}

function setButtonState(button, label, tone) {
  button.textContent = label.startsWith('正在') ? '收藏中' : label.startsWith('已收藏') ? '已收藏' : label.startsWith('已保存') ? '已保存' : label === '已更新' ? '已更新' : '请查看';
  button.style.color = tone;
  button.title = label;
  button.setAttribute('aria-label', `${button.dataset.actionLabel}：${label}`);
  const status = button.parentElement?.querySelector('[role="status"]');
  if (status) { status.textContent = label; status.hidden = false; }
}

function installButton() {
  const existing = document.getElementById(BUTTON_GROUP_ID);
  if (!getNoteId()) {
    existing?.remove();
    return;
  }
  if (existing) return;

  const group=document.createElement('div');group.id=BUTTON_GROUP_ID;
  Object.assign(group.style,{position:'fixed',right:'24px',bottom:'24px',zIndex:'2147483647',display:'flex',flexDirection:'row',gap:'2px',padding:'3px',maxWidth:'calc(100vw - 48px)',boxSizing:'border-box',borderRadius:'14px',background:'rgba(17,23,30,0.92)',border:'1px solid rgba(255,255,255,0.12)',boxShadow:'0 8px 24px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.06)',backdropFilter:'blur(10px)'});
  // 悬停、按下、焦点和图标需要伪类，内联样式做不到；图标用 ::before，不进入按钮文字。
  const sheet=document.createElement('style');
  sheet.textContent=`#${BUTTON_GROUP_ID} button{transition:filter .15s ease,transform .15s ease,border-color .15s ease}
#${BUTTON_GROUP_ID} button::before{content:'★';margin-right:4px;font-size:11px}
#${BUTTON_GROUP_ID} #${BUTTON_ID}-get::before{content:'✦'}
#${BUTTON_GROUP_ID} button:hover:not(:disabled){filter:brightness(1.3);border-color:currentColor}
#${BUTTON_GROUP_ID} button:active:not(:disabled){transform:translateY(1px)}
#${BUTTON_GROUP_ID} button:focus-visible{outline:2px solid #65dce2;outline-offset:2px}
#${BUTTON_GROUP_ID} button:disabled{cursor:progress;opacity:.75}`;
  group.appendChild(sheet);
  const status = document.createElement('span');
  status.setAttribute('role', 'status'); status.hidden = true;
  Object.assign(status.style,{position:'absolute',right:'0',bottom:'calc(100% + 8px)',width:'max-content',maxWidth:'min(280px, calc(100vw - 48px))',boxSizing:'border-box',padding:'8px 12px',borderRadius:'6px',background:'#18212b',color:'#f4f7fb',font:'400 12px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',overflowWrap:'anywhere',boxShadow:'0 4px 14px rgba(0,0,0,0.2)'});
  group.appendChild(status);
  for(const mode of ['direct','get']) {
  const button = document.createElement('button');
  button.id = mode==='direct'?BUTTON_ID:BUTTON_ID+'-get';
  button.dataset.collectionVersion = '1.2.0';
  button.type = 'button';
  button.draggable = mode==='direct';
  button.textContent = mode==='direct'?'收藏':'GET+';
  button.dataset.actionLabel = mode==='direct'?'收藏':'收藏并添加Get笔记';
  button.setAttribute('aria-label',button.dataset.actionLabel);
  button.title = mode==='direct'?'拖到数码世界的收藏画布，或点击收藏当前作品':'先保存原内容，再交给GET整理；结果显示在同卡Get笔记解析';
  Object.assign(button.style, {
    minHeight: '44px',
    height: '44px',
    width: '64px',
    flex: '0 0 64px',
    boxSizing: 'border-box',
    padding: '0 6px',
    lineHeight: '1.5',
    whiteSpace: 'nowrap',
    border: '1px solid transparent',
    borderRadius: '11px',
    background: mode==='direct'?'rgba(101,220,226,0.12)':'rgba(196,181,253,0.12)',
    color: mode==='direct'?'#65dce2':'#c4b5fd',
    font: '600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    letterSpacing: '0.02em',
    cursor: mode==='direct'?'grab':'pointer',
  });

  button.addEventListener('dragstart', (event) => {
    try {
      const note = captureCurrentNote();
      const payload = `${PAYLOAD_PREFIX}${JSON.stringify(note)}`;
      event.dataTransfer.effectAllowed = 'copy';
      event.dataTransfer.setData('application/x-kankan-note', payload);
      event.dataTransfer.setData('text/plain', payload);
      event.dataTransfer.setData('text/uri-list', note.sourceUrl);
    } catch (error) {
      event.preventDefault();
      setButtonState(button, error instanceof Error ? error.message : '读取失败', '#ff9b8a');
    }
  });

  button.addEventListener('pointerenter', () => {
    document.dispatchEvent(new CustomEvent(PAGE_DATA_REQUEST_EVENT));
  });

  button.addEventListener('click', async () => {
    if(button.disabled)return;
    const lock=value=>group.querySelectorAll('button').forEach(item=>item.disabled=value);
    lock(true);
    let note;
    try {
      await new Promise((resolve,reject)=>{const id=syncNoteContext();const onData=event=>{if(event.source===window&&event.origin===location.origin&&event.data?.source===PAGE_DATA_SOURCE&&event.data.payload?.id===id){clearTimeout(timeout);window.removeEventListener('message',onData);resolve();}};const timeout=setTimeout(()=>{window.removeEventListener('message',onData);reject(new Error('当前作品尚在加载，请稍后再试'));},1500);window.addEventListener('message',onData);document.dispatchEvent(new CustomEvent(PAGE_DATA_REQUEST_EVENT));});
      note = captureCurrentNote();
    } catch (error) {
      setButtonState(button, error instanceof Error ? error.message : '读取失败', '#ff9b8a');
      lock(false);return;
    }

    const send=message=>new Promise((resolve,reject)=>chrome.runtime.sendMessage(message,response=>{if(chrome.runtime.lastError || !response?.ok)reject(Object.assign(new Error(response?.error||'请先打开数码世界'),{statusCode:response?.statusCode,operationNotStarted:response?.operationNotStarted===true}));else resolve(response);}));
    const update=(label,tone)=>{if(note.id===getNoteId() && button.isConnected)setButtonState(button,label,tone);};
    const pendingKey=note.id+':'+mode,existing=pendingOperations.get(pendingKey);let operationId=existing||crypto.randomUUID();
    pendingOperations.set(pendingKey,operationId);update(mode==='get'?'正在保存原内容，随后GET解析…':'正在收藏…','#65dce2');
    try {
      let response=await send(existing?{type:'GET_IMPORT_STATUS',operationId}:{type:'IMPORT_NOTE',note,operationId,mode});
      operationId=response.id || operationId;pendingOperations.set(pendingKey,operationId);
      const deadline=Date.now()+40*60*1000;
      while(response.status==='processing' && Date.now()<deadline){await new Promise(resolve=>setTimeout(resolve,1200));response=await send({type:'GET_IMPORT_STATUS',operationId});}
      if(response.status!=='complete'){if(['failed','interrupted'].includes(response.status))pendingOperations.delete(pendingKey);throw new Error(response.error||'结果待核对，请再次点击查询');}
      pendingOperations.delete(pendingKey);const partial=response.mediaStatus==='partial'||response.videoStatus==='partial';update(partial?'已保存，部分媒体或文稿失败；请到收藏页查看':mode==='get'?'已收藏，GET状态请到同卡解析页查看':response.created?'已收藏':'已更新',partial?'#f1b6af':'#85d39f');
    } catch(error) {
      const missing=error.statusCode===404||error.message==='没有找到本次收藏操作';
      const unpaired=error.operationNotStarted||/^点插件图标，先填入|^插件配对已失效/.test(error.message||'');
      if(unpaired||(missing&&mode==='direct'))pendingOperations.delete(pendingKey);
      update(missing?(mode==='get'?'记录待核对，请在工作台查看GET状态；不会自动重提':'操作记录不存在；请再次点击重新收藏本帖'):error.message||'结果待核对，请再次点击查询','#f1b6af');
    }
    finally {lock(false);}
  });

  group.appendChild(button);
  }
  document.documentElement.appendChild(group);
}

window.addEventListener('message', (event) => {
  if (event.source !== window || event.origin !== location.origin) return;
  if (event.data?.source !== PAGE_DATA_SOURCE) return;
  if (event.data.payload?.id === syncNoteContext()) {
    cachedPageData = event.data.payload;
  }
});

document.addEventListener('dragstart', (event) => {
  const card = noteCardFromDragTarget(event.target);
  if (!card || !event.dataTransfer) return;

  const payload = `${CARD_PAYLOAD_PREFIX}${JSON.stringify(card)}`;
  event.dataTransfer.effectAllowed = 'copy';
  event.dataTransfer.setData('application/x-kankan-card', payload);
  event.dataTransfer.setData('text/plain', payload);
  event.dataTransfer.setData('text/uri-list', card.sourceUrl);
  event.stopImmediatePropagation();
}, true);

installButton();
document.dispatchEvent(new CustomEvent(PAGE_DATA_REQUEST_EVENT));
setInterval(() => {
  syncNoteContext();
  installButton();
  const noteId = getNoteId();
  if (noteId && (noteId !== requestedNoteId || !cachedPageData?.ready)) {
    requestedNoteId = noteId;
    document.dispatchEvent(new CustomEvent(PAGE_DATA_REQUEST_EVENT));
  } else if (!noteId) {
    requestedNoteId = '';
    cachedPageData = null;
  }
}, 1000);
