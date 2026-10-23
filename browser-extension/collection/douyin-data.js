// Read only the currently opened work. No cookies, account API, or network interception.
(() => {
  if (location.hostname !== 'www.douyin.com') return;
  const text = value => typeof value === 'string' ? value.trim() : '';
  function currentId() {
    const url = new URL(location.href);
    const id = url.searchParams.get('modal_id') || url.pathname.match(/^\/(?:video|note)\/(\d{15,25})\/?$/)?.[1];
    return /^\d{15,25}$/.test(id || '') ? id : '';
  }
  function mediaUrl(value, video = false) {
    const candidates = typeof value === 'string' ? [value] : Array.isArray(value) ? value : [value?.url_list, value?.urlList].filter(Array.isArray).flatMap(list => list.slice(0,40));
    const values = Array.isArray(candidates) ? candidates.slice(0,40).map(item => typeof item === 'string' ? item : item?.src) : [];
    for (const item of values) {
      try {
        const url = new URL(text(item).replace(/^http:/, 'https:').replace(/^\/\//, 'https://'));
        const domains = video ? ['.douyinvod.com', '.douyin.com', '.zjcdn.com'] : ['.douyinpic.com', '.byteimg.com'];
        if (url.protocol === 'https:' && !url.username && !url.password && !url.port && domains.some(domain => url.hostname.endsWith(domain))) return url.href;
      } catch { /* An unavailable media URL is reported by the capture button. */ }
    }
    return '';
  }
  function workVideoUrl(video = {}) {
    if (!video || typeof video !== 'object') return '';
    const rates = [video.bit_rate, video.bitRateList].filter(Array.isArray).flat().slice(0,40);
    const candidates = [video.play_addr, video.playAddr, video.play_addr_h264, ...rates.flatMap(rate => [rate?.play_addr, rate?.playAddr]), video.playApi];
    for (const candidate of candidates) {
      const url = mediaUrl(candidate, true);
      if (url) return url;
    }
    return '';
  }
  // Only the unique visible player owned by this exact work may supply a fallback URL.
  // Nearby preloaded players can contain a different work with a perfectly valid URL.
  function currentPlayerVideoUrl(id) {
    const selector = '[data-e2e="feed-active-video"]';
    const containers = [...document.querySelectorAll(selector)].filter(node => {
      if (!node.classList.contains(`video_${id}`)) return false;
      const box = node.getBoundingClientRect(), style = getComputedStyle(node);
      return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    });
    if (containers.length !== 1) return '';
    const container = containers[0];
    const videos = [...container.querySelectorAll('video')].filter(video => video.closest(selector) === container);
    if (videos.length !== 1) return '';
    const video = videos[0];
    for (const value of [video.currentSrc, video.getAttribute('src'), ...[...video.querySelectorAll('source')].map(source => source.getAttribute('src'))]) {
      const url = mediaUrl(value, true);
      if (url) return url;
    }
    return '';
  }
  function findWork(roots, id) {
    const queue = roots.map(value => ({value,depth:0})), seen = new WeakSet();
    let cursor = 0, fallback = null;
    while (cursor < queue.length && cursor < 12000) {
      const {value,depth} = queue[cursor++];
      if (!value || typeof value !== 'object' || seen.has(value) || value instanceof Node) continue;
      seen.add(value);
      // IDs are strings: converting a JS number would silently corrupt a 19-digit ID.
      if ((value.aweme_id === id || value.awemeId === id) && (text(value.desc) || value.video || value.images)) {
        if ((Array.isArray(value.images) && value.images.length) || workVideoUrl(value.video)) return value;
        fallback ||= value;
      }
      if (depth >= 9) continue;
      for (const [key,descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
        if (['return','child','sibling','stateNode','alternate','_owner'].includes(key)) continue;
        const entry = descriptor.value;
        if (entry && typeof entry === 'object' && queue.length < 20000) queue.push({value:entry,depth:depth+1});
      }
    }
    return fallback;
  }
  function capture() {
    const rawId = currentId();
    if (!rawId) return null;
    const id = `douyin-${rawId}`;
    const roots = [window.__ROUTER_DATA__, window.__INITIAL_STATE__, window.__NEXT_DATA__];
    const rendered = document.getElementById('RENDER_DATA');
    if (rendered && rendered.textContent.length < 5 * 1024 * 1024) {
      try { roots.push(JSON.parse(decodeURIComponent(rendered.textContent))); } catch { /* SPA can replace the script during navigation. */ }
    }
    let work = findWork(roots, rawId);
    if (!work || (!(Array.isArray(work.images) && work.images.length) && !workVideoUrl(work.video))) {
      // Dynamic collection modals often retain the work on their rendered React nodes.
      // Bound inspection to the visible detail/player tree and never traverse fiber links.
      const containers = [...document.querySelectorAll('[data-e2e="feed-active-video"], [data-e2e="aweme-detail"], [data-e2e="video-detail"], [data-e2e="modal-video"]')];
      if (!containers.length) containers.push(document.getElementById('root'));
      const nodes = containers.filter(Boolean).flatMap(root => [root,...root.querySelectorAll('*')]).slice(0,1800);
      const props = [];
      for (const node of nodes) {
        for (const key of Object.keys(node)) {
          if (key.startsWith('__reactProps$')) props.push(node[key]);
          else if (key.startsWith('__reactFiber$')) props.push(node[key]?.memoizedProps);
        }
      }
      const renderedWork = findWork(props, rawId);
      if (renderedWork && (!work || workVideoUrl(renderedWork.video) || (Array.isArray(renderedWork.images) && renderedWork.images.length))) work = renderedWork;
    }
    if (!work || currentId() !== rawId) return {id,ready:false};
    const video = work.video || {}, author = work.author || work.authorInfo || {};
    const pictures = Array.isArray(work.images) ? work.images.map(image => mediaUrl(image)).filter(Boolean) : [];
    const isAlbum = Array.isArray(work.images) && work.images.length > 0;
    if (isAlbum && work.images.length > 20) return {id,ready:false,error:'这条图文超过20张图片，暂不能完整收藏'};
    if (isAlbum && pictures.length < work.images.length) return {id,ready:false,error:'图文图片尚未完整读取，请等待加载后重试'};
    const cover = mediaUrl(video.origin_cover || video.originCover || video.cover);
    const imageUrls = [...new Set(isAlbum ? pictures : [cover].filter(Boolean))].slice(0,20);
    const videoUrl = isAlbum ? '' : workVideoUrl(video) || currentPlayerVideoUrl(rawId);
    if (currentId() !== rawId) return {id,ready:false};
    const content = text(work.desc);
    const tags = Array.isArray(work.text_extra || work.textExtra) ? (work.text_extra || work.textExtra).map(tag => text(tag.hashtag_name || tag.hashtagName)).filter(Boolean).slice(0,20) : [];
    return {id,ready:true,title:text(work.preview_title || work.previewTitle) || content.slice(0,100) || '抖音作品',content,imageUrls,videoUrl,type:isAlbum?'normal':'video',tags,author:{name:text(author.nickname),userId:text(author.sec_uid || author.secUid || author.uid),avatar:''}};
  }
  function publish() { window.postMessage({source:'kankan-note-page-data',payload:capture()},location.origin); }
  document.addEventListener('kankan-note-capture-request',publish);
  publish();
})();
