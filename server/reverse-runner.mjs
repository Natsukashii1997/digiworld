import {createAiProcess,aiPrompt} from './reverse-ai-process.mjs';
import {EXECUTORS,currentPackVersion,packTargetMatches} from '../src/reverse-ai.js';
import {buildReplicaPack,successfulRun} from '../src/reverse-v4.js';
import { mkdir, lstat, readdir, readFile, writeFile, rename, open, rmdir } from 'node:fs/promises';
import { createReadStream, createWriteStream, constants } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { join, basename } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { checkReverseTarget } from './reverse-target.mjs';
import { validateReverseTarget } from '../src/reverse-recipe.js';
import { createReaProcess, REA_METADATA_BYTES, REA_BOOTSTRAP_VERSION, registeredVersion, reaError, safeLine, readRegisteredDoctor } from './reverse-process.mjs';
import { summarizeEvidence } from './reverse-json.mjs';
import {precheckBrowserTarget} from './reverse-precheck.mjs';

const id = value => { if (!/^[A-Za-z0-9_-]{1,100}$/.test(value || '')) throw reaError('input', '无效记录或请求编号'); return value; };
export const LOG_BYTES = 200 * 1024;
export function appendLog(run, message, { replace = false, detail } = {}) {
  const sequence = ++run.sequence, previous = replace && run.log.at(-1);
  const line = { seq: previous ? previous.seq : sequence, text: safeLine(message), ...(detail ? { detail: safeLine(detail, 16384) } : {}) };
  if (previous) run.log[run.log.length - 1] = line; else run.log.push(line);
  let bytes = Buffer.byteLength(JSON.stringify(run.log));
  while (run.log.length > 2000 || bytes > LOG_BYTES) {
    bytes -= Buffer.byteLength(JSON.stringify(run.log.shift())) + 1; run.truncated = true;
  }
}
async function privateDir(path) {
  await mkdir(path, { mode: 0o700 }).catch(e => { if (e.code !== 'EEXIST') throw e; });
  const s = await lstat(path); if (!s.isDirectory() || s.isSymbolicLink()) throw reaError('disk', 'REA 证据目录身份无效');
}
async function checkedPath(path) {
  const entries = [];
  const checked = await checkReverseTarget({ path }, { stat: async p => {
    const s = await lstat(p); entries.push([p, s.dev, s.ino, s.mode, ...(p === path || p === join(path, "Contents/Resources/app.asar") ? [s.size, s.mtimeMs] : [])]); return s;
  } });
  if (!checked.exists || checked.kind === 'app' && !checked.appAsarExists) throw reaError('target', '目标或 app.asar 不存在，请重新检查路径');
  return { input: checked.kind === 'app' ? join(path, 'Contents/Resources/app.asar') : path,
    identity: createHash('sha256').update(JSON.stringify(entries)).digest('hex'), ...checked };
}
async function fingerprint(path, signal) {
  const hash = createHash('sha256'); let count = 0;
  async function visit(p, relative) {
    signal?.throwIfAborted();
    const s = await lstat(p);
    if (s.isSymbolicLink()) throw reaError('target', '目标中存在符号链接，未运行取证');
    if (++count > 200000) throw reaError('target', '目标文件数量超过本阶段 20 万项上限');
    hash.update(JSON.stringify([relative, s.dev, s.ino, s.mode, s.size, s.mtimeMs]));
    if (s.isDirectory()) { for (const name of (await readdir(p)).sort()) await visit(join(p, name), relative + '/' + name); }
    else if (s.isFile()) {
      const file = await open(p, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const actual = await file.stat();
        if (actual.dev !== s.dev || actual.ino !== s.ino || actual.size !== s.size || actual.mtimeMs !== s.mtimeMs) throw reaError('target_changed', '目标在读取前变化');
        for await (const bytes of file.createReadStream({ signal, autoClose: false })) hash.update(bytes);
        const after = await file.stat();
        if (after.size !== s.size || after.mtimeMs !== s.mtimeMs) throw reaError('target_changed', '目标在读取期间变化');
      } finally { await file.close(); }
    }
    else throw reaError('target', '目标包含不支持的特殊文件');
  }
  await visit(path, ''); return hash.digest('hex');
}

function withPack(record,run,result){
  const version={id:run.id,at:run.finishedAt||run.startedAt,executor:run.executor||'rea',target:structuredClone(run.target),result,...(run.summary?{rea:{version:run.version,summary:structuredClone(run.summary)}}:{}),packHash:createHash('sha256').update(result.pack).digest('hex')};
  const all=[...(record.packVersions||[]).filter(v=>v.id!==run.id),version];
  while(all.length>8){const discard=all.findIndex(v=>v.id!==record.activePackVersionId&&v.id!==run.id);all.splice(discard,1);}
  return {...record,packVersions:all,activePackVersionId:run.id,reaRuns:record.reaRuns?.filter(r=>!r.executor||r.executor==='rea'||r.status!=='completed'||all.some(v=>v.id===r.packVersionId))};
}
function preservePack(record){
  if(currentPackVersion(record))return record;
  const old=successfulRun(record);if(!old)return record;
  const pack=buildReplicaPack(record);return pack?withPack(record,old,{conclusions:[],unknowns:[],pack}):record;
}
export async function createReverseRunner({ repository, execute = createReaProcess(), executeAi = createAiProcess(), aiTimeoutMs = 1800000, clock = Date.now,
  timeoutMs = 600000, precheckTimeoutMs = 15000, getVersion, doctorVersion = () => REA_BOOTSTRAP_VERSION, externalBusy = () => false } = {}) {
  const root = join(repository.directory, 'reverse-evidence');
  const checks = new Map(); let active = null, starting = false, closed = false, startController, startSettled, settleStart;
  const stamp = () => new Date(clock()).toISOString();
  const store = async (recordId, run, result) => repository.updateReverse(records => records.map(r => {
    if (r.id !== recordId) return r;
    if (run.status === 'completed' && (r.deletedAt || JSON.stringify(r.material.target) !== JSON.stringify(run.target))) {
      delete run.summary; delete run.packVersionId; run.status = 'failed';
      run.error = { kind: 'target_changed', code: '', message: '参照物在最终提交前变化，摘要未采用' };
    }
    let next={...r,reaRuns:[...(r.reaRuns||[]).filter(x=>x.id!==run.id),structuredClone(run)].slice(-8)};
    if(run.status==='completed'&&!r.packVersions?.some(v=>v.id===run.id)){
      const output=result||(run.summary?{conclusions:[],unknowns:[],pack:buildReplicaPack({...next,packVersions:[],activePackVersionId:undefined})}:null);
      if(!output)throw reaError('result','AI完成缺少已校验结果');
      next=withPack(next,run,output);
    }
    return next;
  }));
  const state = await repository.read();
  if (state?.reverseRecords?.some(r => r.reaRuns?.some(x => x.status === 'running'))) {
    await repository.updateReverse(records => records.map(r => !r.reaRuns ? r : ({ ...r, reaRuns: r.reaRuns.map(x => x.status !== 'running' ? x :
      { ...x, status: 'interrupted', finishedAt: stamp(), error: { kind: 'interrupted', code: '', message: '服务重启，取证已中断；未自动重跑' } }) })));
  }
  async function status({ signal: parentSignal } = {}) {
    await privateDir(root); const folder = join(root, 'diagnostics'); await privateDir(folder);
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(reaError('timeout', 'REA 版本检查超时')), 30000);
    try {
      const raw = await readRegisteredDoctor(async version => {
        const output = join(folder, randomUUID() + '.json');
        const returned = await execute(version, ['doctor'], output, {offline:true, signal:parentSignal ? AbortSignal.any([parentSignal,controller.signal]) : controller.signal});
        const s=await lstat(output);if(s.size>REA_METADATA_BYTES)throw reaError('version','REA doctor输出超过读取上限');
        return returned || JSON.parse(await readFile(output,'utf8'));
      },doctorVersion());
      return registeredVersion(raw);
    } finally { clearTimeout(timer); }
  }

  async function check(input) {
    // Preserve the original endpoint's lstat-only contract.
    const checked = await checkReverseTarget(input);
    if (!checked.exists || checked.kind === 'app' && !checked.appAsarExists) return checked;
    const details = await checkedPath(input.path), checkId = randomUUID();
    for (const [key, v] of checks) if (clock() - v.at > 600000) checks.delete(key);
    if (checks.size >= 100) checks.delete(checks.keys().next().value);
    checks.set(checkId, { path: input.path, ...details, at: clock() });
    return { ...checked, checkId };
  }
  async function query({ recordId, runId } = {}) {
    const r = (await repository.read())?.reverseRecords?.find(r => r.id === recordId);
    if (!r) throw reaError('input', '参照物不存在');
    const persistedRun = (runId ? r.reaRuns?.find(x => x.id === runId) : r.reaRuns?.at(-1)) || null;
    const run = active?.persistenceError && active.recordId === recordId && (!runId || active.run.id === runId) ? structuredClone(active.run) : persistedRun;
    let rawAvailable = false;
    if (run) { try { rawAvailable = (await lstat(join(root, id(recordId), id(run.id), (run.executor&&run.executor!=='rea'?'events.jsonl':'analysis.json')))).isFile(); } catch { /* excluded from backups */ } }
    return { run, rawAvailable, persistencePending: !!active?.persistenceError, busy: !!active || starting };
  }
  const probeWeb = (target,signal) => precheckBrowserTarget(target,{directory:root,execute,getVersion:getVersion||status,signal,timeoutMs:precheckTimeoutMs});
  async function precheck({recordId,expectedRevision}) {
    id(recordId);const state=await repository.read(),record=state?.reverseRecords?.find(r=>r.id===recordId&&!r.deletedAt);
    if(!record)throw reaError('input','参照物不存在');
    if(state.revision!==expectedRevision)throw Object.assign(reaError('conflict','记录已变化，请刷新后重试'),{status:409});
    const target=validateReverseTarget(record.material?.target,record.type);
    if(target.kind!=='web')throw reaError('input','网站预检仅支持网站目标');
    if(closed||starting||active||externalBusy())throw Object.assign(reaError('busy','已有取证或更新正在运行'),{status:409});
    starting=true;startController=new AbortController();startSettled=new Promise(resolve=>{settleStart=resolve;});
    try{const result=await probeWeb(target,startController.signal);if((await repository.read()).revision!==expectedRevision)throw Object.assign(reaError('conflict','记录在预检期间变化，请刷新后重试'),{status:409});return {...result,recordId,revision:state.revision};}
    finally{starting=false;settleStart();}
  }
  async function start({ recordId, requestId, checkId, expectedRevision, executor='rea' }) {
    id(recordId); id(requestId);if(!EXECUTORS.includes(executor))throw reaError('input','未知执行器');
    const state = await repository.read(), record = state?.reverseRecords?.find(r => r.id === recordId && !r.deletedAt);
    if (!record) throw reaError('input', '参照物不存在');
    const prior = record.reaRuns?.find(x => x.id === requestId); if (prior) return { run: prior, reused: true };
    if (closed || starting || active || externalBusy()) throw Object.assign(reaError('busy', '已有取证或更新正在运行'), { status: 409 });
    if (state.revision !== expectedRevision) throw Object.assign(reaError('conflict', '记录已变化，请刷新后重试'), { status: 409 });
    starting = true; startController = new AbortController();
    startSettled = new Promise(resolve => { settleStart = resolve; });
    const duration=executor==='rea'?timeoutMs:aiTimeoutMs;
    const deadline = Date.now() + duration;
    const startTimer = setTimeout(() => startController.abort(reaError('timeout', '逆向启动超时')), duration);
    const signal = startController.signal;
    try {
      const target = structuredClone(validateReverseTarget(record.material?.target, record.type));
      if(target.kind==='local')throw reaError('input','本机文件目标请使用原生 Codex 分析');
      let input, identity;
      if (target.kind === 'electron') {
        const receipt = checks.get(checkId);
        if (!receipt || receipt.path !== target.path || clock() - receipt.at > 600000) throw reaError('target', '请先检查该目标路径');
        const current = await checkedPath(target.path);
        if (current.identity !== receipt.identity) throw reaError('target_changed', '目标在检查后变化，请重新检查');
        ({ input, identity } = current);
      }
      signal.throwIfAborted();
      const webCheck=target.kind==='web'?await probeWeb(target,signal):null;
      if(webCheck&&(await repository.read()).revision!==expectedRevision)throw Object.assign(reaError('conflict','记录在预检期间变化，请刷新后重试'),{status:409});
      if(webCheck&&webCheck.status!=='ready')return {run:null,precheck:{...webCheck,recordId,revision:expectedRevision}};
      const version = webCheck?.version || (await (getVersion ? getVersion({ signal }) : status({ signal }))).version;
      signal.throwIfAborted();
      if (!version) throw reaError('version', '两个客户端的 REA 注册版本不一致或未知，请先检查 REA');
      await privateDir(root); await privateDir(join(root, recordId));
      const folder = join(root, recordId, requestId); await mkdir(folder, { mode: 0o700 });
      const run = { id: requestId, status: 'running', startedAt: stamp(), version, target,executor,
        log: [], sequence: 0, truncated: false };
      appendLog(run, executor==='rea'?'REA 本机静态取证；原始输出只留本机，不随备份导出。':'AI 仅分析，不修改项目；客户端可维护自身状态与缓存。将使用所选AI额度，未经复刻验证。');
      try {
        await repository.updateReverse(records => records.map(r => r.id === recordId ? { ...preservePack(r), reaRuns: [...(r.reaRuns || []), run].slice(-8) } : r), { expectedRevision });
      } catch (error) {
        // Remove only this attempt's empty directory when a readback proves no run persisted.
        // Unknown persistence outcomes retain the directory and request identity for recovery.
        const saved = await repository.read().catch(() => null);
        if (saved && !saved.reverseRecords?.find(r => r.id === recordId)?.reaRuns?.some(r => r.id === requestId)) {
          await rmdir(folder).catch(() => {});
        }
        throw error;
      }
      const controller = startController;
      active = { recordId, run, controller, promise: null };
      active.promise = perform({ recordId, run, folder, input, identity, controller, deadline,record,webCheck });
      return { run: structuredClone(run) };
    } finally { clearTimeout(startTimer); starting = false; settleStart(); }
  }
  async function perform({ recordId, run, folder, input, identity, controller, deadline,record,webCheck }) {
    const { signal } = controller;
    const timer = setTimeout(() => controller.abort(reaError('timeout', run.executor==='rea'?'REA 取证超过 10 分钟，已停止进程树':'AI分析超过30分钟，已停止进程树')), Math.max(1, deadline - Date.now()));
    let flush = null, pending = Promise.resolve(), persistenceError,aiResult,usageLine;
    const save = () => { const snapshot=structuredClone(run);pending = pending.then(() => store(recordId, snapshot)).catch(e => { persistenceError = e; controller.abort(reaError('disk', '运行日志写盘失败')); }); };
    const log = (text, options) => { appendLog(run, text, options); if (!flush) flush = setTimeout(() => { flush = null; save(); }, 250); };
    const command = async (args, name, displayCommand) => { signal.throwIfAborted(); const path = join(folder, name); await execute(run.version, args, path, { signal, onLine: log, displayCommand }); return path; };
    try {
      if(run.executor!=='rea'){
        const before=input?await fingerprint(input,signal):null;
        let sha=null;if(input&&(await lstat(input)).isFile()){const h=createHash('sha256');for await(const bytes of createReadStream(input,{signal}))h.update(bytes);sha=h.digest('hex');}
        const old=successfulRun(record),priorVersion=[...(record.packVersions||[])].reverse().find(v=>v.rea&&JSON.stringify(v.target)===JSON.stringify(run.target));
        const prior=old|| (priorVersion?{id:priorVersion.id,version:priorVersion.rea.version,summary:priorVersion.rea.summary}:null);
        let analysisPath,analysisBytes;
        if(prior){const path=join(root,recordId,prior.id,'analysis.json');try{const s=await lstat(path);if(s.isFile()&&!s.isSymbolicLink()){analysisPath=path;analysisBytes=s.size;}}catch{/* raw evidence is excluded from backup */}}
        const context={sha256:sha||'当前目标无单一文件SHA',prior:prior?{runId:prior.id,version:prior.version,summary:prior.summary,analysisPath:analysisPath||null,analysisBytes:analysisBytes??null,shaMatches:!!sha&&sha===prior.summary.sha256}:null};
        aiResult=await executeAi(run.executor,{folder,targetPath:run.target.kind==='electron'?run.target.path:undefined,prompt:aiPrompt(record,context),readDirectories:analysisPath?[join(root,recordId,prior.id)]:[],signal,onLine:(text,options)=>options?.usage?usageLine=text:log(text,options)});
        if(before&&(before!==await fingerprint(input,signal)||(await checkedPath(run.target.path)).identity!==identity))throw reaError('target_changed','目标在分析期间变化，结果未采用');
        signal.throwIfAborted();run.status='completed';run.packVersionId=run.id;
        log('✓ AI分析完成；结论与任务包已校验，未经复刻验证。');
      }else{
      let before, analysis;
      if (run.target.kind === 'electron') {
        before = await fingerprint(input, signal);
        if ((await checkedPath(run.target.path)).identity !== identity) throw reaError('target_changed', '目标在启动前变化');
        analysis = await command(['analyze-javascript-application', input, '--integrity-policy', 'record-and-continue'], 'analysis.partial', `$ rea analyze-javascript-application ${JSON.stringify(basename(input))}  integrity=record-and-continue`);
      } else {
        const endpoint = run.target.cdpEndpoint || 'http://127.0.0.1:9222';
        const origin = new URL(run.target.url).origin;
        analysis = await command(['analyze-web-bundle', endpoint, webCheck.targetId, '--allowed-origins', origin], 'analysis.partial', `$ rea analyze-web-bundle ${endpoint}  target=${webCheck.targetId}`);
      }
      const summary = await summarizeEvidence(analysis, run.target.kind, { signal });
      log(run.target.kind === 'web' ? `✓ 脚本 ${summary.scriptsAnalyzed}/${summary.scriptsObserved}` : `✓ 模块 ${summary.modules} · JS 文件 ${summary.parsedJavaScriptFiles} · IPC ${summary.ipcChannels} · 原生扩展 ${summary.nativeBindings}`);
      const clues = run.target.clues || [];
      if (!clues.length) log('未填写线索词，只做整体解析。用 AI 逆推可自动定线索词。');
      if (clues.length && run.target.kind === 'web') { summary.clueLimitation = '本版本网站证据不支持应用图线索追踪'; log('! ' + summary.clueLimitation); }
      if (run.target.kind === 'electron') for (const [index, clue] of clues.entries()) {
        const traceInput = join(folder, `trace-${index}-input.json`);
        await writeFile(traceInput, '{"application":', { flag: 'wx', mode: 0o600 });
        await pipeline(createReadStream(analysis, { signal }), createWriteStream(traceInput, { flags: 'a' }), { signal });
        await writeFile(traceInput, ',"seed":' + JSON.stringify({ kind: 'string', value: clue, match: 'contains', case_sensitive: false }) + ',"direction":"both"}', { flag: 'a' });
        const result = await command(['trace-application-feature', traceInput], `trace-${index}.json`, `$ rea trace-application-feature  seed=string:${JSON.stringify(clue)}`);
        const traced = await summarizeEvidence(result, 'trace', { signal });
        summary.clues.push({ clue, hits: traced.hits, evidenceId: traced.evidenceId, locations: traced.locations });
        log(`✓ ${clue}：${traced.hits} 命中 ${traced.evidenceId}`);
      }
      if (before && (before !== await fingerprint(input, signal) || (await checkedPath(run.target.path)).identity !== identity)) throw reaError('target_changed', '目标在取证期间变化，摘要未采用');
      const latest = (await repository.read())?.reverseRecords?.find(r => r.id === recordId);
      if (!latest || latest.deletedAt || JSON.stringify(latest.material.target) !== JSON.stringify(run.target)) throw reaError('target_changed', '参照物在取证期间变化，摘要未采用');
      signal.throwIfAborted(); await rename(analysis, join(folder, 'analysis.json'));
      run.summary = summary; run.status = 'completed';
      log(`✓ 取证完成 ${summary.evidenceId}`);
      log(`! 覆盖限制 ${summary.limitations + (summary.unknowns || 0)}；完整性不匹配 ${summary.integrityMismatches}。静态观察不等于复刻验证。`);
      }
    } catch (error) {
      const e = signal.aborted ? signal.reason : error;
      run.status = e?.kind === 'stopped' ? 'stopped' : e?.kind === 'interrupted' ? 'interrupted' : 'failed';
      run.error = { kind: e?.kind || 'rea', code: String(e?.code || ''), message: safeLine(e?.message || 'REA 运行失败') };
      log('! ' + run.error.message);
    } finally {
      if(usageLine)log(usageLine);
      clearTimeout(timer); clearTimeout(flush); run.finishedAt = stamp();
      await pending;
      if (signal.aborted && run.status === 'completed') {
        delete run.summary; delete run.packVersionId; run.status = 'failed';
        run.error = { kind: signal.reason?.kind || 'disk', code: '', message: safeLine(signal.reason?.message || '持久化失败') };
      }
      try { await store(recordId, run,aiResult); persistenceError = null; } catch (error) { persistenceError = error; delete run.summary; delete run.packVersionId; run.status = 'failed'; run.error = { kind: 'disk', code: '', message: '最终状态写盘失败，结果未确认；保留原件并检查磁盘' }; }
      // An unpersisted result remains queryable in memory but prevents another run.
      if (!persistenceError) active = null;
      else if (active) active.persistenceError = true;
    }
  }
  return { start, query, check, status, precheck,
    async selectVersion({recordId,versionId,expectedRevision}){
      id(recordId);id(versionId);if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw reaError('input','切换版本需要当前revision');
      if(!(await repository.read())?.reverseRecords?.some(r=>r.id===recordId&&!r.deletedAt))throw reaError('input','参照物不存在');
      if(active||starting||externalBusy())throw Object.assign(reaError('busy','运行中不可切换任务包版本'),{status:409});
      return repository.updateReverse(records=>records.map(r=>{
        if(r.id!==recordId)return r;
        if(active||starting||externalBusy())throw Object.assign(reaError('busy','运行中不可切换任务包版本'),{status:409});
        const v=r.packVersions?.find(v=>v.id===versionId);
        if(r.deletedAt||!v||!packTargetMatches(v,r.material?.target))throw reaError('input','该版本不属于当前参照目标');
        return {...r,activePackVersionId:v.id};
      }),{expectedRevision});
    }, get busy() { return !!active || starting; },
    async stop({ recordId, runId }) {
      if (active?.recordId === recordId && active.run.id === runId) {
        active.controller.abort(reaError('stopped', '用户停止了取证')); await active.promise;
      }
      return query({ recordId, runId });
    },
    async close() { closed = true; if (starting) { startController.abort(reaError('interrupted', '服务关闭，启动中断')); await startSettled; } if (active) { active.controller.abort(reaError('interrupted', '服务关闭，取证已中断')); await active.promise; } },
  };
}
