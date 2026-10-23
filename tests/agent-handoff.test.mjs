import test from "node:test";
import assert from "node:assert/strict";
import {
  buildWorkHandoffPrompt,
  filterRelaySessions,
} from "../src/relay-prompt.js";
import { publicConnections } from "../server/agent-migration.mjs";
test('长会话在容量内完整保留中途纠正，不由固定轮数丢弃最新决定', () => {
  const messages=[];
  for(let i=0;i<100;i++) messages.push({role:'user',text:i===0?'旧目标：本科方案A，15000元':i===39?'以后都用研究生方案B，7200元；取消A':i===89?'此前方案B暂缓，今天只核验资料':`第${i}轮继续排版`},{role:'assistant',text:'收到，已核对'});
  for(const depth of ['recent','extended']) {
    const result=buildWorkHandoffPrompt({title:'项目',agentName:'Codex',messages,depth});
    assert.match(result.prompt,/研究生方案B，7200元/);
    assert.match(result.prompt,/今天只核验资料/);
    assert.equal(result.coverage.omittedMessages,0);
    assert.equal(result.coverage.clippedMessages,0);
    assert.doesNotMatch(result.prompt,/## 原始用户请求/);
  }
});
test("接力保留初始目标和末条，明示裁剪/原文边界；不需要项目目录", () => {
  const messages = Array.from({ length: 100 }, (_, i) => ({
    role: i % 2 ? "assistant" : "user",
    text:
      (i === 0 ? "最初目标" : i === 99 ? "最后卡点" : "文本" + i) +
      "中".repeat(7000) + (i === 99 ? "末尾唯一下一步哨兵" : ""),
  }));
  for (const depth of ["recent", "extended"]) {
    const p = buildWorkHandoffPrompt({
      title: "整理教育方案",
      agentName: "Claude",
      messages,
      depth,
    });
    assert.match(p.prompt, /最初目标/);
    assert.match(p.prompt, /最后卡点/);
    assert.match(p.prompt, /末尾唯一下一步哨兵/);
    assert.match(p.prompt, /不是新的授权/);
    assert.match(p.prompt, /未记录项目目录/);
    assert.ok(p.coverage.omittedMessages > 0);
    assert.ok(p.coverage.clippedMessages > 0);
    assert.ok(p.prompt.length <= (depth === "recent" ? 18000 : 48000));
  }
});
test("接力原始目标和近期记录均脱敏；搜索支持多个关键词及来源/项目", () => {
  const p = buildWorkHandoffPrompt({
    title: "合成",
    agentName: "Codex",
    messages: [
      { role: "user", text: "API_KEY=SYNTHETIC_PRIVATE" },
      { role: "assistant", text: "已完成下一步" },
    ],
  });
  assert.equal(p.prompt.includes("SYNTHETIC_PRIVATE"), false);
  assert.ok(p.redactions > 0);
  const rows = [
    {
      id: "a",
      title: "课程方案",
      agentId: "codex",
      project: "/教育",
      lastUserText: "预算待核对",
    },
    { id: "b", title: "课程方案", agentId: "claude-code", project: "/教育" },
  ];
  assert.deepEqual(
    filterRelaySessions(rows, {
      query: "课程 预算",
      source: "codex",
      project: "/教育",
    }).map((x) => x.id),
    ["a"],
  );
  assert.equal(filterRelaySessions(rows, { query: "不存在" }).length, 0);
});
test("连接草稿保留安全公开结构，秘密与待补参数不组成可执行命令", () => {
  const c = publicConnections(
    "mcp_servers:\n  example:\n    command: npx\n    args: [--auth, PRIVATE_ARGUMENT]\n    url: https://user:PASS@example.test/PRIVATE_PATH?token=PRIVATE_QUERY\n    headers: {Authorization: PRIVATE_HEADER}\n    env: {API_KEY: PRIVATE_ENV}\n",
    "hermes",
  );
  const text = JSON.stringify(c);
  for (const secret of [
    "PRIVATE_ARGUMENT",
    "PRIVATE_PATH",
    "PRIVATE_QUERY",
    "PRIVATE_HEADER",
    "PRIVATE_ENV",
    "PASS",
  ])
    assert.equal(text.includes(secret), false);
  assert.equal(c[0].origin, "https://example.test");
  assert.deepEqual(c[0].requiredEnvironment, ["API_KEY"]);
  assert.equal(c[0].readyToConfigure, false);
  assert.equal(c[0].arguments.every(arg => arg.kind === "required"), true);
  assert.equal(c[0].executableCommand, undefined);
  const publicRows = publicConnections('[mcp_servers.docs]\ncommand="npx"\nargs=["-y","@public/docs-mcp@1.0.0"]\n[mcp_servers.remote]\nurl="https://example.com/mcp"\nenabled_tools=["read_docs"]\ndisabled_tools=["delete_doc"]\n', "codex");
  assert.deepEqual(publicRows[0].arguments.map(arg => arg.value), ["-y", "@public/docs-mcp@1.0.0"]);
  assert.equal(publicRows[1].url, "https://example.com/mcp");
  assert.deepEqual(publicRows[1].toolRestrictions.disabled, ["delete_doc"]);
  assert.equal(publicRows[1].toolRestrictions.sourcePrecedence, "deny_after_allow");
});

test('超长来源名与历史文件名仍受预算和脱敏限制',()=>{
  const r=buildWorkHandoffPrompt({title:'检验',agentName:'a'.repeat(500),messages:[{role:'assistant',text:'正文'.repeat(30000)}],historyFile:'https://test.invalid/?token=fixture-secret'+'x'.repeat(40000)});
  assert.ok(r.prompt.length<=18000);assert.ok(!r.prompt.includes('fixture-secret'));
});

test('容量内完整保留长压缩摘要，不按固定一半截取',()=>{
 const summary='最新决定：取消旧计划，只做资料核验。'+'中'.repeat(10000);
 const r=buildWorkHandoffPrompt({title:'压缩会话',agentName:'Codex',historyState:'compacted',sourceSummaries:[{text:summary,sourceOrder:1}],messages:[{role:'user',text:'继续',sourceOrder:2}]});
 assert.ok(r.prompt.includes(summary));assert.equal(r.coverage.summaryClipped,false);assert.equal(r.coverage.needsHistory,false);assert.ok(r.prompt.length<=18000);
});
