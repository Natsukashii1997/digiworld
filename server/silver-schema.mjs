// 路线 v3 5.5 银饰计划与 4.3 智能体角色卡的主库校验（产品定义 v1.2 §4.8、§4.3；基线 v2.2 D36、D28）。
// 两个都是可选的顶层集合：旧库缺失按空处理，不写迁移；多余字段一律拒绝。
// 银饰图片本身不进主库，只以内容寻址的文件名引用数据目录 silver/ 下的文件（见 silver.mjs）。
function invalid(message) {
  throw Object.assign(new Error(`数据校验失败：${message}`), { status: 400 });
}
const isObject = (v) =>
  v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Uint8Array);
const keys = (v, allowed) => {
  if (!isObject(v)) invalid("对象");
  if (Object.keys(v).some((k) => !allowed.includes(k))) invalid("包含不支持的字段");
};
const array = (v, label, max) => {
  if (!Array.isArray(v) || v.length > max) invalid(label);
};
const id = (v) => {
  if (typeof v !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(v)) invalid("记录 ID");
};
const date = (v) => {
  if (typeof v !== "string" || v.length > 40 || !Number.isFinite(Date.parse(v)))
    invalid("时间格式");
};
const optionalDate = (v) => {
  if (v !== undefined) date(v);
};
const unique = (list, label) => {
  if (new Set(list).size !== list.length) invalid(`${label}重复`);
};
// 除换行与制表符外的控制字符；单行字段连换行也不允许。
const CONTROL = /[\x00-\x08\x0b-\x1f\x7f]/;
const LINE_BREAK = /[\n\r\t]/;
const line = (v, label, max, required = false) => {
  if (typeof v !== "string" || v.length > max || CONTROL.test(v) || LINE_BREAK.test(v))
    invalid(label);
  if (required && !v.trim()) invalid(label);
};
const multiline = (v, label, max) => {
  if (typeof v !== "string" || v.length > max || CONTROL.test(v)) invalid(label);
};

export const SILVER_LIMITS = {
  wall: 2000,
  categories: 50,
  items: 5000,
  target: 999,
  name: 30,
  itemName: 60,
  author: 100,
  source: 200,
  url: 2000,
  note: 2000,
  price: 1e8,
  imageBytes: 8 * 1024 * 1024,
};
// 内容寻址文件名：sha256 + 扩展名。只接受这个形状，路径分隔符、上跳与大写都进不来。
export const SILVER_FILE = /^[a-f0-9]{64}\.(jpg|png|webp)$/;
const image = (v, label = "图片引用") => {
  if (typeof v !== "string" || !SILVER_FILE.test(v)) invalid(label);
};
const httpUrl = (v) => {
  line(v, "来源链接", SILVER_LIMITS.url, true);
  let url;
  try {
    url = new URL(v);
  } catch {
    invalid("来源链接");
  }
  if (!["http:", "https:"].includes(url.protocol)) invalid("来源链接协议");
};
const day = (v) => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) invalid("购入时间");
  const d = new Date(`${v}T00:00:00Z`);
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== v)
    invalid("购入时间");
};

export function validateSilver(silver) {
  keys(silver, ["wall", "categories", "items", "targets", "wishes"]);
  const { wall, categories, items } = silver;
  array(wall, "欣赏墙数量", SILVER_LIMITS.wall);
  array(categories, "收藏品类数量", SILVER_LIMITS.categories);
  array(items, "收藏数量", SILVER_LIMITS.items);
  unique(wall.map((w) => w?.id), "欣赏图 ID");
  unique(categories.map((c) => c?.id), "品类 ID");
  unique(items.map((i) => i?.id), "收藏 ID");
  for (const w of wall) {
    keys(w, ["id", "name", "image", "author", "source", "sourceUrl", "note", "createdAt", "updatedAt", "deletedAt"]);
    id(w.id);
    image(w.image);
    if(w.name!==undefined)line(w.name,"灵感名称",SILVER_LIMITS.itemName);
    line(w.author, "作者", SILVER_LIMITS.author);
    line(w.source, "来源", SILVER_LIMITS.source);
    if (w.sourceUrl !== undefined) httpUrl(w.sourceUrl);
    multiline(w.note, "备注", SILVER_LIMITS.note);
    date(w.createdAt);
    optionalDate(w.updatedAt);
    optionalDate(w.deletedAt);
  }
  const categoryIds = new Set();
  for (const c of categories) {
    keys(c, ["id", "name", "target", "createdAt", "updatedAt", "deletedAt"]);
    id(c.id);
    categoryIds.add(c.id);
    line(c.name, "品类名称", SILVER_LIMITS.name, true);
    if (!Number.isInteger(c.target) || c.target < 1 || c.target > SILVER_LIMITS.target)
      invalid("目标数量");
    date(c.createdAt);
    optionalDate(c.updatedAt);
    optionalDate(c.deletedAt);
  }
  for (const i of items) {
    keys(i, [
      "id",
      "categoryId",
      "categoryKey",
      "image",
      "silhouette",
      "silhouetteSource",
      "name",
      "boughtAt",
      "price",
      "note",
      "createdAt",
      "updatedAt",
      "deletedAt",
    ]);
    id(i.id);
    if((i.categoryId!==undefined)===(i.categoryKey!==undefined))invalid("收藏必须恰有一种品类归属");
    if(i.categoryId!==undefined){id(i.categoryId);if(!categoryIds.has(i.categoryId))invalid("收藏所属品类不存在");}
    else if(!SILVER_KEYS.includes(i.categoryKey))invalid("固定品类不存在");
    image(i.image);
    if (i.silhouette !== undefined) {
      image(i.silhouette, "剪影引用");
      if (!i.silhouette.endsWith(".png")) invalid("剪影必须是 PNG");
    }
    if (i.silhouetteSource !== undefined && !["auto", "manual"].includes(i.silhouetteSource))
      invalid("剪影来源");
    line(i.name, "收藏名称", SILVER_LIMITS.itemName, true);
    if (i.boughtAt !== undefined) day(i.boughtAt);
    if (i.price !== undefined) {
      if (
        typeof i.price !== "number" ||
        !Number.isFinite(i.price) ||
        i.price < 0 ||
        i.price > SILVER_LIMITS.price ||
        Math.round(i.price * 100) / 100 !== i.price
      )
        invalid("价格");
    }
    if (i.note !== undefined) multiline(i.note, "备注", SILVER_LIMITS.note);
    date(i.createdAt);
    optionalDate(i.updatedAt);
    optionalDate(i.deletedAt);
  }
  if(silver.targets!==undefined){keys(silver.targets,SILVER_KEYS);for(const v of Object.values(silver.targets))if(!Number.isInteger(v)||v<1||v>SILVER_LIMITS.target)invalid("固定品类目标数量");}
  if(silver.wishes!==undefined){
    array(silver.wishes,"心愿数量",2000);unique(silver.wishes.map(w=>w?.id),"心愿ID");
    const live=[],fulfilled=[];
    for(const w of silver.wishes){
      keys(w,["id","wallId","categoryKey","createdAt","updatedAt","deletedAt","fulfilledItemId","fulfilledAt"]);id(w.id);id(w.wallId);
      if(!wall.some(r=>r.id===w.wallId))invalid("心愿来源不存在");if(!SILVER_KEYS.includes(w.categoryKey))invalid("心愿品类不存在");
      date(w.createdAt);optionalDate(w.updatedAt);optionalDate(w.deletedAt);
      if(!w.deletedAt)live.push(w.wallId+":"+w.categoryKey);
      if((w.fulfilledItemId!==undefined)!==(w.fulfilledAt!==undefined))invalid("心愿实现信息必须成对");
      if(w.fulfilledItemId!==undefined){id(w.fulfilledItemId);date(w.fulfilledAt);const item=items.find(i=>i.id===w.fulfilledItemId);if(!item||silverItemKey(silver,item)!==w.categoryKey)invalid("心愿实现藏品归属不符");fulfilled.push(w.fulfilledItemId);}
    }unique(live,"活动心愿来源与品类");unique(fulfilled,"心愿实现藏品");
  }
}

export const SILVER_KEYS=["ring","necklace","bangle","pendant"];
const SILVER_NAMES=new Map([["戒指","ring"],["项链","necklace"],["手镯","bangle"],["吊坠","pendant"]]);
const silverItemKey=(s,i)=>i.categoryKey||SILVER_NAMES.get(s.categories.find(c=>c.id===i.categoryId)?.name);
export function validateSilverHistory(previous,next,{allowImport=false,equivalent}={}){
 if(!previous)return;next=next||{wall:[],categories:[],items:[]};
 const equal=equivalent||((a,b)=>JSON.stringify(a)===JSON.stringify(b)),oldWishes=previous.wishes||[],newWishes=next.wishes||[];
 for(const old of oldWishes){const newer=newWishes.find(w=>w.id===old.id);if(!newer)invalid("心愿必须软删保留历史");for(const k of ["id","wallId","categoryKey","createdAt"])if(old[k]!==newer[k])invalid("心愿身份不可改写");if(old.fulfilledItemId&&(old.fulfilledItemId!==newer.fulfilledItemId||old.fulfilledAt!==newer.fulfilledAt))invalid("已实现心愿关联不可改写");}
 for(const w of newWishes){const old=oldWishes.find(v=>v.id===w.id);if(!old&&!allowImport&&next.wall.find(v=>v.id===w.wallId)?.deletedAt)invalid("新心愿来源已回收");if(w.fulfilledItemId&&!old?.fulfilledItemId&&!allowImport){const item=next.items.find(v=>v.id===w.fulfilledItemId);if(previous.items.some(v=>v.id===w.fulfilledItemId)||item?.deletedAt||w.deletedAt)invalid("实现心愿必须原子收录新活动藏品");}}
 const readonly=new Set(previous.categories.filter(c=>!SILVER_NAMES.has(c.name)).map(c=>c.id));
 for(const old of previous.categories.filter(c=>readonly.has(c.id)))if(!equal(old,next.categories.find(c=>c.id===old.id)))invalid("其他旧品类只读");
 for(const old of previous.items){const newer=next.items.find(i=>i.id===old.id);if(readonly.has(old.categoryId)&&!equal(old,newer))invalid("其他旧品类藏品只读");if(newer&&(old.categoryId!==newer.categoryId||old.categoryKey!==newer.categoryKey))invalid("藏品归属不可改写");}
 if(!allowImport&&next.items.some(i=>readonly.has(i.categoryId)&&!previous.items.some(v=>v.id===i.id)))invalid("其他旧品类不能新增藏品");
}

// 智能体角色卡：只为主力（Codex、Claude Code、Hermes）与附属（OpenClaw、豆包工作）建卡（D26、D28）。
// 只保存用户编辑过的卡；未编辑的卡由前端显示草拟默认值。
export const ROLE_AGENT_IDS = ["codex", "claude-code", "hermes", "openclaw", "doubao"];
export const ROLE_COSTS = ["low", "medium", "high", "unknown"];
export const ROLE_LIMITS = { strengths: 30, strength: 20, projects: 20, project: 100, note: 1000 };
export function validateAgentRoles(roles) {
  array(roles, "角色卡数量", ROLE_AGENT_IDS.length);
  unique(roles.map((r) => r?.agentId), "角色卡");
  for (const r of roles) {
    keys(r, ["agentId", "strengths", "cost", "projects", "note", "updatedAt"]);
    if (!ROLE_AGENT_IDS.includes(r.agentId)) invalid("角色卡 Agent");
    array(r.strengths, "擅长关键词", ROLE_LIMITS.strengths);
    for (const s of r.strengths)
      if (
        typeof s !== "string" ||
        !s ||
        s.length > ROLE_LIMITS.strength ||
        /[\s,，、;；\x00-\x1f\x7f]/.test(s)
      )
        invalid("擅长关键词");
    unique(r.strengths, "擅长关键词");
    if (!ROLE_COSTS.includes(r.cost)) invalid("成本");
    array(r.projects, "常驻项目", ROLE_LIMITS.projects);
    for (const p of r.projects) line(p, "常驻项目", ROLE_LIMITS.project, true);
    unique(r.projects, "常驻项目");
    multiline(r.note, "角色卡备注", ROLE_LIMITS.note);
    date(r.updatedAt);
  }
}
