import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createRelaySessions,
  parseRelayJsonl,
} from "../server/relay-sessions.mjs";
import { buildRelayPrompt, filterRelayText } from "../src/relay-prompt.js";
import { macOnly, PLUTIL } from "./mac-only.mjs";
const AT = "2026-10-05T04:12:00.000Z",
  PAGE = "fixture-page-00000001";
test('内容搜索通过真实读取链找到早期正文、用户尾部与助手回复；只返回命中摘录', () => fixture(async home => {
  await writeSession(home, 'claude-code', 'search.jsonl', jsonl([
    c('s1', null, 'user', '普通开场'),
    c('s2', 's1', 'assistant', '海棠验收口径：以正式表格为准'),
    c('s3', 's2', 'user', '背景'.repeat(65) + '助教学金确认'),
    c('s4', 's3', 'assistant', '继续处理其他事项'),
  ]));
  const service = createRelaySessions({home, clock:()=>new Date(AT)});
  const list = await service.list({pageId:PAGE, query:'海棠 助教学金'});
  assert.equal(list.sessions.length,1);
  assert.ok(list.sessions[0].matches.some(m=>m.snippet.includes('海棠')));
  assert.ok(list.sessions[0].matches.some(m=>m.snippet.includes('助教学金')));
  assert.equal(Object.hasOwn(list.sessions[0],'messages'),false);
  assert.equal((await service.list({pageId:PAGE,query:'不存在的关键词'})).sessions.length,0);
}));
const jsonl = (rs) =>
  rs.map((r) => JSON.stringify({ timestamp: AT, ...r })).join("\n");
const c = (id, parent, role, text, extra = {}) => ({
  uuid: id,
  parentUuid: parent,
  type: role,
  cwd: "/fixture/project",
  message: { role, content: text },
  ...extra,
});
const user = (text) => ({
  type: "response_item",
  payload: {
    type: "message",
    role: "user",
    content: [{ type: "input_text", text }],
  },
});
test('来源压缩摘要在有效父链及摘要末节点均保留，并明确原始历史未知',()=>{
  for(const onlySummary of [false,true]) {
    const rows=[c('summary',null,'user','已改成研究生方案B，7200元',{isCompactSummary:true})];
    if(!onlySummary) rows.push(c('follow','summary','user','继续'));
    const parsed=parseRelayJsonl(jsonl(rows),'claude-code');
    assert.equal(parsed.historyState,'compacted');
    assert.equal(parsed.sourceSummaries.length,1);
    assert.match(parsed.sourceSummaries[0].text,/7200元/);
    assert.ok(!parsed.messages.some(m=>m.text.includes('7200')));
  }
});
test('1501文件可持续扫描：最旧mtime的最新会话也能找到，旧游标不能换查询重用',()=>fixture(async home=>{
  const dir=join(home,'.codex/sessions');await fs.mkdir(dir,{recursive:true});
  for(let start=0;start<1501;start+=100) await Promise.all(Array.from({length:Math.min(100,1501-start)},async(_,n)=>{
    const i=start+n,p=join(dir,`rollout-${String(i).padStart(4,'0')}.jsonl`);
    await fs.writeFile(p,jsonl([user(i===1500?'最新唯一会话哨兵':'旧会话'+i)]));
    await fs.utimes(p,i===1500?1:1000,i===1500?1:1000);
  }));
  const service=createRelaySessions({home,clock:()=>new Date(AT)});
  let result=await service.list({pageId:PAGE,query:'最新唯一会话哨兵'}),found=[...result.sessions],firstCursor=result.nextCursor;
  assert.ok(firstCursor);assert.equal(result.scan.complete,false);
  while(result.nextCursor){result=await service.list({pageId:PAGE,query:'最新唯一会话哨兵',cursor:result.nextCursor});found.push(...result.sessions);}
  assert.equal(result.scan.scanned,1501);assert.equal(result.scan.complete,true);
  assert.equal(found.length,1);assert.equal(new Set(found.map(s=>s.id)).size,1);
  await assert.rejects(service.list({pageId:PAGE,query:'另一个',cursor:firstCursor}),/游标|范围/);
}));
test("Claude：按主链去重，不混旧分支/工具/思考/附件/旁支/摘要", () => {
  const r = parseRelayJsonl(
    jsonl([
      c("u", null, "user", "开工"),
      c("a", "u", "assistant", [
        { type: "text", text: "回答" },
        { type: "thinking", thinking: "PRIVATE" },
        { type: "tool_use", input: "PRIVATE" },
        { type: "image", source: "PRIVATE" },
      ]),
      c("branch", "u", "assistant", "旧分支"),
      c("u2", "a", "user", "接续"),
      c("a2", "u2", "assistant", "完成"),
      c("side", null, "assistant", "PRIVATE", { isSidechain: true }),
      c("meta", "a2", "user", "PRIVATE", { isMeta: true }),
      c("compact", "meta", "user", "PRIVATE", { isCompactSummary: true }),
    ]),
    "claude-code",
  );
  assert.deepEqual(
    r.messages.map((m) => m.text),
    ["开工", "回答", "接续", "完成"],
  );
  assert.equal(r.rounds, 2);
  assert.equal(r.project, "/fixture/project");
  assert.throws(
    () =>
      parseRelayJsonl(
        jsonl([c("1", "2", "user", "a"), c("2", "1", "assistant", "b")]),
        "claude-code",
      ),
    /循环/,
  );
  assert.throws(
    () =>
      parseRelayJsonl(jsonl([c("1", "missing", "user", "a")]), "claude-code"),
    /不完整/,
  );
});
test("Codex：只取用户与可见回答，排除event镜像/analysis/工具/附件；引用和回滚如实拒绝", () => {
  const r = parseRelayJsonl(
    jsonl([
      { type: "session_meta", payload: { cwd: "/fixture/codex" } },
      user("目标"),
      { type: "event_msg", payload: { type: "user_message", message: "目标" } },
      {
        type: "response_item",
        payload: {
          type: "message",
          role: "assistant",
          channel: "analysis",
          content: [{ type: "output_text", text: "PRIVATE" }],
        },
      },
      {
        type: "response_item",
        payload: { type: "function_call_output", output: "PRIVATE" },
      },
      {
        type: "response_item",
        payload: {
          type: "message",
          role: "assistant",
          content: [
            { type: "output_text", text: "结果" },
            { type: "image", text: "PRIVATE" },
          ],
        },
      },
    ]),
    "codex",
  );
  assert.deepEqual(
    r.messages.map((m) => m.text),
    ["目标", "结果"],
  );
  assert.equal(r.rounds, 1);
  assert.throws(
    () =>
      parseRelayJsonl(
        jsonl([
          { type: "session_meta", payload: { history_base: "private" } },
          user("a"),
        ]),
        "codex",
      ),
    /暂不支持/,
  );
  assert.throws(
    () =>
      parseRelayJsonl(
        jsonl([{ type: "event_msg", payload: { type: "thread_rolled_back" } }]),
        "codex",
      ),
    /暂不支持/,
  );
});
test("凭据：标题/JSON/跨行赋值/签名URL/Bearer/PEM与PGP私钥先过滤再截断", () => {
  const secrets = [
    "sk-syntheticToken",
    '"password": "synthetic-secret"',
    "api_key:\nordinary-secret",
    "Bearer abc123",
    "Authorization: Basic c3ludGhldGlj",
    "password: |\n  synthetic-line1\n\n  synthetic-line2",
    "https://fixture.test/?signature=synthetic-sig",
    "-----BEGIN PGP PRIVATE KEY BLOCK-----\nprivate-body\n-----END PGP PRIVATE KEY BLOCK-----",
    "-----BEGIN RSA PRIVATE KEY-----\nprivate-body\n-----END RSA PRIVATE KEY-----",
  ];
  for (const s of secrets) {
    const r = filterRelayText(s);
    assert.ok(r.count > 0, s);
    assert.doesNotMatch(
      r.text,
      /synthetic|ordinary-secret|private-body|abc123|c3ludGhldGlj/,
    );
    assert.match(r.text, /已隐去/);
  }
  const r = buildRelayPrompt({
    title: secrets[1],
    agentName: "Codex",
    project: secrets[2],
    updatedAt: AT,
    next: secrets[4],
    messages: [{ role: "user", text: secrets[6] }],
  });
  assert.doesNotMatch(r.prompt, /synthetic|ordinary-secret|private-body/);
  assert.ok(r.redactions >= 4);
});
test("提示词：8轮、每消息600字、总6000字，截断明示且最后一轮保留", () => {
  const messages = Array.from({ length: 20 }, (_, i) => ({
    role: i % 2 ? "assistant" : "user",
    text: "第" + i + "轮" + String(i).repeat(700),
  }));
  const r = buildRelayPrompt({
    title: "测试",
    agentName: "Codex",
    project: "/fixture",
    updatedAt: AT,
    messages,
  });
  assert.ok(r.prompt.length <= 6000);
  assert.match(r.prompt, /最后 8 轮/);
  assert.doesNotMatch(r.prompt, /第0轮/);
  assert.match(r.prompt, /……/);
  assert.match(r.prompt, /第19轮/);
  assert.match(r.prompt, /请先核对/);
});
async function fixture(fn) {
  const home = await fs.realpath(
    await fs.mkdtemp(join(tmpdir(), "guiji-relay-")),
  );
  try {
    await fn(home);
  } finally {
    await fs.rm(home, { recursive: true, force: true });
  }
}
async function writeSession(
  home,
  agent = "claude-code",
  name = "session.jsonl",
  text = jsonl([
    c("u", null, "user", "目标"),
    c("a", "u", "assistant", "结果"),
  ]),
) {
  const dir = join(
    home,
    agent === "claude-code"
      ? ".claude/projects/p"
      : ".codex/sessions/2026/10/05",
  );
  await fs.mkdir(dir, { recursive: true });
  const path = join(dir, name);
  await fs.writeFile(path, text);
  return path;
}
test("适配器：创建零读取、批准根列表无正文、选择才正文、目录丢失/不支持分开显示、clear后拒绝", () =>
  fixture(async (home) => {
    const path = await writeSession(home);
    let reads = 0;
    const filesystem = new Proxy(fs, {
      get(t, k) {
        if (k === "open")
          return async (...a) => {
            reads++;
            return t.open(...a);
          };
        return t[k];
      },
    });
    const service = createRelaySessions({
      home,
      filesystem,
      clock: () => new Date(AT),
    });
    assert.equal(reads, 0);
    const list = await service.list({ pageId: PAGE });
    assert.equal(list.sessions.length, 1);
    assert.deepEqual(Object.keys(list.sessions[0]).sort(), [
      "agentId",
      "completeness",
      "id",
      "lastAgentText",
      "lastUserText",
      "project",
      "rounds",
      "title",
      "updatedAt",
    ]);
    assert.equal(
      list.sources.find((s) => s.agentId === "codex").status,
      "unreadable",
    );
    assert.equal(
      list.sources.find((s) => s.agentId === "hermes").status,
      "unsupported",
    );
    const r = await service.prepare({ pageId: PAGE, id: list.sessions[0].id });
    assert.match(r.prompt, /用户：目标/);
    assert.match(r.prompt, /Claude Code：结果/);
    assert.equal(reads, 2);
    service.clear({ pageId: PAGE });
    await assert.rejects(
      service.prepare({ pageId: PAGE, id: list.sessions[0].id }),
      /丢弃/,
    );
    assert.equal((await fs.readFile(path, "utf8")).includes("结果"), true);
  }));
test("损坏行、超长消息、空目录、权限失败、超过上限：不伪完整或正常", () =>
  fixture(async (home) => {
    await writeSession(
      home,
      "claude-code",
      "bad.jsonl",
      "坏行\n" +
        jsonl([
          c("u", null, "user", "a".repeat(800)),
          c("a", "u", "assistant", "b".repeat(800)),
        ]),
    );
    await writeSession(home, "claude-code", "invalid.jsonl", "bad");
    await writeSession(
      home,
      "claude-code",
      "long.jsonl",
      jsonl([
        c("u", null, "user", "a".repeat(800)),
        c("a", "u", "assistant", "b".repeat(800)),
      ]),
    );
    const service = createRelaySessions({ home, clock: () => new Date(AT) });
    const list = await service.list({ pageId: PAGE });
    assert.equal(list.sessions.length, 1);
    assert.equal(list.skipped, 2);
    assert.equal(list.incomplete, true);
    assert.match(list.sources[0].reason, /损坏/);
    const r = await service.prepare({ pageId: PAGE, id: list.sessions[0].id });
    assert.match(r.prompt, /……/);
    const filesystem = new Proxy(fs, {
      get(t, k) {
        return k === "readdir"
          ? async () => {
              throw Object.assign(new Error("secret path"), { code: "EACCES" });
            }
          : t[k];
      },
    });
    const denied = await createRelaySessions({ home, filesystem }).list({
      pageId: PAGE,
    });
    assert.equal(denied.sessions.length, 0);
    assert.equal(denied.sources[0].reason, "会话目录不可读");
    assert.doesNotMatch(JSON.stringify(denied), /secret path/);
  }));
test("符号/硬链接与文件身份变更拒绝；损坏/超限会话不读取", () =>
  fixture(async (home) => {
    const p = await writeSession(home);
    const dir = join(home, ".claude/projects/p");
    await fs.symlink(p, join(dir, "link.jsonl"));
    await fs.link(p, join(dir, "hard.jsonl"));
    let service = createRelaySessions({ home, clock: () => new Date(AT) });
    assert.equal((await service.list({ pageId: PAGE })).sessions.length, 0);
    await fs.unlink(join(dir, "hard.jsonl"));
    let list = await service.list({ pageId: PAGE });
    assert.equal(list.sessions.length, 1);
    await fs.rename(p, p + ".old");
    await fs.writeFile(p, jsonl([c("u", null, "user", "替换")]));
    await assert.rejects(
      service.prepare({ pageId: PAGE, id: list.sessions[0].id }),
      /身份/,
    );
    await fs.writeFile(
      join(dir, "huge.jsonl"),
      "x".repeat(8 * 1024 * 1024 + 1),
    );
    list = await service.list({ pageId: PAGE });
    assert.ok(list.skipped >= 1);
  }));
test("CURRENT：不信会话cwd；只用已登记项目的身份解析器，受阻省略并标状态", () =>
  fixture(async (home) => {
    await writeSession(home);
    let projectCalls = 0;
    const options = {
      home,
      clock: () => new Date(AT),
      projectReader: async () => {
        projectCalls++;
        return { state: "ok", next: "已确认下一步" };
      },
    };
    const s = createRelaySessions(options);
    let list = await s.list({ pageId: PAGE });
    let p = await s.prepare({ pageId: PAGE, id: list.sessions[0].id });
    assert.equal(projectCalls, 0);
    assert.doesNotMatch(p.prompt, /项目唯一下一步/);
    const bound = createRelaySessions({
      ...options,
      getWorkspace: () => ({
        connections: {
          projects: [{ id: "p", localPaths: ["/fixture/project"] }],
          roots: ["/fixture"],
        },
      }),
    });
    list = await bound.list({ pageId: PAGE });
    p = await bound.prepare({ pageId: PAGE, id: list.sessions[0].id });
    assert.equal(projectCalls, 1);
    assert.match(p.prompt, /项目唯一下一步：已确认下一步/);
  }));
test("应用：只打开重新核验的App，无CLI/提示词参数；未知/路径/跨Agent拒绝", macOnly(PLUTIL), () =>
  fixture(async (home) => {
    const path = join(home, "Codex.app");
    await fs.mkdir(join(path, "Contents"), { recursive: true });
    await fs.writeFile(join(path, "Contents/Info.plist"), JSON.stringify({ CFBundleIdentifier: "com.openai.codex" }));
    const calls = [];
    const getAgents = () => [
      {
        id: "codex",
        name: "Codex",
        status: "detected",
        programs: [
          { kind: "App", path },
          { kind: "CLI", path: "/fixture/bin/codex" },
        ],
      },
      {
        id: "hermes",
        name: "Hermes",
        status: "detected",
        programs: [{ kind: "CLI", path: "/fixture/bin/hermes" }],
      },
    ];
    const s = createRelaySessions({
      home,
      getAgents,
      openApplication: async (...args) => calls.push(args),
    });
    assert.equal((await s.open({ agentId: "codex" })).opened, true);
    assert.deepEqual(calls, [[path]]);
    assert.equal((await s.open({ agentId: "hermes" })).opened, false);
    assert.equal((await s.open({ agentId: "unknown" })).opened, false);
    await fs.rm(path, { recursive: true });
    await fs.symlink(home, path);
    await assert.rejects(s.open({ agentId: "codex" }), /符号/);
    assert.equal(calls.length, 1);
  }));
test("离页/并发：读中重复拒绝，clear后迟到列表不返回", () =>
  fixture(async (home) => {
    await writeSession(home);
    let release;
    const wait = new Promise((r) => (release = r));
    let entered;
    const ready = new Promise((r) => (entered = r));
    const filesystem = new Proxy(fs, {
      get(t, k) {
        return k === "readdir"
          ? async (...args) => {
              entered();
              await wait;
              return t.readdir(...args);
            }
          : t[k];
      },
    });
    const s = createRelaySessions({
      home,
      filesystem,
      clock: () => new Date(AT),
    });
    const p = s.list({ pageId: PAGE });
    await ready;
    await assert.rejects(s.list({ pageId: PAGE }), /正在进行/);
    s.clear({ pageId: PAGE });
    release();
    await assert.rejects(p, /离开/);
  }));

test("空批准目录与不存在分开：空目录已扫描ok，未支持与未读不得当完整空", () =>
  fixture(async (home) => {
    await fs.mkdir(join(home, ".claude/projects/p"), { recursive: true });
    await fs.mkdir(join(home, ".codex/sessions/2026/10/05"), {
      recursive: true,
    });
    const list = await createRelaySessions({
      home,
      clock: () => new Date(AT),
    }).list({ pageId: PAGE });
    assert.equal(list.sessions.length, 0);
    assert.equal(list.skipped, 0);
    assert.equal(list.incomplete, false);
    assert.deepEqual(
      list.sources.slice(0, 2).map((s) => s.status),
      ["ok", "ok"],
    );
    assert.deepEqual(
      list.sources.slice(2).map((s) => s.status),
      ["unsupported", "unsupported"],
    );
  }));
test("极端密集文本仍保留末条且6000以内；省略明确，隐去计数不被摘录重复", () => {
  const r = buildRelayPrompt({
    title: "测试",
    agentName: "Codex",
    messages: [
      { role: "user", text: "开工" },
      ...Array.from({ length: 3000 }, (_, i) => ({
        role: "assistant",
        text: "消息" + i,
      })),
    ],
  });
  assert.ok(r.prompt.length <= 6000);
  assert.match(r.prompt, /消息2999/);
  assert.match(r.prompt, /用户：开工/);
  assert.match(r.prompt, /省略/);
  const secret = buildRelayPrompt({
    title: "测试",
    agentName: "Codex",
    messages: [{ role: "user", text: "password=合成秘密" }],
  });
  assert.equal(secret.redactions, 1);
  assert.equal(secret.quote, "[已隐去]");
});

test("Claude末尾元消息不替换主链；UUID重写按最后记录位置选叶", () => {
  const rs = [
    c("u", null, "user", "目标"),
    c("a1", "u", "assistant", "初稿"),
    c("a2", "u", "assistant", "旧分支"),
    c("a1", "u", "assistant", "新稿"),
    c("meta", null, "user", "PRIVATE", { isMeta: true }),
  ];
  assert.deepEqual(
    parseRelayJsonl(jsonl(rs), "claude-code").messages.map((m) => m.text),
    ["目标", "新稿"],
  );
});
test("guard后祖先换符号链接：打开后核对fd与全部祖先，零正文read", () =>
  fixture(async (home) => {
    const p = await writeSession(home),
      parent = join(home, ".claude/projects/p"),
      outside = join(home, "outside");
    await fs.mkdir(outside);
    await fs.writeFile(
      join(outside, "session.jsonl"),
      jsonl([c("u", null, "user", "不批准文本")]),
    );
    const first = createRelaySessions({ home, clock: () => new Date(AT) });
    const list = await first.list({ pageId: PAGE });
    assert.equal(list.sessions.length, 1);
    let reads = 0,
      injected = false;
    const filesystem = new Proxy(fs, {
      get(t, k) {
        if (k === "open")
          return async (...args) => {
            if (!injected) {
              injected = true;
              await fs.rename(parent, parent + ".before");
              await fs.symlink(outside, parent);
            }
            const handle = await t.open(...args);
            return new Proxy(handle, {
              get(h, key) {
                if (key === "read")
                  return async (...a) => {
                    reads++;
                    return h.read(...a);
                  };
                const v = h[key];
                return typeof v === "function" ? v.bind(h) : v;
              },
            });
          };
        return t[k];
      },
    });
    const service = createRelaySessions({
      home,
      filesystem,
      clock: () => new Date(AT),
    });
    const result = await service.list({ pageId: PAGE });
    assert.equal(result.sessions.length, 0);
    assert.equal(reads, 0);
    assert.ok(result.skipped > 0);
  }));

test("离页clear先于迟到list：撤销旧scope，零枚举/零正文，新scope才可读取", () =>
  fixture(async (home) => {
    await writeSession(home);
    let reads = 0;
    const filesystem = new Proxy(fs, {
      get(t, k) {
        if (["readdir", "open"].includes(k))
          return async (...args) => {
            reads++;
            return t[k](...args);
          };
        return t[k];
      },
    });
    const s = createRelaySessions({
      home,
      filesystem,
      clock: () => new Date(AT),
    });
    s.clear({ pageId: PAGE });
    await assert.rejects(s.list({ pageId: PAGE }), /已离开/);
    assert.equal(reads, 0);
    assert.equal(
      (await s.list({ pageId: "fresh-fixture-page-00001" })).sessions.length,
      1,
    );
  }));

// 派单173全回归发现：并发合成根创建会改变公共祖先目录mtime，不应被当成会话身份替换。
test('无关兄弟文件新增不影响已批准会话；目录/会话本身仍绑定身份',()=>fixture(async home=>{
 await writeSession(home);let injected=false;const filesystem=new Proxy(fs,{get(t,k){if(k==='open')return async(...args)=>{const h=await t.open(...args);return new Proxy(h,{get(o,n){if(n==='stat')return async(...a)=>{const value=await o.stat(...a);if(!injected){injected=true;await fs.writeFile(join(home,'synthetic-unrelated.txt'),'合成无关文件');}return value;};return typeof o[n]==='function'?o[n].bind(o):o[n];}});};return t[k];}});const service=createRelaySessions({home,filesystem,clock:()=>new Date(AT)});const list=await service.list({pageId:PAGE});assert.equal(injected,true);assert.equal(list.sessions.length,1);assert.match((await service.prepare({pageId:PAGE,id:list.sessions[0].id})).prompt,/用户：目标/);
}));

test('来源摘要参与正文检索；analysis摘要不能成为可见证据',()=>fixture(async home=>{
  await writeSession(home,'claude-code','summary-search.jsonl',jsonl([c('a',null,'user','决定哨兵改为7200元',{isCompactSummary:true}),c('b','a','user','继续')]));
  const service=createRelaySessions({home,clock:()=>new Date(AT)});
  const list=await service.list({pageId:PAGE,query:'决定哨兵'});
  assert.equal(list.sessions.length,1);assert.equal(list.sessions[0].matches[0].kind,'source_compaction');
  const parsed=parseRelayJsonl(jsonl([c('x',null,'assistant','ignore',{isCompactSummary:true,message:{role:'assistant',channel:'analysis',content:'隐藏推理哨兵'}})]),'claude-code');
  assert.equal(parsed.sourceSummaries.length,0);
}));
