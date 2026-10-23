# Claude 验收 447 · REA 第一阶段（Codex 445）

| 项 | 内容 |
|---|---|
| 输入状态 / 输出状态 | WB-20261013-445 → Claude 认领 446 → WB-20261013-447（写入者释放） |
| 验收对象 | [Codex 交接 445](2026-10-13-codex-rea-phase1-445.md)；11 项交付 manifest `work/rea444/review3/manifest.json` |
| 结论 | **有条件通过**：主体符合派单 443；以下 R1–R3 三项返修交 Codex，完成后不必再等 Claude 复验，可直接进入常浩真实试用与采用授权 |

## 一、核对了什么

1. **文件指纹**：11 项交付文件逐一重算 SHA256，与 manifest 一致，0 漂移。
2. **测试**：逆向相关 6 个单元文件 50/50 通过；全量单元 1230/1230 通过。
3. **任务包全文**：用合成 Electron 与网站目标实际生成（`buildRecipeTask`）。REA 段包含缺工具即停、授权边界、`record-and-continue`、summary + 定点追踪、观察/推断/未知、不贴原始输出，均符合派单。
4. **与真实 REA 接口对照**：本会话已加载本机 `rea` MCP（6.4.0），读取真实工具 schema：
   - `analyze_javascript_application` 的 `input_path` / `integrity_policy: "record-and-continue"` / `detail: "summary"` 三个参数名与取值全部存在且正确。
   - `inspect_analysis_view`、`trace_application_feature` 工具名正确。
5. **服务端目标检查** `server/reverse-target.mjs`：只 `lstat`，逐级拒符号链接，检查前后比对 dev/ino/mode，不读内容、不运行 REA，符合派单。
6. **炼成边界** `src/reverse-skill.js`：REA 记录的 SKILL.md 带取证方式、目标种类、证据 ID 与未知项清单，并写明“不证明已完整还原”。
7. **截图**：`final-rea-input-1440`、`final-rea-evidence-1440` 看过，录入抽屉与未知项分区沿用原视觉。

## 二、返修（交 Codex）

### R1 重要 · 网站路线缺“如何开出 CDP 端点”

真实 `list_browser_targets` 的必填参数是 `cdp_endpoint`（字面回环地址，例如 `http://127.0.0.1:9222`），REA 只连接已有的调试端口，不会自己开。常浩平常用的 Chrome 没有这个端口，所以按现有任务包，网站路线在实际使用中几乎一定停在“没有可用 CDP 连接”，而用户不知道该怎么办。

要求：
- 网站任务包补一段：由伙伴**先告诉用户**用独立的调试资料目录另开一个 Chrome，再继续。示例：`open -na "Google Chrome" --args --remote-debugging-port=9222 --user-data-dir="$HOME/.rea-chrome"`；在这个窗口里打开目标页；取证完关闭该窗口。不得让伙伴自行启动浏览器或改用常浩的日常资料目录。
- 录入抽屉选“网站”时给一行同样意思的提示（可复制命令）。
- 测试断言任务包与提示中都有调试端口说明。

（独立资料目录的原因：调试端口能控制整个浏览器，不应挂在登录了个人账号的日常资料上；新版 Chrome 也不再允许默认资料目录开远程调试。）

### R2 小 · Evidence ID 改为与 REA 一致的 64 位

真实 REA 的 Evidence ID 格式是 `^ev_[a-f0-9]{64}$`（`inspect_analysis_view` 等 schema 原文）。派单 443 写成 16–64 位是我的失误。
- `src/reverse-recipe.js` 正则改为 `{64}`；示例 JSON 里的短 ID `ev_0123456789abcdef` **保留不改**，这样伙伴照抄示例时会被校验拒绝，正好防止假证据。
- 测试夹具与浏览器合成回复改用 64 位 ID，并加一条“16 位示例 ID 被拒”的用例。
- 徽标仍显示前 8 位，点击复制完整 ID 不变。

### R3 小 · 证据徽标缺标识

截图里流程块只显示一串 `01234567`，看起来像正文里多出的数字，用户看不出是证据编号。徽标前加“证据”字样（或现有图标 + 文字），aria-label 写“复制证据编号 ev_…”。

## 三、不在返修内（记录）

- 真实 REA 取证尚未有人做过：需常浩在正式采用后亲自试一次（建议 Electron 路线，比如 Notion 某个功能）。
- 正式 5178 / dist 采用与重启须常浩另行授权。
- 441 连续阅读的真人验收仍独立待办。

## 四、测试证据

- 逆向相关单元：`node --test tests/reverse-rea.test.mjs tests/reverse-recipe.test.mjs tests/reverse-skill.test.mjs tests/reverse-media.test.mjs tests/reverse-delivery.test.mjs tests/reverse-engineering.test.mjs` → 50/50 通过。
- 全量单元：`node --test tests/*.test.mjs` → 1230/1230 通过，0 失败（约 41 秒，node 默认并发）。
- 浏览器专项本轮未重跑（未改代码），沿用 445 证据。

## 五、边界

本轮 Claude 未改业务代码，只写本交接与 CURRENT；未运行 REA 取证、未重启服务、未提交推送。

唯一下一步：Codex 认领 R1–R3 返修 → 交回后常浩授权正式采用并真实试用。
