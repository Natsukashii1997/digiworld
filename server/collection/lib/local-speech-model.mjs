import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createReadStream, createWriteStream, existsSync,constants } from 'node:fs';
import { mkdir, mkdtemp, open, rename, rm, stat, lstat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import {runLocalProcess} from './run-local-process.mjs';
import {verifiedNativeRuntime} from './native-runtime.mjs';

const execFileAsync = runLocalProcess;
const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const DOWNLOAD_TIMEOUT_MS = 5 * 60_000;
const MODEL_VERSION = 'sensevoice-small-q8-v1';
const BACKGROUND_NICE_VALUE = '10';
const assetDownloads = new Map();

export const SENSEVOICE_ASSETS = [
  {
    filename: 'sensevoice-small-q8.gguf',
    url: 'https://huggingface.co/FunAudioLLM/SenseVoiceSmall-GGUF/resolve/main/sensevoice-small-q8.gguf',
    size: 254_208_320,
    sha256: '4ae45c94422de949b387e2e0fb10d7e14e4c42c69db30c3444ecc7d4b844b7c5',
  },
  {
    filename: 'fsmn-vad.gguf',
    url: 'https://huggingface.co/FunAudioLLM/fsmn-vad-GGUF/resolve/main/fsmn-vad.gguf',
    size: 1_720_512,
    sha256: '1270f2559c495f4e7b6e739541151027d360761a3fda43fc147034f5719f5479',
  },
];

function findSenseVoiceRuntime() {
  const candidates = [
    path.resolve(moduleDirectory, '../native/kankan-sensevoice'),
    path.resolve(moduleDirectory, '../../src-tauri/bin/kankan-sensevoice'),
    path.resolve(moduleDirectory, '../kankan-sensevoice'),
    path.resolve(moduleDirectory, '../../kankan-sensevoice'),
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) || '';
}

async function sha256File(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath,{flags:constants.O_RDONLY|constants.O_NOFOLLOW})) hash.update(chunk);
  return hash.digest('hex');
}

async function isVerifiedAsset(filePath, asset) {
  try {
    const fileStat = await lstat(filePath);
    if (!fileStat.isFile()||fileStat.isSymbolicLink()||fileStat.nlink!==1||fileStat.size !== asset.size) return false;
    return await sha256File(filePath) === asset.sha256;
  } catch {
    return false;
  }
}

async function downloadVerifiedAssetOnce(asset, targetDirectory, fetchImpl) {
  await mkdir(targetDirectory, { recursive: true });
  const finalPath = path.join(targetDirectory, asset.filename);
  if (await isVerifiedAsset(finalPath, asset)) return finalPath;

  const temporaryPath = `${finalPath}.${randomUUID()}.part`;
  const response = await fetchImpl(asset.url, {
    redirect: 'follow',
    credentials: 'omit',
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    headers: {
      Accept: 'application/octet-stream',
      'User-Agent': 'KanKanFavorites/0.2 local-speech-model',
    },
  });
  if (!response.ok || !response.body) {
    throw new Error(`本地语音模型下载失败：${response.status}`);
  }

  let receivedBytes = 0;
  const hash = createHash('sha256');
  const verifier = new Transform({
    transform(chunk, _encoding, callback) {
      receivedBytes += chunk.length;
      hash.update(chunk);
      callback(receivedBytes > asset.size ? new Error('本地语音模型文件大小异常') : null, chunk);
    },
  });

  try {
    await pipeline(
      Readable.fromWeb(response.body),
      verifier,
      createWriteStream(temporaryPath, { flags: 'wx', mode: 0o600 }),
    );
    if (receivedBytes !== asset.size || hash.digest('hex') !== asset.sha256) {
      throw new Error('本地语音模型校验失败');
    }
    await rename(temporaryPath, finalPath);
    return finalPath;
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

export async function downloadVerifiedAsset(asset, targetDirectory, fetchImpl = fetch) {
  const key = `${path.resolve(targetDirectory)}:${asset.filename}:${asset.sha256}`;
  if (assetDownloads.has(key)) return assetDownloads.get(key);
  const download = (async () => {
    let lastError;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await downloadVerifiedAssetOnce(asset, targetDirectory, fetchImpl);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  })();
  assetDownloads.set(key, download);
  try { return await download; }
  finally { if (assetDownloads.get(key) === download) assetDownloads.delete(key); }
}

export async function ensureSenseVoiceModels(modelDirectory, options = {}) {
  const assets = options.assets || SENSEVOICE_ASSETS;
  const fetchImpl = options.fetchImpl || fetch;
  const versionDirectory = path.join(modelDirectory, MODEL_VERSION);
  const parent=await lstat(modelDirectory);if(!parent.isDirectory()||parent.isSymbolicLink())throw new Error('模型目录不能是链接');
  await mkdir(versionDirectory,{mode:0o700}).catch(error=>{if(error.code!=='EEXIST')throw error;});
  const info=await lstat(versionDirectory);if(!info.isDirectory()||info.isSymbolicLink())throw new Error('模型版本目录不能是链接');
  const markerPath = path.join(versionDirectory, 'verified.json');
  const expectedMarker = JSON.stringify({
    version: MODEL_VERSION,
    assets: assets.map(({ filename, size, sha256 }) => ({ filename, size, sha256 })),
  });

  try {
    const marker = await open(markerPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    let contents;
    try {
      const info = await marker.stat();
      if (!info.isFile() || info.nlink !== 1 || info.size > 4096) throw new Error('模型标记身份异常');
      contents = await marker.readFile('utf8');
    } finally { await marker.close(); }
    if (contents === expectedMarker) {
      const checks = await Promise.all(assets.map(async (asset) => {
        return isVerifiedAsset(path.join(versionDirectory, asset.filename),asset);
      }));
      if (checks.every(Boolean)) {
        return Object.fromEntries(assets.map((asset) => [asset.filename, path.join(versionDirectory, asset.filename)]));
      }
    }
  } catch {
    // Missing or incomplete model files are repaired below.
  }

  const paths = await Promise.all(
    assets.map((asset) => downloadVerifiedAsset(asset, versionDirectory, fetchImpl)),
  );
  const temporaryMarker = `${markerPath}.${randomUUID()}.tmp`;
  let marker;
  try {
    marker = await open(temporaryMarker, 'wx', 0o600);
    await marker.writeFile(expectedMarker, 'utf8');
    await marker.sync();
    await marker.close(); marker = null;
    await rename(temporaryMarker, markerPath);
  } finally { await marker?.close(); await rm(temporaryMarker, { force: true }); }
  return Object.fromEntries(assets.map((asset, index) => [asset.filename, paths[index]]));
}

function parseSrtTime(value) {
  const match = value.trim().match(/^(\d+):(\d{2}):(\d{2})[,.](\d{3})$/);
  if (!match) return null;
  return Number(match[1]) * 3600
    + Number(match[2]) * 60
    + Number(match[3])
    + Number(match[4]) / 1000;
}

export function parseSenseVoiceSrt(value) {
  return String(value || '')
    .replace(/\r/g, '')
    .split(/\n{2,}/)
    .flatMap((block) => {
      const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
      const timingIndex = lines.findIndex((line) => line.includes('-->'));
      if (timingIndex < 0) return [];
      const [rawStart, rawEnd] = lines[timingIndex].split('-->').map((part) => part.trim());
      const start = parseSrtTime(rawStart);
      const end = parseSrtTime(rawEnd);
      const text = lines.slice(timingIndex + 1).join(' ').trim();
      if (start === null || end === null || !text) return [];
      return [{ start, duration: Math.max(0, end - start), text }];
    });
}

export function buildSenseVoiceProcess(runtimePath, args) {
  if (process.platform !== 'darwin') return { executable: runtimePath, args };
  return {
    executable: '/usr/bin/nice',
    args: ['-n', BACKGROUND_NICE_VALUE, runtimePath, ...args],
  };
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

export async function runSenseVoiceVideoAnalyzer(videoPath, options) {
  const runtimePath = await verifiedNativeRuntime('kankan-sensevoice');
  if (!runtimePath) throw new Error('本地语音识别组件未安装');
  if (process.arch !== 'arm64') throw new Error('本地高精度语音识别目前需要 Apple 芯片');

  const boundedFetch=async(url,init)=>{const remaining=options.deadline-Date.now();if(remaining<=0)throw new Error('本次分析已达到时间上限');return (options.fetchImpl||fetch)(url,{...init,signal:AbortSignal.any([init.signal,AbortSignal.timeout(Math.min(300000,Number.isFinite(remaining)?remaining:300000))])});};
  const modelPaths = await ensureSenseVoiceModels(options.modelDirectory, {...options,fetchImpl:boundedFetch});
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'kankan-speech-'));
  const audioM4aPath = path.join(temporaryDirectory, 'audio.m4a');
  const audioWavPath = path.join(temporaryDirectory, 'audio.wav');
  try {
    const exportResult = await executeNativeAnalyzer(
      options.analyzerPath,
      ['--extract-audio', videoPath, audioM4aPath],
      options,
    );
    if (exportResult.speechError) throw new Error(exportResult.speechError);
    await execFileAsync('/usr/bin/afconvert', [
      audioM4aPath,
      audioWavPath,
      '-f', 'WAVE',
      '-d', 'LEI16@16000',
      '-c', '1',
    ], {
      timeout: 2 * 60_000,
      killSignal: 'SIGKILL',
      maxBuffer: 4 * 1024 * 1024,
      deadline:options.deadline,
    });

    const runtimeArgs = [
      '-m', modelPaths['sensevoice-small-q8.gguf'],
      '--vad', modelPaths['fsmn-vad.gguf'],
      '-a', audioWavPath,
      '--srt',
    ];
    const processCommand = buildSenseVoiceProcess(runtimePath, runtimeArgs);
    const { stdout } = await execFileAsync(processCommand.executable, processCommand.args, {
      timeout: 10 * 60_000,
      killSignal: 'SIGKILL',
      maxBuffer: 32 * 1024 * 1024,
      deadline:options.deadline,
    });
    const transcriptSegments = parseSenseVoiceSrt(stdout);
    return {
      duration: Number.isFinite(exportResult.duration) ? exportResult.duration : 0,
      transcriptSegments,
      speechError: transcriptSegments.length ? null : '没有识别到视频文稿',
      engine: 'sensevoice-small',
    };
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}
