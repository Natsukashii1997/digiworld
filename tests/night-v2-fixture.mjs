// W6/N1 browser fixture. The workspace and every discovery source are synthetic.
import assert from "node:assert/strict";
import { fixture } from "./fixture.mjs";
import { seed } from "../src/store.js";

export async function nightV2Fixture({ prepareState, nightV2 = {} } = {}) {
  const forbidden = [];
  const deny = async (name) => {
    forbidden.push(name);
    throw new Error(`N1 synthetic fixture denied ${name}`);
  };
  const app = await fixture({
    nightV2,
    discovery: {
      defaultRoots: () => [],
      scanLocalProjects: async () => ({
        items: [], errors: [], truncated: false, at: new Date().toISOString(),
      }),
      scanGitHub: async () => ({
        items: [], status: "not_connected", login: "", message: "",
        truncated: false, at: new Date().toISOString(),
      }),
      detectAgents: async () => ({ items: [], at: new Date().toISOString() }),
      calendarHelper: { platform: "linux", run: () => deny("calendar") },
      learningMetadataReader: () => deny("learningMetadataReader"),
      knowledgeFiles: {
        inspectRoot: () => deny("knowledgeFiles.inspectRoot"),
        scan: () => deny("knowledgeFiles.scan"),
        read: () => deny("knowledgeFiles.read"),
        current: () => deny("knowledgeFiles.current"),
      },
      knowledgeTrends: { journal: { list: async () => [] } },
      projectActivity: {
        resolveRoot: () => deny("projectActivity.resolveRoot"),
        runGit: () => deny("projectActivity.runGit"),
      },
      storageStatus: { platform: "linux", runOpen: () => deny("storageStatus.runOpen") },
      aihotFetch: () => deny("aihotFetch"),
      night: {
        inspectTask: () => deny("night.inspectTask"),
        runProcess: () => deny("night.runProcess"),
        keychain: {
          get: () => deny("night.keychain.get"),
          put: () => deny("night.keychain.put"),
          remove: () => deny("night.keychain.remove"),
        },
        proxyFactory: () => deny("night.proxyFactory"),
      },
    },
  });
  assert.notEqual(new URL(app.url).port, "5178", "N1 fixture cannot use the live service");
  const initial = seed();
  initial.assets = [];
  initial.notes = [{
    id: "demo-note", text: "合成随手记主题：复盘夜间刹车条件",
    at: "2026-10-06T10:00:00.000Z",
  }];
  initial.projects = [{
    id: "demo-project", name: "合成项目空间", goal: "检验夜巡页面",
    next: "完成合成验收", location: "隔离测试", status: "进行中",
    updatedAt: "2026-10-06T10:00:00.000Z",
  }];
  initial.learning = { folders: [], books: [], links: [{
    id: "demo-aihot", title: "合成 AI HOT 主题：Agent loop",
    url: "https://example.com/synthetic-aihot", summary: "合成摘要",
    source: "合成 AI HOT", origin: "aihot", status: "want",
    createdAt: "2026-10-06T10:00:00.000Z",
  }] };
  const state = prepareState ? prepareState(initial) : initial;
  await app.repository.write({ ...state, connections: undefined }, { initialize: true });
  return { ...app, forbidden };
}
