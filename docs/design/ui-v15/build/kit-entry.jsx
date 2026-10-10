// UI v15 视觉稿素材：服务端渲染项目真实组件（像素精灵、封面、页头、暴龙机、徽章环、角色像素），不手画。
import React from "react";
import { renderToStaticMarkup as R } from "react-dom/server";
import { Assets } from "../../../../src/Assets.jsx";
import { Home } from "../../../../src/Home.jsx";
import { PageHeading, Cover, TypeIcon, Maturity } from "../../../../src/components.jsx";
import { Pixel, SPRITES, DigiviceArt, CrestRing, StageBar } from "../../../../src/pixel.jsx";
import { LcdText, AgentSprite, Corners } from "../../../../src/v14.jsx";
import { AGENT_CAST } from "../../../../src/characters.js";
import { seed } from "../../../../src/store.js";
import * as L from "lucide-react";
const h = React.createElement;
const noop = () => {};
const common = { save: noop, adoptState: noop, notify: noop, openCreate: noop, select: noop, onFilter: noop, onSelect: noop, onClose: noop, onEdit: noop, navigate: noop, openScroll: noop };
const safe = (f) => { try { return f(); } catch (e) { return `<!-- 渲染失败：${String(e.message).replace(/--/g, "")} -->`; } };
export function kit() {
  const state = seed();
  const out = { headings: {}, covers: {}, sprites: {}, agents: {}, stages: [], lcd: {}, icons: {} };
  out.assetsPage = safe(() => R(h(Assets, { ...common, state })));
  out.homePage = safe(() => R(h(Home, { ...common, state, ruleInstalls: [], projectStatus: {}, agentContents: {}, healthAudit: null, nightReports: null, vaultReceipts: null })));
  for (const id of ["home", "inbox", "assets", "references", "agents", "projects", "collab", "knowledge", "calendar", "notes", "aihot", "settings", "history"])
    out.headings[id] = safe(() => R(h(PageHeading, { page: id })));
  for (const type of ["Skill", "Prompt", "Workflow", "Rule", "Scroll"])
    for (const uses of [0, 3, 12]) out.covers[`${type}-${uses}`] = safe(() => R(h(Cover, { type, serial: uses + 1, version: 2, uses })));
  out.coverLarge = safe(() => R(h(Cover, { type: "Skill", serial: 1, version: 3, uses: 12, large: true, stage: 2 })));
  for (const key of Object.keys(SPRITES)) for (const size of [32, 64, 120]) out.sprites[`${key}-${size}`] = safe(() => R(h(Pixel, { sprite: key, size })));
  out.digivice = safe(() => R(h(DigiviceArt, { size: 240 }, h(Pixel, { sprite: "egg", size: 56 }))));
  out.crest = safe(() => R(h(CrestRing)));
  for (const a of AGENT_CAST) for (const mode of ["head", "dossier", "full"]) out.agents[`${a.id}-${mode}`] = safe(() => R(h(AgentSprite, { agent: a.id, mode })));
  for (let s = 0; s < 5; s++) out.stages.push(safe(() => R(h(StageBar, { stage: s }))));
  for (const t of ["SKILL", "PLUGIN", "BROKEN", "UNREAD", "INBOX", "TODAY", "0", "3", "12", "42", "ZONE MONITOR", "SLOT 01"]) out.lcd[t] = safe(() => R(h(LcdText, { text: t, px: 3 })));
  for (const type of ["Skill", "Prompt", "Workflow", "Rule", "Scroll"]) out.icons[type] = safe(() => R(h(TypeIcon, { type, size: 14 })));
  out.maturity = { ready: R(h(Maturity, { level: "ready" })), partial: R(h(Maturity, { level: "partial" })) };
  out.corners = R(h(Corners));
  return out;
}

// 按需渲染：视觉稿里的每个点阵数字、像素图、封面都由真实组件生成。
export const r = {
  lcd: (text, px = 3, cls = "") => R(h(LcdText, { text: String(text), px, className: cls })),
  pixel: (sprite, size = 48, extra = {}) => R(h(Pixel, { sprite, size, ...extra })),
  cover: (props) => R(h(Cover, props)),
  agent: (id, mode = "head", className = "") => R(h(AgentSprite, { agent: id, mode, className })),
  stage: (n) => R(h(StageBar, { stage: n })),
  icon: (type, size = 14) => R(h(TypeIcon, { type, size })),
  maturity: (level) => R(h(Maturity, { level })),
  heading: (page, over = {}) => R(h(PageHeading, { page, ...over })),
  digivice: (sprite = "egg", size = 240, inner = 56) => R(h(DigiviceArt, { size }, h(Pixel, { sprite, size: inner }))),
  digiviceAgent: (id, size = 200) => R(h(DigiviceArt, { size }, h(AgentSprite, { agent: id, mode: "head" }))),
  digiviceLcd: (text, size = 200) => R(h(DigiviceArt, { size }, h(LcdText, { text, px: 5 }))),
  crest: () => R(h(CrestRing)),
  corners: () => R(h(Corners)),
  assets: () => R(h(Assets, { ...common, state: seed() })),
  spriteKeys: () => Object.keys(SPRITES),
  ic: (name, size = 16) => (L[name] ? R(h(L[name], { size, strokeWidth: 1.8 })) : `<!-- 无图标 ${name} -->`),
};
