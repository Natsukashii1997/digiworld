import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { runSenseVoiceVideoAnalyzer } from './local-speech-model.mjs';
import { runLocalProcess } from './run-local-process.mjs';
import {verifiedNativeRuntime} from './native-runtime.mjs';
import {analyzeSpeech} from './speech-routing.mjs';

const execFileAsync = runLocalProcess;
const MAX_VIDEO_BYTES = 600 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const REQUEST_TIMEOUT_MS = 120_000;
const MEDIA_HOST_SUFFIXES = ['.xhscdn.com', '.xhsimg.com', '.douyinvod.com', '.douyin.com', '.zjcdn.com'];
const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));

export function isAllowedRemoteVideoUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port
      && MEDIA_HOST_SUFFIXES.some((suffix) => url.hostname.endsWith(suffix));
  } catch {
    return false;
  }
}

function findNativeAnalyzer() {
  const candidates = [
    path.resolve(moduleDirectory, '../native/kankan-video-analyzer'),
    path.resolve(moduleDirectory, '../../src-tauri/bin/kankan-video-analyzer'),
    path.resolve(moduleDirectory, '../kankan-video-analyzer'),
    path.resolve(moduleDirectory, '../../kankan-video-analyzer'),
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) || '';
}

async function fetchVideoResponse(url, fetchImpl, redirectCount = 0) {
  if (!isAllowedRemoteVideoUrl(url)) throw new Error('视频地址不属于受支持的收藏媒体域名');
  const response = await fetchImpl(url, {
    redirect: 'manual',
    credentials: 'omit',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      Accept: 'video/mp4,video/*;q=0.9,application/octet-stream;q=0.7',
      Referer: /\.(xhscdn|xhsimg)\.com$/.test(new URL(url).hostname) ? 'https://www.xiaohongshu.com/' : 'https://www.douyin.com/',
      'User-Agent': 'KanKanFavorites/0.1 local-video-import',
    },
  });

  if (response.status >= 300 && response.status < 400) {
    if (redirectCount >= MAX_REDIRECTS) throw new Error('视频重定向次数过多');
    const location = response.headers.get('location');
    if (!location) throw new Error('视频重定向缺少目标地址');
    return fetchVideoResponse(new URL(location, url).toString(), fetchImpl, redirectCount + 1);
  }
  if (!response.ok) throw new Error(`视频下载失败：${response.status}`);
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (contentType && !contentType.startsWith('video/') && !contentType.includes('octet-stream')) {
    throw new Error('远程内容不是可识别的视频');
  }
  return response;
}

async function downloadVideo(url, noteDirectory, fetchImpl) {
  const response = await fetchVideoResponse(url, fetchImpl);
  if (!response.body) throw new Error('视频响应没有内容');
  const declaredLength = Number.parseInt(response.headers.get('content-length') || '0', 10);
  if (declaredLength > MAX_VIDEO_BYTES) throw new Error('视频超过 600MB');

  const finalPath = path.join(noteDirectory, 'video.mp4');
  const temporaryPath = path.join(noteDirectory, 'video.part');
  let receivedBytes = 0;
  const limiter = new Transform({
    transform(chunk, _encoding, callback) {
      receivedBytes += chunk.length;
      callback(receivedBytes > MAX_VIDEO_BYTES ? new Error('视频超过 600MB') : null, chunk);
    },
  });

  await rm(temporaryPath, { force: true });
  try {
    await pipeline(
      Readable.fromWeb(response.body),
      limiter,
      createWriteStream(temporaryPath),
    );
    await rename(temporaryPath, finalPath);
    return finalPath;
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

async function executeNativeAnalyzer(analyzerPath, args, options={}) {
  const { stdout } = await execFileAsync(analyzerPath, args, {
    timeout: 5 * 60_000,
    killSignal: 'SIGKILL',
    maxBuffer: 16 * 1024 * 1024,
    deadline:options.deadline,
  });
  const result = JSON.parse(stdout);
  if (!result || typeof result !== 'object') throw new Error('本地视频分析没有返回结果');
  return result;
}

export async function runNativeVideoAnalyzer(videoPath, analyzerPath = findNativeAnalyzer(), options = {}) {
  if (process.platform !== 'darwin') throw new Error('视频文稿目前仅支持 macOS');
  analyzerPath=await verifiedNativeRuntime('kankan-video-analyzer');
  if (!analyzerPath) throw new Error('本地视频分析组件未安装');
  return analyzeSpeech({
    multilingual: () => runSenseVoiceVideoAnalyzer(videoPath, {
      analyzerPath,
      modelDirectory: options.modelDirectory,
      fetchImpl: options.fetchImpl,
      deadline:options.deadline,
    }),
    system: () => executeNativeAnalyzer(analyzerPath, [videoPath], options),
    legacy: () => executeNativeAnalyzer(analyzerPath, ['--legacy', videoPath], options),
  });
}

function cleanTranscriptSegments(value) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => ({
    start: Number.isFinite(entry?.start) ? Math.max(0, entry.start) : 0,
    duration: Number.isFinite(entry?.duration) ? Math.max(0, entry.duration) : 0,
    text: typeof entry?.text === 'string' ? entry.text.trim() : '',
  })).filter((entry) => entry.text);
}

export function applyVideoAnalysis(note, analysis, localVideoUrl) {
  const transcriptSegments = cleanTranscriptSegments(analysis.transcriptSegments);
  const transcriptText = transcriptSegments.map((entry) => entry.text).join('\n\n');
  const warnings = [analysis.speechError, !transcriptSegments.length && '没有识别到视频文稿'].filter(Boolean).join('；');
  const updated = {
    ...note,
    videoUrl: localVideoUrl,
    videoDuration: Number.isFinite(analysis.duration) ? analysis.duration : 0,
    transcriptText,
    transcriptSegments,
    transcriptEngine: typeof analysis.engine === 'string' ? analysis.engine : 'unknown',
    videoStatus: warnings ? 'partial' : 'ready',
    videoError: warnings,
  };
  delete updated.videoOcrText;
  delete updated.videoOcrSegments;
  return updated;
}

export async function reanalyzeStoredNoteVideo(note, options) {
  if (note.type !== 'video') throw new Error('这条笔记不是视频');
  const videoPath = path.join(options.mediaDirectory, note.id, 'video.mp4');
  if (!existsSync(videoPath)) throw new Error('本地视频文件不存在');
  const analysis = options.analyzer
    ? await options.analyzer(videoPath)
    : await runNativeVideoAnalyzer(videoPath, undefined, options);
  const localVideoUrl = `${options.publicBaseUrl}/media/${note.id}/video.mp4`;
  return applyVideoAnalysis(note, analysis, localVideoUrl);
}

export async function localizeNoteVideo(note, options) {
  const sourceVideoUrl = typeof note.sourceVideoUrl === 'string'
    ? note.sourceVideoUrl
    : typeof note.videoUrl === 'string' && /^https:\/\//i.test(note.videoUrl)
      ? note.videoUrl
      : '';
  if (note.type !== 'video' || !sourceVideoUrl) {
    return {
      ...note,
      sourceVideoUrl,
      videoUrl: '',
      videoDuration: 0,
      transcriptText: '',
      transcriptSegments: [],
      videoStatus: 'none',
      videoError: note.type === 'video' ? '没有读取到可保存的视频地址' : '',
    };
  }

  const noteDirectory = path.join(options.mediaDirectory, note.id);
  await mkdir(noteDirectory, { recursive: true });
  try {
    await downloadVideo(sourceVideoUrl, noteDirectory, options.fetchImpl || fetch);
  } catch (error) {
    return {
      ...note,
      sourceVideoUrl,
      videoUrl: '',
      videoStatus: 'partial',
      videoError: error instanceof Error ? error.message : '视频保存失败',
    };
  }

  const localVideoUrl = `${options.publicBaseUrl}/media/${note.id}/video.mp4`;
  // 只下载、不转写：视频存好就交回（本地可播），文稿由后台 media-worker 用 reanalyzeStoredNoteVideo 补，收藏不再等转写（#109）。
  return {
    ...note,
    sourceVideoUrl,
    videoUrl: localVideoUrl,
    videoDuration: 0,
    transcriptText: '',
    transcriptSegments: [],
    videoStatus: 'pending',
    videoError: '',
  };
}
