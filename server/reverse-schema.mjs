import {
  validateRecipe,
  validateMedia,
  RECIPE_TYPES,
  RECIPE_AGENTS,
  confirmReplica,
  validateReplicaDraft,
  currentVerification,
} from "../src/reverse-recipe.js";
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
  keys(v, ["threshold"]);
  if (!Number.isInteger(v.threshold) || v.threshold < 1 || v.threshold > 100)
    fail("复刻达标线需为1–100整数");
}
export function validateRecipeRecord(r) {
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
      keys(a.specimenSnapshot.material, ["text", "url"]);
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
export function validateReverseHistory(previous, next) {
  if (!previous) return; // 显式首次初始化只核历史自身；普通保存才核新增确认当前绑定。
  const lookup = new Map((next.reverseRecords || []).map((r) => [r.id, r]));
  for (const n of next.reverseRecords || []) {
    const prior = previous?.reverseRecords?.find((r) => r.id === n.id);
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
    if (r.forge && !same(r.forge, n.forge)) fail("炼成固定版本指针不可改写");
  }
}
export function validateForgeReferences(state) {
  for (const r of state.reverseRecords || []) {
    if (!r.forge) continue;
    const a = state.assets.find((a) => a.id === r.forge.assetId);
    if (
      a?.type !== "Skill" ||
      !a.versions.some((v) => v.id === r.forge.versionId)
    )
      fail("炼成Skill固定版本不存在");
  }
}
