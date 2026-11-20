import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { boundedResponseBytes } from './bounded-response.mjs';

const execFileAsync = promisify(execFile);
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const REQUEST_TIMEOUT_MS = 20_000;
const MEDIA_HOST_SUFFIXES = ['.xhscdn.com', '.xhsimg.com', '.douyinpic.com', '.byteimg.com'];
const CONTENT_TYPE_EXTENSIONS = new Map([
  ['image/avif', '.avif'],
  ['image/gif', '.gif'],
  ['image/heic', '.heic'],
  ['image/heif', '.heif'],
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
]);
const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultOcrScriptPath = path.resolve(moduleDirectory, '..', 'macos-vision-ocr.js');

export function isAllowedRemoteImageUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port
      && MEDIA_HOST_SUFFIXES.some((suffix) => url.hostname.endsWith(suffix));
  } catch {
    return false;
  }
}

function extensionFromContentType(contentType) {
  const normalized = String(contentType || '').split(';')[0].trim().toLowerCase();
  return CONTENT_TYPE_EXTENSIONS.get(normalized) || '';
}

async function fetchImageResponse(url, fetchImpl, redirectCount = 0) {
  if (!isAllowedRemoteImageUrl(url)) throw new Error('图片地址不属于受支持的收藏图床');

  const response = await fetchImpl(url, {
    redirect: 'manual',
    credentials: 'omit',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      Referer: /\.(xhscdn|xhsimg)\.com$/.test(new URL(url).hostname) ? 'https://www.xiaohongshu.com/' : 'https://www.douyin.com/',
      'User-Agent': 'KanKanFavorites/0.1 local-media-import',
    },
  });

  if (response.status >= 300 && response.status < 400) {
    if (redirectCount >= MAX_REDIRECTS) throw new Error('图片重定向次数过多');
    const location = response.headers.get('location');
    if (!location) throw new Error('图片重定向缺少目标地址');
    return fetchImageResponse(new URL(location, url).toString(), fetchImpl, redirectCount + 1);
  }
  if (!response.ok) throw new Error(`图片下载失败：${response.status}`);
  return response;
}

async function downloadImage(url, noteDirectory, index, fetchImpl) {
  const response = await fetchImageResponse(url, fetchImpl);
  const extension = extensionFromContentType(response.headers.get('content-type'));
  if (!extension) throw new Error('远程内容不是可识别的图片');

  const declaredLength = Number.parseInt(response.headers.get('content-length') || '0', 10);
  if (declaredLength > MAX_IMAGE_BYTES) throw new Error('单张图片超过 15MB');
  const buffer = await boundedResponseBytes(response, MAX_IMAGE_BYTES, '单张图片超过 15MB');

  const fileName = `${String(index + 1).padStart(2, '0')}${extension}`;
  const filePath = path.join(noteDirectory, fileName);
  await writeFile(filePath, buffer);
  return { fileName, filePath, sourceUrl: url };
}

export async function runMacVisionOcr(imagePaths, ocrScriptPath = defaultOcrScriptPath) {
  if (process.platform !== 'darwin' || imagePaths.length === 0) return [];
  const { stdout } = await execFileAsync('/usr/bin/osascript', [
    '-l',
    'JavaScript',
    ocrScriptPath,
    ...imagePaths,
  ], {
    maxBuffer: 8 * 1024 * 1024,
    timeout: 120_000,
  });
  const payload = JSON.parse(stdout);
  return Array.isArray(payload) ? payload : [];
}

async function mapWithConcurrency(values, concurrency, callback) {
  const results = new Array(values.length);
  let cursor = 0;

  async function worker() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = await callback(values[index], index);
      } catch (error) {
        results[index] = {
          error: error instanceof Error ? error.message : '图片处理失败',
          sourceUrl: values[index],
        };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return results;
}

export async function localizeNoteMedia(note, options) {
  const sourceUrls = Array.from(new Set(
    (note.imageUrls || []).filter(isAllowedRemoteImageUrl),
  )).slice(0, 20);
  if (sourceUrls.length === 0) {
    return {
      ...note,
      sourceImageUrls: [],
      imageUrls: [],
      imageOcr: [],
      ocrText: '',
      mediaStatus: 'none',
    };
  }

  const noteDirectory = path.join(options.mediaDirectory, note.id);
  await mkdir(noteDirectory, { recursive: true });
  const downloads = await mapWithConcurrency(
    sourceUrls,
    options.downloadConcurrency || 2,
    (url, index) => downloadImage(url, noteDirectory, index, options.fetchImpl || fetch),
  );
  const successful = downloads.filter((item) => item?.filePath);
  const images = successful.map((item) => ({
    filePath: item.filePath,
    imageUrl: `${options.publicBaseUrl}/media/${note.id}/${item.fileName}`,
  }));
  const failedDownloads = downloads.length - successful.length;
  const downloadDetails = downloads.flatMap((item,index)=>item.error?[`图片${index+1}：${String(item.error).replace(/https?:\/\/\S+/g,'[来源地址]').slice(0,180)}`]:[]);
  const localImageUrls = images.map((item) => item.imageUrl);
  const saved = {
    ...note,
    sourceImageUrls: sourceUrls,
    imageUrls: localImageUrls,
    coverUrl: localImageUrls[0] || '',
    mediaError: [failedDownloads ? `${failedDownloads} 张图片保存失败` : '', ...downloadDetails].filter(Boolean).join('；'),
  };
  // deferOcr：图片存好就交回，文字识别由后台补（ocr-worker），收藏不再等 OCR（#107）。
  if (options.deferOcr && images.length) {
    return { ...saved, imageOcr: images.map(({ imageUrl }) => ({ imageUrl, text: '', error: '' })), ocrText: '', mediaStatus: 'pending' };
  }
  return { ...saved, ...finishNoteOcr(saved, await recognizeImages(images, options.ocrRunner)) };
}

function ocrFailureMessage(error) {
  return error?.killed || error?.signal || error?.code === 'ETIMEDOUT' ? '本地文字识别超时' : '本地文字识别失败';
}

// 一张一张识别：每张各自超时，一张失败不拖累其他几张（#107：9 张一次跑、总共 120 秒，超时后全部丢失）。
export async function recognizeImages(images, ocrRunner = runMacVisionOcr) {
  const imageOcr = [];
  for (const { filePath, imageUrl } of images) {
    if (!filePath) { imageOcr.push({ imageUrl, text: '', error: '图片文件缺失' }); continue; }
    try {
      const result = (await ocrRunner([filePath])).find((item) => item?.path === filePath);
      imageOcr.push({
        imageUrl,
        text: typeof result?.text === 'string' ? result.text.trim() : '',
        error: result?.error ? String(result.error) : (!result ? 'OCR未返回这张图片的结果' : ''),
      });
    } catch (error) {
      imageOcr.push({ imageUrl, text: '', error: ocrFailureMessage(error) });
    }
  }
  return imageOcr;
}

// 由识别结果算出卡片的图片文字与媒体状态；note.mediaError 里已有的下载失败原样保留在前面。
export function finishNoteOcr(note, imageOcr) {
  const failedDownloads = (note.sourceImageUrls?.length || 0) - (note.imageUrls?.length || 0);
  const failures = new Map();
  for (const item of imageOcr) {
    if (!item.error) continue;
    const number = Number(/(\d+)\.[a-z0-9]+$/i.exec(item.imageUrl || '')?.[1]) || imageOcr.indexOf(item) + 1;
    failures.set(item.error, [...(failures.get(item.error) || []), number]);
  }
  return {
    imageOcr,
    ocrText: imageOcr.map((item) => item.text).filter(Boolean).join('\n\n'),
    mediaStatus: failedDownloads === 0 && failures.size === 0 ? 'ready' : 'partial',
    mediaError: [note.mediaError || '', ...[...failures].map(([message, numbers]) => `图片${numbers.join('、')}：${message}`)].filter(Boolean).join('；'),
  };
}
