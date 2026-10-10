const BUTTON_ID = 'kankan-note-import-button';
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
  if(id!==requestedNoteId){navigationGeneration++;requestedNoteId=id;cachedPageData=null;document.getElementById(BUTTON_ID)?.remove();document.dispatchEvent(new CustomEvent(PAGE_DATA_REQUEST_EVENT));}
  return id;
}

function getNoteId() {
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
  if (!id) throw new Error('请先打开一条小红书笔记详情');
  if(cachedPageData?.id!==id || !cachedPageData.ready)throw new Error('当前笔记尚在加载，请稍后再试');
  const generation=navigationGeneration,root=currentDetailRoot(id);

  const title = cachedPageData.title || '未命名收藏';
  const content = cachedPageData.content || '';
  const imageUrls = collectImages(root);
  const videoUrl = collectVideoUrl(root);
  const type = cachedPageData.type === 'video' ? 'video' : 'normal';
  if (type === 'video' && !videoUrl) {
    throw new Error('没有读取到视频，请先播放几秒再试');
  }
  if(generation!==navigationGeneration||getNoteId().toLowerCase()!==id)throw new Error('笔记已切换，请重新收藏当前帖');

  return {
    id,
    sourceUrl: location.href,
    title,
    content,
    imageUrls,
    coverUrl: imageUrls[0] || '',
    videoUrl,
    author: cachedPageData.author || {name:'未知作者'},
    tags: collectTags(root),
    type,
  };
}

function setButtonState(button, label, tone) {
  button.textContent = label;
  button.style.background = tone;
}

function installButton() {
  const existing = document.getElementById(BUTTON_ID);
  if (!getNoteId()) {
    existing?.remove();
    return;
  }
  if (existing) return;

  const button = document.createElement('button');
  button.id = BUTTON_ID;
  button.dataset.collectionVersion = '1.0.1';
  button.type = 'button';
  button.draggable = true;
  button.textContent = '收藏到「数码世界」';
  button.title = '拖到数码世界的收藏画布，或点击收藏当前笔记';
  Object.assign(button.style, {
    position: 'fixed',
    right: '24px',
    bottom: '24px',
    zIndex: '2147483647',
    minHeight: '44px',
    maxWidth: 'calc(100vw - 48px)',
    padding: '11px 18px',
    lineHeight: '1.5',
    whiteSpace: 'normal',
    border: '1px solid rgba(255,255,255,0.55)',
    borderRadius: '6px',
    background: '#65dce2',
    color: '#10161b',
    boxShadow: '0 10px 30px rgba(42,50,44,0.28)',
    font: '600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    cursor: 'grab',
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
      setButtonState(button, error instanceof Error ? error.message : '读取失败', '#B56A5B');
    }
  });

  button.addEventListener('pointerenter', () => {
    document.dispatchEvent(new CustomEvent(PAGE_DATA_REQUEST_EVENT));
  });

  button.addEventListener('click', async () => {
    let note;
    try {
      note = captureCurrentNote();
    } catch (error) {
      setButtonState(button, error instanceof Error ? error.message : '读取失败', '#B56A5B');
      return;
    }

    const send=message=>new Promise((resolve,reject)=>chrome.runtime.sendMessage(message,response=>{if(chrome.runtime.lastError || !response?.ok)reject(Object.assign(new Error(response?.error||'请先打开数码世界'),{statusCode:response?.statusCode,operationNotStarted:response?.operationNotStarted===true}));else resolve(response);}));
    const update=(label,tone)=>{if(note.id===getNoteId() && button.isConnected)setButtonState(button,label,tone);};
    const existing=pendingOperations.get(note.id),operationId=existing||crypto.randomUUID();
    pendingOperations.set(note.id,operationId);button.disabled=true;update('正在收藏…','#65dce2');
    try {
      let response=await send(existing?{type:'GET_IMPORT_STATUS',operationId}:{type:'IMPORT_NOTE',note,operationId});
      const deadline=Date.now()+40*60*1000;
      while(response.status==='processing' && Date.now()<deadline){await new Promise(resolve=>setTimeout(resolve,1200));response=await send({type:'GET_IMPORT_STATUS',operationId});}
      if(response.status!=='complete'){if(['failed','interrupted'].includes(response.status))pendingOperations.delete(note.id);throw new Error(response.error||'结果待核对，请再次点击查询');}
      pendingOperations.delete(note.id);update(response.created?'已收藏':'已更新','#85d39f');
    } catch(error) {
      const missing=error.statusCode===404||error.message==='没有找到本次收藏操作';
      const unpaired=error.operationNotStarted||/^点插件图标，先填入|^插件配对已失效/.test(error.message||'');
      if(unpaired||missing)pendingOperations.delete(note.id);
      update(missing?'操作记录不存在；请再次点击重新收藏本帖':error.message||'结果待核对，请再次点击查询','#f1b6af');
    }
    finally {button.disabled=false;}
  });

  document.documentElement.appendChild(button);
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
  if (noteId && noteId !== requestedNoteId) {
    requestedNoteId = noteId;
    document.dispatchEvent(new CustomEvent(PAGE_DATA_REQUEST_EVENT));
  } else if (!noteId) {
    requestedNoteId = '';
    cachedPageData = null;
  }
}, 1000);
