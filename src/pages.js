// 用户确认的七板块注册表；导航、页头和搜索共用此顺序。
export const MATURITY = {ready: "可用", partial: "部分可用", draft: "草稿", planned: "规划中"};
export const PAGES = [
  {
    "id": "home",
    "group": "今日",
    "code": "00",
    "label": "世界总览",
    "title": "世界总览",
    "eyebrow": "TODAY · BASE",
    "maturity": "ready",
    "lead": "资产、收藏与随手记录，常用内容从这里进入。"
  },
  {
    "id": "assets",
    "group": "资产",
    "code": "01",
    "label": "资产仓库",
    "title": "资产仓库",
    "eyebrow": "ASSET LIBRARY",
    "maturity": "ready",
    "lead": "Skill、Prompt、工作流、规则模板与焚决在这里收录与迭代，复制后交给任意 Agent，规则还能装进项目。",
    "stage": "收集 · 迭代 · 交付"
  },
  {
    "id": "learning",
    "group": "资产",
    "code": "11",
    "label": "个人收藏",
    "title": "个人收藏",
    "eyebrow": "COLLECTION",
    "maturity": "partial",
    "lead": "把刷到的好帖子摊在桌上，随手分组。",
    "stage": "收录 · 整理"
  },
  {
    "id": "references",
    "group": "资产",
    "code": "02",
    "label": "逆向工程",
    "title": "逆向工程",
    "eyebrow": "REVERSE ENGINEERING",
    "maturity": "ready",
    "lead": "投入一件好东西，拿到能直接交给 AI 复刻的任务包。",
    "stage": "投入 · 取证 · 复刻任务包"
  },
  {
    "id": "projects",
    "group": "目标",
    "code": "04",
    "label": "项目空间",
    "title": "项目空间",
    "eyebrow": "PROJECTS",
    "maturity": "ready",
    "lead": "挑一个存档接着干，或从库里开新档。",
    "stage": "识别 · 对齐 · 交接"
  },
  {
    "id": "notes",
    "group": "生活",
    "code": "09",
    "label": "随手记",
    "title": "随手记",
    "eyebrow": "QUICK NOTES",
    "maturity": "ready",
    "lead": "先把念头记下来；值得反复用的，炼入焚决。",
    "stage": "捕捉"
  },
  {
    "id": "settings",
    "group": "系统",
    "code": "13",
    "label": "设置",
    "title": "设置",
    "eyebrow": "SETTINGS",
    "maturity": "partial",
    "lead": "所有设置与授权都在这里；开启前先预览。",
    "stage": "数据 · 模型"
  }
];
export const page = id => PAGES.find(p => p.id === id);
export const GROUPS = ["今日", "资产", "目标", "生活", "系统"];
export const ZONES = [
 {id:"today",label:"今日",groups:["今日"]},
 {id:"work",label:"工作区",en:"WORK",groups:["资产","目标"]},
 {id:"life",label:"生活区",en:"LIFE",groups:["生活"]},
 {id:"system",label:"系统",en:"SYSTEM",groups:["系统"]},
];
// 焚决仍属于资产仓库；撤下的独立页面与未知地址一律回世界总览。
export function resolveRoute(id) {
 if (id === "scrolls") return {route:"assets",anchor:null,filter:"Scroll"};
 return {route:page(id)?.id || "home",anchor:null};
}
export const LAYERS = [
 {id:"资产",zone:"work",en:"ASSETS",question:"我有什么",pages:["assets","learning","references"]},
 {id:"目标",zone:"work",en:"TARGETS",question:"在哪里继续",pages:["projects"]},
 {id:"生活",zone:"life",en:"LIFE",question:"随手记录",pages:["notes"]},
];
