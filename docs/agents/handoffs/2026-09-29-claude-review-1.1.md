# Claude → Codex / 用户｜1.1 使用记录与反馈 · 独立复核

输入状态 **WB-20260929-28**（Codex 交接，写入者“无”）→ 输出 **WB-20260929-29**。执行者 Claude（Claude Code 桌面端，新会话）。日期 2026-09-29。角色：只读复核；未改任何业务代码、测试、dist 或依赖。

**结论：有条件通过。** 未发现削弱 schema、revision、不可变历史、写后回读、未知结果查询或备份兼容的问题；Spec 五项全部实现。发现 1 个已复现缺陷（反馈备注误拒常见评价写法），建议在 1.2 真人验收前修复。

## 1. 改动范围核对

- 以 [UI v11 指纹](2026-09-29-ui-v11-code-baseline.sha256) 比对：**17 个已有文件变化 + 6 个新增**，无删除；与 [Codex 交接](2026-09-29-codex-1.1-usage.md) 声明的 17 + 6 **逐一一致**。基线外仅 `public/theme/digievolution/*.png`（v11 前已存在、未被修改）。
- [Codex 154 文件指纹](2026-09-29-codex-1.1-usage-code-baseline.sha256) 154/154 匹配；清单自身 SHA256 `b55026bc…ead42` 与 CURRENT 一致。
- Codex 留存的 17 个改前快照（`evidence-2026-09-29-codex-1.1/before/`）与 v11 指纹 17/17 一致，本复核据此独立生成差异：[review-diff-from-before.diff](evidence-2026-09-29-claude-review-1.1/review-diff-from-before.diff)（1923 行，与 Codex `review-final.diff` 行数相同；文件头路径不同，故哈希不同）。
- package.json / lock 未变，无新依赖。

## 2. 独立重跑验证

全部使用 fixture 随机端口、临时数据目录、合成资料。日志见 [evidence-2026-09-29-claude-review-1.1/](evidence-2026-09-29-claude-review-1.1/)。

| 检查 | 结果 |
|---|---|
| `npm test` | **378/378 通过**，0 失败/跳过（[npm-test.log](evidence-2026-09-29-claude-review-1.1/npm-test.log)） |
| browser / accessibility / migration / history-capacity + 全部 19 个 `tests/*-browser.mjs` | **23/23 退出码 0**（[summary.txt](evidence-2026-09-29-claude-review-1.1/summary.txt)） |
| `node tests/visual.mjs claude-review-1.1` | 1440/1024/390/320，`problems: []`；截图 `test-results/visual/claude-review-1.1/` |
| dist 与源码 | 当前源码 `vite build` 到临时目录，与 `dist/` **完全一致**（未改写项目 dist） |
| 5178 服务 | PID 91061，`node server/index.mjs`，工作目录为本项目，启动 06:28:31 晚于所有 server 文件最后修改（06:23）；HTML、JS、CSS 均 200 且与 dist **逐字节一致** |
| `data/CURRENT.json` | 复核前后均为 `a74e3e05…a109db9`，未变（只比对哈希，未读内容） |

未执行：`npm run build` 写入项目 dist（复核不写共享面，改为临时目录构建比对）；真实浏览器手工操作；用户验收。

## 3. Standards 轴

| 项 | 结论 | 依据 |
|---|---|---|
| schema | 保持 | 顶层白名单只新增可选 `assetActivity`；记录字段按 kind 白名单、ID 格式、服务端时间、固定版本必须存在、容量 20000 超限拒绝（`server/asset-activity-schema.mjs`） |
| revision | 保持 | `updateActivity` 走 `serial`，新增写入要求 `expectedRevision` 一致；相同 ID 相同载荷在 revision 检查前按 noop 返回，因此“失联后补记”不会因 revision 前进而重复或误报冲突 |
| 不可变历史 | 保持 | `validateActivityHistory`：普通 PUT 不能增删改记录；专用通道也不能覆盖或移除旧记录；有记录的示例进入 `retainedDemoIds` 受保护 |
| 写后回读 | 保持 | 沿用 `commit()` → `read()`；前端 `accept()` 采用回读状态 |
| 未知结果查询 | 保持 | `GET /api/asset-activity?id=` 只读；前端写失败先查询，查不到才开放补记，查询失败禁用补记；待查标识存 sessionStorage（反馈只存 id/assetId，不存备注） |
| 备份兼容 | 保持 | 旧库/旧备份缺字段按空读取、零写入迁移（有测试校验指针字节不变）；合并按 ID 不可变并集，同 ID 异内容整次 409 |
| 隐私 | 基本符合 | 记录不含正文、口令、URL、包路径；`deliveryId` 是记录 UUID，不是下载 secret。备注规则误伤见 D1 |
| 设计系统 | 沿用 | 新样式仅 9 行，使用 `--line`/`--muted` 等现有令牌；Button/Badge/StageBar 复用；1440 与 320 反馈截图可读、无溢出 |
| 公共 Dialog | 行为兼容 | 仅改为 `closeRef.current()`，Escape 调用最新回调；全量浏览器回归通过 |

## 4. Spec 轴（契约 + PRD §8.2 + ROADMAP 1.1）

| 要求 | 结论 | 证据 |
|---|---|---|
| 只在复制/交付真正成功时记录 | ✅ | 三个入口都在 `navigator.clipboard.writeText` resolve 之后调用记录；Skill 另需链接仍有效（服务端复核 deliveryId） |
| 失败不计 | ✅ | `usage-browser.mjs` 覆盖剪贴板拒绝、生成 503、导出/取消不计；本复核 HTTP 探针确认已撤销链接 410 不入库 |
| 有反馈入口 | ✅（有缺陷 D1） | 详情“好用 / 需改进” + 可选备注，关联同版本最近使用 |
| 按最近使用排序 | ✅ | 排序项“最近使用”，按 usedAt（补记保留原时间），从未使用者排后；卡片显示次数或“从未使用” |
| 旧数据迁移 | ✅ | 读兼容、零写入；migration.mjs 通过 |
| 进化阶段结合使用证据 | ✅ | 成长期=已收录，成熟期=当前版本有复制，完全体=最近好评关联当前版本使用；与 PRD §10.2 原映射一致 |

## 5. 发现（按协作分级）

### 已复现缺陷

**D1（中）反馈备注把常见评价写法当成路径而拒绝保存。**
位置：`server/asset-activity-schema.mjs:11` 正则中的 `\/[A-Za-z0-9._~-]+` 分支（任意 ASCII 斜杠后接字母数字即命中），以及 `token\s*[:=：]\s*\S+`。
复现（隔离 fixture，[probe-http.mjs](evidence-2026-09-29-claude-review-1.1/probe-http.mjs) / [probe-notes.mjs](evidence-2026-09-29-claude-review-1.1/probe-notes.mjs)）：
1. 对 Prompt 记一次使用（200）。
2. `POST /api/asset-activity` 反馈备注 `效果 4/5 分` → **400**“反馈请只填写效果评价，不含路径、链接或凭据”。
3. `A/B 两版都试过` → 400；`结构清楚` → 200。
4. 单元层另测 `中文/English`、`and/or`、`json/yaml`、`v1/v2`、`token: 省了很多` 全部被拒；`输入/输出都稳定` 通过（斜杠后是中文所以漏过，现有测试只覆盖了这一例）。

影响：1.2 真人验收时用户写评分或对比类备注会被拒，提示把正常评价说成含路径/凭据。修复方向：路径判定要求路径形态（行首或空白后的 `/`、`~/`、盘符、多段 `/a/b`），不对单个 `x/y` 报警；为上述样例补回归。放宽规则对已存数据安全（见 M2）。

### 有证据的维护债

**M1（低）确定性失败后仍提供“补记记录”，补记必然再次失败。**
`src/AssetUsage.jsx` 的 `submit` 只把 400 当确定失败；Skill 链接失效 410 或资产已归档 409 时，查询结果“不存在”→界面提示“可补记”→补记仍是 410/409。探针连续两次 410 已确认（[probe-http.log](evidence-2026-09-29-claude-review-1.1/probe-http.log)）。用户可用“暂不保存此记录”退出，不会重复计次或丢数据。建议 410 按确定失败处理并说明原因；409 需要区分 revision 冲突（可补记）与资产已归档（不可补记），例如为后者改用其他状态码或错误标识。

**M2（低）备注的启发式隐私规则在“读取主库”时执行。**
`validateActivity` 由 `validateState` 调用，而 `repository.read()` 每次都校验。今后若收紧规则，已保存的旧反馈会让整个主库读取失败（503“快照校验失败”）。建议约定此规则只放宽不收紧，或把启发式检查移到追加/导入时，读取时只做结构校验。

**M3（文档）PRD §10.5 仍写“资产阶段只按版本数”。** 契约已替换该规则，Codex 已在交接中说明。PRD 按 ROADMAP 分工由 Claude 维护，建议在用户验收阶段规则后更新。

### 待验证建议

- **S1 阶段体验需用户确认**：保存新版本后阶段回到成长期（契约“新版不继承旧版效果”）；保存路径的 “DIGIVOLUTION” 演出因新版本阶段不会更高而不再触发，达到完全体（经反馈）时也没有演出；幼年期、究极体当前不可达。规则诚实，但与 v4 “保存 = 进化”的体验不同，请在 1.2 中确认是否接受。
- **S2 usedAt 无下限**：只限制不晚于入库时间 + 60 秒，可回填任意早期时间（探针接受 2000 年）。仅本机已认证页面能写，风险低；可加“不早于所绑定版本的 at”。
- **S3 PRD §8.2 的“用在哪”**：目标 Agent 未记录。不属于 1.1 验收标准，留给后续交付回执能力。

## 6. 权限与边界

未读真实 Vault、凭据、私人会话或 `data/` 内容（只比对指针哈希）；未改真实 Agent 配置；未重启或停止 5178；未写 dist；未提交、推送。本轮只新增本复核文件和 `evidence-2026-09-29-claude-review-1.1/`（日志与探针），并更新 CURRENT。

## 7. 唯一下一步

**D1 修复后进入 ROADMAP 1.2 用户真实使用验收。**
- 修复由 **Codex** 做（它实现的模块，改动小：D1 必修，M1 可一并处理），按 COLLABORATION 认领；Claude 之后只复核修复差异，并重跑回归。
- 若用户希望更快，也可以跳过修复直接开始 1.2，但需要提前告知：备注里暂时不要写 `x/y` 形式的内容。
- M2、M3、S1–S3 不阻塞 1.2；S1 在 1.2 中由用户判断。
