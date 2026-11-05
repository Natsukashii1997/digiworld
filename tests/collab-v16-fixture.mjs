import { writeFile, readFile, readdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { collabBoardFixture } from "./collab-board-fixture.mjs";
export const CURRENT_V16 = `# 合成数码世界
## 协作状态
| 字段 | 当前值 |
|---|---|
| state_id | P-20261008-176 |
| 当前写入者 | Claude Code |
| 当前任务 | 随手记页逐区验收 |
| 唯一下一步 | Claude 逐区验收随手记页 |
| 最新交接 | [交接176](docs/agents/handoffs/2026-10-07-notes-5.md) |
| run_id | notes |
| 事项 | 随手记页 |
| 阶段 | 6 |
| 阶段开始 | 2026-10-08T11:02:00+08:00 |
| 模板 | 设计实现流 v1 |
`;
export async function collabV16Fixture() {
  const app = await collabBoardFixture({
    clock: () => Date.parse("2026-10-08T14:02:00+08:00"),
  });
  // 准备步骤失败时也关掉已启动的服务并清理，否则监听句柄让整个测试文件永不退出。
  try {
    const dir = join(app.paths.collab, "docs/agents/handoffs");
    for (const f of await readdir(dir)) await unlink(join(dir, f));
    const document = async (name, fields) =>
      writeFile(
        join(dir, name),
        "# 合成协同协议\n\n| 字段 | 值 |\n|---|---|\n" +
          Object.entries(fields)
            .map(([k, v]) => `| ${k} | ${v} |`)
            .join("\n") +
          "\n\n## 正文\nBODY-MARKER-PRIVATE 不读取\n",
      );
    for (const [i, actor, status, at, artifact, result, gate] of [
      [
        1,
        "Claude Code",
        "passed",
        "2026-10-05T15:20:00+08:00",
        "briefs/05-notes.md",
        "你确认 · 10/05",
        "confirmed",
      ],
      [
        2,
        "Claude Code",
        "passed",
        "2026-10-05T16:40:00+08:00",
        "pages/notes.html",
        "你确认 · 10/05",
        "confirmed",
      ],
      [
        3,
        "Claude Code",
        "passed",
        "2026-10-05T20:05:00+08:00",
        "docs/agents/handoffs/175.md",
        "已登记",
        "",
      ],
      [
        4,
        "Codex",
        "passed",
        "2026-10-07T09:40:00+08:00",
        "src/NotesV16.jsx",
        "回归全绿",
        "",
      ],
      [
        5,
        "Codex",
        "delivered",
        "2026-10-07T14:20:00+08:00",
        "docs/agents/handoffs/176.md",
        "已回读",
        "",
      ],
      [
        6,
        "Claude Code",
        "working",
        "2026-10-08T11:02:00+08:00",
        "",
        "验收中",
        "",
      ],
    ])
      await document(`2026-10-07-notes-${i}.md`, {
        run_id: "notes",
        event_id: i === 3 ? "175" : i === 5 ? "176" : `notes-${i}`,
        title: "随手记页",
        phase: i,
        actor,
        status,
        at,
        artifact,
        result,
        gate,
        method:
          i === 1
            ? "grill-me — 逐轮提问，每题给推荐答案，等你回答再进入下一轮"
            : "",
      });
    await document("2026-10-06-notes-rework.md", {
      run_id: "notes",
      event_id: "repair-1",
      title: "随手记页",
      phase: 6,
      actor: "Claude Code",
      status: "failed",
      at: "2026-10-06T18:15:00+08:00",
      result: "390 展开按钮偏差",
    });
    await document("2026-10-07-reverse.md", {
      run_id: "reverse",
      event_id: "reverse-4",
      title: "逆向工程",
      phase: 4,
      actor: "Codex",
      status: "working",
      at: "2026-10-08T10:00:00+08:00",
    });
    await document("2026-10-07-silver.md", {
      run_id: "silver",
      event_id: "silver-7",
      title: "剪影",
      phase: 7,
      actor: "用户",
      status: "waiting",
      at: "2026-10-08T10:00:00+08:00",
    });
    await writeFile(join(app.paths.collab, "CURRENT.md"), CURRENT_V16);
    await app.mark("协同项目");
    const originalDocs = await Promise.all(
      (await readdir(dir)).map(async (name) => [
        name,
        await readFile(join(dir, name), "utf8"),
      ]),
    );
    return {
      ...app,
      document,
      async mode(mode) {
        for (const [name, text] of originalDocs)
          await writeFile(join(dir, name), text);
        if (mode === "alert") {
          for (const name of [
            "2026-10-07-notes-4.md",
            "2026-10-07-notes-5.md",
            "2026-10-07-notes-6.md",
            "2026-10-06-notes-rework.md",
          ])
            await unlink(join(dir, name));
          await document("2026-10-07-notes-4.md", {
            run_id: "notes",
            event_id: "notes-4",
            title: "随手记页",
            phase: 4,
            actor: "Codex",
            status: "working",
            at: "2026-10-04T11:02:00+08:00",
            result: "卡住4天",
          });
        }
        await writeFile(
          join(app.paths.collab, "CURRENT.md"),
          mode === "alert"
            ? CURRENT_V16.replace("Claude Code |", "Claude Code / Codex |")
                .replace("| 6 |", "| 4 |")
                .replace("2026-10-08T11:02:00+08:00", "2026-10-04T11:02:00+08:00")
                .replace("2026-10-07-notes-5.md", "2026-10-07-notes-4.md")
            : CURRENT_V16,
        );
        if (mode === "empty") await app.mark("协同项目", false);
        else await app.mark("协同项目");
      },
    };
  } catch (error) {
    await app.close().catch(() => {});
    throw error;
  }
}
