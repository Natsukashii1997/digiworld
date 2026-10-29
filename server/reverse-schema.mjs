import {createHash} from 'node:crypto';
import {EXECUTORS,validateAiResult} from '../src/reverse-ai.js';
import {
  validateRecipe,
  validateReverseTarget,
  validateMedia,
  RECIPE_TYPES,
  RECIPE_AGENTS,
  confirmReplica,
  validateReplicaDraft,
  currentVerification,
} from "../src/reverse-recipe.js";
import {SLOT_IDS,HATCH_LIMITS} from '../src/reverse-hatch.js';
const fail = (message) => {
  throw Object.assign(new Error("数据校验失败：" + message), { status: 400 });
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const keys = (o, allowed) => {
  if (
    !o ||
    typeof o !== "object" ||
    Array.isArray(o) ||
    Object.keys(o).some((k) => !allowed.includes(k))
  )
    fail("逆向字段无效");
};
const list = (v, max, label) => {
  if (!Array.isArray(v) || v.length > max) fail(label);
};
const text = (v, max, label) => {
  if (
    typeof v !== "string" ||
    v.length > max ||
    /[\x00-\x08\x0b-\x1f\x7f]/.test(v)
  )
    fail(label);
};
const id = (v) => {
  if (typeof v !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(v))
    fail("逆向ID无效");
};
const date = (v) => {
  if (typeof v !== "string" || v.length > 40 || !Number.isFinite(Date.parse(v)))
    fail("逆向时间无效");
};
const mediaList = (v) => {
  list(v, 32, "逆向图片数量无效");
  v.forEach(validateMedia);
  if (new Set(v.map((m) => m.path)).size !== v.length) fail("逆向图片重复");
};
export function validateReverseSettings(v) {
  keys(v, ["threshold","executor"]);
  if(v.executor!==undefined&&!EXECUTORS.includes(v.executor))fail("执行器无效");
  if (!Number.isInteger(v.threshold) || v.threshold < 1 || v.threshold > 100)
    fail("复刻达标线需为1–100整数");
}
export function validateRecipeRecord(r) {
  if (r.material?.target !== undefined) validateReverseTarget(r.material.target, r.type);
  if (!RECIPE_TYPES.includes(r.type)) fail("逆向类型无效");
  mediaList(r.referenceMedia === undefined ? [] : r.referenceMedia);
  if (r.recipe !== undefined) {
    validateRecipe(r.recipe);
    if (r.recipe.type !== r.type) fail("配方类型不一致");
  }
  if (r.recipeReply !== undefined)
    text(r.recipeReply, 200000, "配方回复过长或无效");
  if (r.replicaDraft !== undefined) validateReplicaDraft(r, r.replicaDraft);
  if (r.replicas !== undefined) {
    list(r.replicas, 2000, "复刻次数超限");
    const ids = new Set();
    for (const a of r.replicas) {
      keys(a, [
        "id",
        "at",
        "agentId",
        "artifact",
        "scores",
        "checks",
        "threshold",
        "note",
        "recipeSnapshot",
        "specimenSnapshot",
        "total",
        "conclusion",
        "confirmedAt",
      ]);
      id(a.id);
      date(a.at);
      date(a.confirmedAt);
      if (ids.has(a.id)) fail("复刻ID重复");
      ids.add(a.id);
      validateRecipe(a.recipeSnapshot);
      keys(a.specimenSnapshot, ["type", "material", "referenceMedia"]);
      if (a.specimenSnapshot.type !== r.type) fail("原件快照类型不符");
      keys(a.specimenSnapshot.material, ["text", "url", "target"]);
      if (a.specimenSnapshot.material.target !== undefined) validateReverseTarget(a.specimenSnapshot.material.target, r.type);
      text(a.specimenSnapshot.material.text, 50000, "原件快照正文");
      text(a.specimenSnapshot.material.url, 2000, "原件快照链接");
      mediaList(a.specimenSnapshot.referenceMedia);
      const {
        recipeSnapshot,
        specimenSnapshot,
        total,
        conclusion,
        confirmedAt,
        ...input
      } = a;
      const reconstructed = confirmReplica(
        { ...r, ...specimenSnapshot, recipe: recipeSnapshot, replicas: [] },
        { ...input, recipeSnapshot, specimenSnapshot },
      ).replicas[0];
      if (
        total !== reconstructed.total ||
        conclusion !== reconstructed.conclusion
      )
        fail("复刻总分或结论与事实不一致");
    }
  }
  if (r.variations !== undefined) {
    list(r.variations, 100, "变体次数超限");
    const ids = new Set();
    for (const v of r.variations) {
      keys(v, ["id", "title", "at", "agentId", "text", "html", "media"]);
      id(v.id);
      if (ids.has(v.id)) fail("变体ID重复");
      ids.add(v.id);
      date(v.at);
      text(v.title, 120, "变体标题");
      text(v.text, 50000, "变体正文");
      text(v.html, 100000, "变体HTML");
      mediaList(v.media);
      if (
        !RECIPE_AGENTS.includes(v.agentId) ||
        (!v.text.trim() && !v.html.trim() && !v.media.length)
      )
        fail("变体产物或伙伴无效");
    }
  }
  if (r.reaRuns !== undefined) {
    list(r.reaRuns, 8, "REA运行数量无效");
    const seen = new Set();
    for (const run of r.reaRuns) {
      keys(run, ["id", "status", "startedAt", "finishedAt", "version", "target", "log", "sequence", "truncated", "summary", "error", "executor", "packVersionId"]);
      if(run.executor!==undefined&&!EXECUTORS.includes(run.executor))fail("执行器无效");
      if(run.packVersionId!==undefined)id(run.packVersionId);
      id(run.id); if (seen.has(run.id)) fail("REA运行ID重复"); seen.add(run.id);
      date(run.startedAt); if (run.finishedAt) date(run.finishedAt);
      if (!['running','completed','failed','stopped','interrupted'].includes(run.status) || !/^\d+\.\d+\.\d+$/.test(run.version)) fail("REA运行状态或版本无效");
      validateReverseTarget(run.target, r.type);
      list(run.log, 2000, "REA日志过多");
      if (!Number.isSafeInteger(run.sequence) || run.sequence < 0 || typeof run.truncated !== 'boolean' || Buffer.byteLength(JSON.stringify(run.log)) > 200*1024) fail("REA日志无效或过大");
      let seq = 0;
      for (const line of run.log) { keys(line, ['seq','text','detail']); if (!Number.isSafeInteger(line.seq) || line.seq <= seq || line.seq > run.sequence) fail("REA日志序号无效"); seq = line.seq; text(line.text, 2000, "REA日志文本"); if (line.detail !== undefined) text(line.detail, 16384, "REA命令详情"); }
      if (run.error) { keys(run.error, ['kind','code','message']); text(run.error.kind, 100, 'REA错误类别'); text(run.error.code, 100, 'REA错误代码'); text(run.error.message, 2000, 'REA错误'); }
      if (run.summary) {
        keys(run.summary, ['kind','limitations','integrityMismatches','clues','evidenceId','sha256','modules','parsedJavaScriptFiles','ipcChannels','nativeBindings','scriptsObserved','scriptsAnalyzed','coverage','unknowns','clueLimitation']);
        if (run.status !== 'completed' || !/^ev_[a-f0-9]{64}$/.test(run.summary.evidenceId || '') || Buffer.byteLength(JSON.stringify(run.summary)) > 30000) fail("REA摘要无效");
        const summary = run.summary;
        if (summary.kind !== run.target.kind) fail('REA摘要种类不一致');
        for (const key of ['limitations','integrityMismatches',...(summary.kind === 'electron' ? ['modules','ipcChannels','nativeBindings'] : ['scriptsObserved','scriptsAnalyzed'])]) if (!Number.isSafeInteger(summary[key]) || summary[key] < 0) fail('REA摘要统计无效');
        if (summary.kind === 'electron' && !/^[a-f0-9]{64}$/.test(summary.sha256 || '')) fail('REA摘要SHA无效');
        if (summary.coverage !== undefined && !['complete','partial'].includes(summary.coverage)) fail('REA覆盖状态无效');
        if (summary.parsedJavaScriptFiles !== undefined && (!Number.isSafeInteger(summary.parsedJavaScriptFiles) || summary.parsedJavaScriptFiles < 0)) fail('REA JS文件统计无效');
        if (summary.unknowns !== undefined && (!Number.isSafeInteger(summary.unknowns) || summary.unknowns < 0)) fail('REA未知项统计无效');
        if (summary.clueLimitation !== undefined) text(summary.clueLimitation, 500, 'REA线索限制');
        list(summary.clues, 8, 'REA线索数量无效');
        for (const clue of summary.clues) {
          keys(clue, ['clue','hits','evidenceId','locations']); text(clue.clue, 80, 'REA线索');
          if (!Number.isSafeInteger(clue.hits) || clue.hits < 0 || !/^ev_[a-f0-9]{64}$/.test(clue.evidenceId || '')) fail('REA线索统计或证据无效');
          list(clue.locations, 5, 'REA线索位置'); clue.locations.forEach(v=>text(v, 500, 'REA线索位置'));
        }
      }
      if(run.executor&&run.executor!=='rea'&&run.summary)fail('AI运行不可冒充REA摘要');
      if(run.status==='completed'&&run.executor&&run.executor!=='rea'&&!run.packVersionId)fail('AI完成缺少包版本');
      if (run.status === 'completed' && (!run.executor||run.executor==='rea') && !run.summary) fail("REA完成缺少摘要");
    }
  }
  if(r.packVersions!==undefined){
    list(r.packVersions,8,'任务包版本过多');const seen=new Set();
    for(const v of r.packVersions){
      keys(v,['id','at','executor','target','result','packHash','rea','nativeSource']);id(v.id);date(v.at);if(seen.has(v.id))fail('任务包版本重复');seen.add(v.id);
      if(v.nativeSource!==undefined){
        if(v.executor!=='codex')fail('原生来源只适用于Codex');
        keys(v.nativeSource,['sessionId','threadId','turnId','itemId']);
        for(const key of ['sessionId','threadId','turnId','itemId'])text(v.nativeSource[key],200,'原生来源编号');
      }
      if(!EXECUTORS.includes(v.executor))fail('任务包执行器无效');
      if(v.executor==='rea'){keys(v.rea,['version','summary']);validateRecipeRecord({type:r.type,reaRuns:[{id:v.id,status:'completed',startedAt:v.at,finishedAt:v.at,target:v.target,version:v.rea.version,summary:v.rea.summary,log:[],sequence:0,truncated:false}]});}else if(v.rea!==undefined)fail('AI任务包不可冒充REA摘要');validateReverseTarget(v.target,r.type);validateAiResult(v.result);
      if(Buffer.byteLength(JSON.stringify(v.result))>450000||createHash('sha256').update(v.result.pack).digest('hex')!==v.packHash)fail('任务包摘要不一致');
    }
  }
  for(const run of r.reaRuns||[])if(run.status==='completed'&&run.executor&&run.executor!=='rea'){const v=r.packVersions?.find(v=>v.id===run.packVersionId);if(!v||v.id!==run.id||v.executor!==run.executor||!same(v.target,run.target))fail('AI成功运行与任务包不一致');}
  for(const p of r.packSkills||[]){const v=r.packVersions?.find(v=>v.id===p.packVersionId);if(v&&v.packHash!==p.packHash)fail('Skill回执与任务包不一致');}
  if(r.activePackVersionId!==undefined){id(r.activePackVersionId);if(!r.packVersions?.some(v=>v.id===r.activePackVersionId))fail('选中任务包版本不存在');}
  if(r.packSkills!==undefined){list(r.packSkills,2000,'固定Skill数量超限');const seen=new Set();for(const p of r.packSkills){keys(p,['packVersionId','assetId','versionId','at','packHash']);id(p.packVersionId);id(p.assetId);id(p.versionId);date(p.at);if(!/^[a-f0-9]{64}$/.test(p.packHash)||seen.has(p.packVersionId))fail('固定Skill回执无效');seen.add(p.packVersionId);}}
  if (r.savedSkill !== undefined) {
    keys(r.savedSkill,['assetId','versionId','at','packHash']); id(r.savedSkill.assetId); id(r.savedSkill.versionId); date(r.savedSkill.at);
    if (!/^[a-f0-9]{64}$/.test(r.savedSkill.packHash)) fail('任务包固定摘要无效');
  }
  if (r.forge !== undefined) {
    keys(r.forge, ["assetId", "versionId", "at", "replicaId"]);
    id(r.forge.assetId);
    id(r.forge.versionId);
    id(r.forge.replicaId);
    date(r.forge.at);
    if (currentVerification(r)?.id !== r.forge.replicaId)
      fail("炼成缺少达标复刻");
  }
}
// 孵蛋 3C：八格与每轮（hatch）、孵化回执（hatchSkills）。旧记录没有这两个字段时按空处理。
export function validateHatch(r) {
  if (r.hatch !== undefined) {
    const h = r.hatch;
    keys(h, ['version','slots','rounds']); if (h.version !== 1) fail('八格版本无效');
    keys(h.slots, SLOT_IDS); if (SLOT_IDS.some((k) => !h.slots[k])) fail('八格不完整');
    for (const k of SLOT_IDS) {
      const s = h.slots[k]; keys(s, ['known','miss','edited','at']);
      text(s.known, HATCH_LIMITS.text, '格子已知过长或含控制字符'); text(s.miss, HATCH_LIMITS.text, '格子缺过长或含控制字符'); date(s.at);
      if (s.edited !== undefined && s.edited !== true) fail('格子手改标记无效');
    }
    list(h.rounds, HATCH_LIMITS.rounds, '轮次过多');
    h.rounds.forEach((x, i) => {
      keys(x, ['n','at','by','asked','status','backAt','packHash']);
      if (x.n !== i + 1) fail('轮次序号不连续'); date(x.at);
      if (!['codex','claude'].includes(x.by)) fail('轮次执行者无效');
      list(x.asked, SLOT_IDS.length, '轮次格子无效');
      if (x.asked.some((k) => !SLOT_IDS.includes(k)) || new Set(x.asked).size !== x.asked.length) fail('轮次格子无效');
      if (!/^[a-f0-9]{64}$/.test(x.packHash || '')) fail('轮次追问包摘要无效');
      if (x.status === 'back') date(x.backAt); else if (x.status !== 'sent' || x.backAt !== undefined) fail('轮次状态无效');
    });
  }
  if (r.hatchSkills !== undefined) {
    list(r.hatchSkills, 2000, '孵化回执数量超限');
    for (const p of r.hatchSkills) { keys(p, ['assetId','versionId','at','slotsHash']); id(p.assetId); id(p.versionId); date(p.at); if (!/^[a-f0-9]{64}$/.test(p.slotsHash || '')) fail('孵化回执无效'); }
  }
}
// 轮次只追加；既有轮次唯一可变的是 sent → back 并补 backAt。
function sameRound(old, next) {
  if (same(old, next)) return true;
  const { status, backAt, ...rest } = next || {}, { status: was, ...base } = old;
  return was === 'sent' && old.backAt === undefined && status === 'back' && same(base, rest);
}
export function validateReverseHistory(previous, next, { allowReverseService = false, allowReverseImport = false, allowReverseSkill = false } = {}) {
  if (!previous) return; // 显式首次初始化只核历史自身；普通保存才核新增确认当前绑定。
  const lookup = new Map((next.reverseRecords || []).map((r) => [r.id, r]));
  for (const n of next.reverseRecords || []) {
    const prior = previous?.reverseRecords?.find((r) => r.id === n.id);
    if (!allowReverseService && !(allowReverseImport && !prior) && !same(prior?.reaRuns || [], n.reaRuns || [])) fail("REA运行只能由本机运行器写入");
    if (!allowReverseSkill && !(allowReverseImport && !prior) && !same(prior?.savedSkill, n.savedSkill)) fail('存Skill只能通过预览确认操作');
    if(!(allowReverseImport&&!prior)){
      if(!allowReverseService&&(!same(prior?.packVersions||[],n.packVersions||[])||prior?.activePackVersionId!==n.activePackVersionId))fail('任务包版本只能通过运行器或版本选择操作写入');
      if(!allowReverseSkill&&!same(prior?.packSkills||[],n.packSkills||[]))fail('固定Skill只能通过预览确认写入');
      for(const old of prior?.packVersions||[]){const kept=n.packVersions?.find(v=>v.id===old.id);if(kept&&!same(old,kept))fail('既有任务包不可改写');}
      for(const old of prior?.packSkills||[])if(!same(old,n.packSkills?.find(p=>p.packVersionId===old.packVersionId)))fail('固定Skill回执不可改写或删除');
      if(!allowReverseSkill&&!same(prior?.hatchSkills||[],n.hatchSkills||[]))fail('孵化回执只能通过孵化确认写入');
      (prior?.hatchSkills||[]).forEach((old,i)=>{if(!same(old,n.hatchSkills?.[i]))fail('孵化回执不可改写或删除');});
      const oldRounds=prior?.hatch?.rounds||[],newRounds=n.hatch?.rounds||[];
      if(newRounds.length<oldRounds.length||oldRounds.some((old,i)=>!sameRound(old,newRounds[i])))fail('轮次只能追加');
    }
    for (const a of n.replicas || [])
      if (!(prior?.replicas || []).some((old) => old.id === a.id)) {
        const { total, conclusion, confirmedAt, ...input } = a;
        const checked = confirmReplica({ ...n, replicas: [] }, input)
          .replicas[0];
        if (checked.total !== total || checked.conclusion !== conclusion)
          fail("新确认必须绑定当前配方与原件");
      }
  }
  for (const r of previous?.reverseRecords || []) {
    const n = lookup.get(r.id);
    if (!n) fail("逆向记录只能软删除");
    if (n.type !== r.type) fail("已投入参照类型不可改写");
    if (!r.type) continue;
    for (const a of r.replicas || [])
      if (
        !same(
          a,
          n.replicas?.find((v) => v.id === a.id),
        )
      )
        fail("已确认复刻不可改写或删除");
    if (r.savedSkill && !same(r.savedSkill,n.savedSkill)) fail('已存Skill固定版本指针不可改写');
    if (r.forge && !same(r.forge, n.forge)) fail("炼成固定版本指针不可改写");
  }
}
export function validateForgeReferences(state) {
  for (const r of state.reverseRecords || []) {
    for (const pointer of [r.forge,r.savedSkill,...(r.packSkills||[])].filter(Boolean)) {
    const a = state.assets.find((a) => a.id === pointer.assetId);
    if (
      a?.type !== "Skill" ||
      !a.versions.some((v) => v.id === pointer.versionId)
    )
      fail("逆向Skill固定版本不存在");
    }
  }
}
