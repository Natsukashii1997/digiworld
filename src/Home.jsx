import React from "react";
import {
  Layers, Bot, Folder, BookOpen, PenLine, Moon, GitBranch, ScanLine,
  Settings2, Inbox, Stethoscope, Handshake, CalendarDays, Newspaper,
  Bookmark, Gem,
} from "lucide-react";
import { HomeV16 } from "./HomeV16.jsx";

export const ICONS = {
  inbox: Inbox, assets: Layers, references: ScanLine, history: GitBranch,
  agents: Bot, projects: Folder, health: Stethoscope, collab: Handshake,
  calendar: CalendarDays, night: Moon, knowledge: BookOpen, notes: PenLine,
  aihot: Newspaper, learning: Bookmark, silver: Gem, settings: Settings2,
};

// Kept as a pure registry projection for existing consumers and compatibility tests.
// HomeV16 renders the approved four-screen dashboard instead of the old world map.
export function homeFacts(state, zoneLatest) {
  const c = state.connections || {};
  const live = state.assets.filter(a => !a.archived);
  const detected = (c.agents || []).filter(a => a.status === "detected");
  return {
    assets: live.length + " 份资产 · 含焚决 " + (state.scrolls || []).filter(s => !s.deletedAt).length + " 卷",
    references: state.references.length + " 条参考",
    history: (c.projects || []).length + " 个项目 · 只提交，不推送",
    agents: (c.agentScannedAt ? "已检测 " + detected.length + " 个" : "尚未检测") + " · 含能力体检",
    projects: c.projectScannedAt ? (c.projects || []).length + " 个项目" : "尚未扫描",
    health: "能力体检 · 已并入智能体群",
    collab: "看板 · 接力口令 · " + (state.collabLog || []).length + " 条本机复制记录",
    calendar: "本机日历与提醒事项 · 需授权",
    night: "计划草稿 · 未启用",
    knowledge: (c.knowledgeSources || []).length + " 个知识源 · " + (state.knowledgeTasks || []).length + " 个任务 · " +
      (zoneLatest ? "我的知识本周 +" + zoneLatest.zones.mine.changedThisWeek : "三区尚未统计"),
    notes: state.notes.length + " 条本机草稿",
    aihot: "精选 · 热点 · 日报 · 本机缓存",
    learning: "收藏画布 · 本机收录",
    silver: silverSummary(state.silver),
    settings: state.model?.provider ? "模型配置：" + state.model.provider + " · 凭据与连通性未核验" : "模型尚未配置 · 连接测试在设置中",
  };
}

function silverSummary(silver) {
  if (!silver) return "还没有收录";
  const live = list => list.filter(r => !r.deletedAt);
  const categories = live(silver.categories);
  const ids = new Set(categories.map(c => c.id));
  const target = categories.reduce((n, c) => n + c.target, 0);
  const filled = live(silver.items).filter(i => ids.has(i.categoryId)).length;
  return live(silver.wall).length + " 张欣赏图 · 已填 " + filled + "/" + target + " 格";
}

export function Home(props) {
  return <HomeV16 {...props} />;
}
