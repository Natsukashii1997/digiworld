# 2026-09-30 云端环境差异诊断（Claude Code 云端会话，定时任务）

> 云端工作副本结果，非权威。本次**只诊断，不修**：未修改 `src/`、`server/`、`tests/`、`package*.json`、既有文档或 CURRENT.md。本分支只新增本文件、`cloud-env-diff-probes/`（探针）和 `cloud-env-diff-logs/`（纯文本日志）。未开 PR，未推 main。上一轮回归报告只用 `git show origin/cloud/2026-09-30-baseline-regression-2:…` 读取，没有合并。

## 结论速览

| 项 | 结论 |
|---|---|
| 基点 | `main @ 6d93fd6`（分支 `cloud/2026-09-30-env-diff`） |
| 环境 | Linux 6.18 / ext4 / 4 vCPU / Node v24.21.0；root（uid 0）与新建普通用户 `tester`（uid 1001）各跑一遍（`cloud-env-diff-logs/00-environment.txt`） |
| **主根因** | `server/config-file.mjs:148` 的 `defaultMetadataCheck` 在 `process.platform !== "darwin"` 时**直接拒绝写入**（“此平台尚不能可靠核验配置扩展属性，未写入”）。这是产品有意设置的平台守卫：macOS 上它用 `/bin/ls -lde` 和 `/usr/bin/xattr` 核验 ACL 与 `com.apple.provenance`。在 Linux 上，`atomicReplaceConfig` 在建临时文件之前就被拦下，文件不变，于是所有“写入 → 回读”的用例都读到 `matches_before`。agent-config 恢复类 11 个、rule-templates 4 个、挂起的 D-R5、之前被挂起遮住的 D-R6，以及 3 个同源浏览器失败都是这个原因 |
| 挂起 | **已查明**。D-R5 的钩子只在 rename `.guiji-config-*` 临时文件时触发，但 Linux 上写入在 rename 之前就被守卫拦下，所以测试体里的 `await renaming` 永远不会 resolve，`finally` 里的 `release()` 和 `app.close()` 也不会执行。Node 24.21 的 `node:test` 在测试体挂起期间会保留一个 ref 的内部 `Timeout`，事件循环不会排空，所以进程不会自己报 cancelled，而是一直挂到外层 `timeout`。详见 §3 |
| 非 root 对照 | 换成非 root **只消除 1 个**：`skill-files.test.mjs:198`。其余 18 个已知失败，以及 D-R5、D-R6 和 3 个浏览器失败，在非 root 下**照样失败**，失败原文相同 |
| 守卫打桩对照 | 只在探针副本里把非 darwin 分支改为返回“无扩展属性”（`cloud-env-diff-logs/15-stub-diff.txt`），非 root 全量 `npm test` 从 fail 20 降到 **fail 3**（只剩 plutil、ChatGPT.app、wiki-local 三个本机工具依赖），3 个浏览器脚本全部通过。这说明 Linux 的 rename、inode、权限位、uid/gid、fsync、BOM/CRLF 字节语义本身**没有**造成任何失败 |
| 分类（24 个失败） | **A 23 个**（npm 18 + D-R5 + D-R6 + 浏览器 3）/ **B 1 个**（skill-files；另外 D-R4 在 A 之下还叠加一层 B）/ **C 0 个** / **D 0 个**。另有 2 个时序类（interaction、search）属于机器性能或帧节奏差异，不计入 A–D |
| 真实产品缺陷 | **未发现**（§5 列出一条观察，不构成 D） |

## 1. 做了什么（方法）

1. 读取 CLOUD-SESSIONS.md §3、AGENTS.md，用 `git show` 读取上一轮回归报告和 `05-npm-test-failures.txt`。
2. **非 root 对照**：`useradd -m tester`，用 `tar --exclude=.git` 把仓库（含 `node_modules`、`dist`）复制到 `/home/tester/pw` 并 `chown`，再用 `su tester` 和同一个 `/opt/nvm` 的 Node 24 运行。
3. 按文件对照（`cloud-env-diff-probes/run-matrix.sh`）：7 个相关文件逐个执行 `node --test --test-timeout=30000`，分别在 root、非 root、root+打桩、非 root+打桩下运行（日志在 `cloud-env-diff-logs/matrix/`）。
4. 全量对照：`timeout 1200 node --test --test-timeout=60000 tests/*.test.mjs`，分别在 root、非 root、非 root+打桩下运行（日志在 `cloud-env-diff-logs/full/`）。
5. 浏览器对照：3 个同源脚本分别在 root、非 root、root+打桩、非 root+打桩下运行（日志在 `cloud-env-diff-logs/browser/`）；2 个时序脚本在空闲机器上 root 和非 root 各跑 3 次（日志在 `cloud-env-diff-logs/timing/`）。
6. 探针（都在 `cloud-env-diff-probes/`，只在临时目录或探针副本中运行）：

| 探针 | 用途 | 输出 |
|---|---|---|
| `probe-metadata-guard.mjs` | 直接调用 `atomicReplaceConfig`，追踪 `open`/`rename`：默认守卫下是否调用 rename；注入 `checkMetadata` 后，Linux 上的 rename/inode 语义是否可用 | `10-probe-metadata-guard.txt` |
| `probe-root-permission.mjs` | 比较 root 与普通用户读取 `0o000` 文件、在 `0o555` 目录建文件的结果 | `11-probe-root-permission.txt` |
| `probe-d-r5-hang.mjs` | 复现 D-R5 步骤，给 `await renaming` 加 5 秒观察窗，打印文件系统调用序列与存活资源 | `12-probe-d-r5-hang.txt` |
| `preload-active-handles.mjs` + `minimal-never-resolves.test.mjs` | 定位是什么让事件循环不排空；最小对照 | `13-hang-event-loop.txt` |
| `probe-press-timing.mjs` | 拆解按下后 `transform` 过渡的开始、结束时刻，以及 rAF 帧节奏 | `14-probe-press-timing.txt` |
| `stub-metadata-check.sh` | **只在复制出来的探针副本里**把守卫的非 darwin 分支替换为“无扩展属性”（替换前会检查守卫行存在） | `15-stub-diff.txt` |

## 2. 对照实验结果表

列说明：**root / 非 root** 为原样代码；**+打桩** 为探针副本（仅守卫打桩）。✅ 通过，❌ 失败，⏱ 超时（`--test-timeout`）。

### 2.1 `npm test` 已知 19 个 + 被挂起遮住的 2 个

| # | 用例（文件:行） | root | 非 root | root+打桩 | 非 root+打桩 | 分类 |
|---|---|---|---|---|---|---|
| 1 | agent-config-http:94 HTTP 回读并恢复原字节与权限 | ❌ | ❌ | ✅ | ✅ | A |
| 2 | agent-config:217 changed binding blocks restoring | ❌ | ❌ | ✅ | ✅ | A |
| 3 | agent-config:299 replacing Home inode | ❌ | ❌ | ✅ | ✅ | A |
| 4 | agent-config:333 BOM/Unicode/CRLF | ❌ | ❌ | ✅ | ✅ | A |
| 5 | agent-config:371 missing journal record | ❌ | ❌ | ✅ | ✅ | A |
| 6 | agent-config:522 rename followed by failure | ❌ | ❌ | ✅ | ✅ | A |
| 7 | agent-config:560 Hermes YAML booleans | ❌ | ❌ | ✅ | ✅ | A |
| 8 | agent-config:624 receipt failure after write | ❌ | ❌ | ✅ | ✅ | A |
| 9 | agent-config:672 forged inverse patch | ❌ | ❌ | ✅ | ✅ | A |
| 10 | agent-config:694 restart recovery | ❌ | ❌ | ✅ | ✅ | A |
| 11 | agent-config:729 confirmed apply journal | ❌ | ❌ | ✅ | ✅ | A |
| 12 | agent-programs:424 二进制 plist（`/usr/bin/plutil`） | ❌ | ❌ | ❌ | ❌ | A |
| 13 | discovery:93 ChatGPT.app bundle 身份 | ❌ | ❌ | ❌ | ❌ | A |
| 14 | knowledge-writeback:310 wiki-local 解析 | ❌ | ❌ | ❌ | ❌ | A |
| 15 | rule-templates:236 装入/升级/撤回 | ❌ | ❌ | ✅ | ✅ | A |
| 16 | rule-templates:293 区块手改 drift | ❌ | ❌ | ✅ | ✅ | A |
| 17 | rule-templates:396 同一令牌只写一次 | ❌ | ❌ | ✅ | ✅ | A |
| 18 | rule-templates:470 D-R4 | ❌ | ❌ | ❌（B：写入成功，`completedAt` 非空） | ✅ | A（叠加 B） |
| 19 | skill-files:198 权限失败 | ❌ | ✅ | ❌ | ✅ | **B** |
| 20 | rule-templates:503 D-R5（原“挂起”） | ⏱ | ⏱ | ✅ | ✅ | A（测试写法放大为挂起，见 §3） |
| 21 | rule-templates:541 D-R6（原“无结果”） | ❌ | ❌ | ✅ | ✅ | A |

全量汇总（`full/*.txt`，都加了 `--test-timeout=60000`，没有挂起）：

| 配置 | tests | pass | fail | cancelled | skipped | 耗时 |
|---|---|---|---|---|---|---|
| root | 427 | 401 | 20 | 1 | 5 | 67s |
| 非 root | 427 | 402 | 19 | 1 | 5 | 67s |
| 非 root + 守卫打桩 | 427 | 419 | 3 | 0 | 5 | 15s |

注：`cancelled 1` 是 D-R5 超时之后，runner 把它未完成的 Promise 记为取消；fail 计数里也包含 D-R5 的超时。所以 root 下失败条目共 21 条，即已知 19 条加 D-R5、D-R6。tests 为 427，和本机一致。

### 2.2 浏览器脚本

| 脚本 | root | 非 root | root+打桩 | 非 root+打桩 | 分类 |
|---|---|---|---|---|---|
| agent-config-browser | ❌（恢复后仍为 `true`） | ❌ | ✅ | ✅ | A |
| rule-templates-browser | ❌（等待“已写入，回读一致”超时） | ❌ | ✅ | ✅ | A |
| rule-templates-fix-browser | ❌（`matches_before`） | ❌ | ✅ | ✅ | A |
| interaction-browser | ✅✅✅（空闲机器 3/3；上一轮 0/2） | ✅✅✅ | — | — | 时序 |
| search-browser | ❌ 507 / ❌ 600 / ✅ 396（palette-cold ms） | ❌ 559 / ✅ 322 / ✅ 346 | — | — | 时序 |

## 3. 挂起的根因（rule-templates.test.mjs，D-R4 之后无输出）

证据：`12-probe-d-r5-hang.txt`、`13-hang-event-loop.txt`、`matrix/*-rule-templates.txt`。

1. **等待的 Promise**：`tests/rule-templates.test.mjs:526` 的 `await renaming`。`renaming` 只会由第 515–518 行注入的 `filesystem.rename` 在 `from.includes(".guiji-config-")` 时 resolve。
2. **为什么永远不会 resolve**：`rules.apply` 调用 `atomicReplaceConfig`。它在创建 `.guiji-config-*.tmp` 之前，先执行 `checkMetadata(path)`（`server/config-file.mjs:255`），在 Linux 上直接抛出 403。探针记录的文件系统调用序列是：`open AGENTS.md | open AGENTS.md | open data | open .<uuid>.tmp | rename | …`。其中唯一一次 `rename` 是操作记录（journal）自己的临时文件改名（在 `data/` 下，不含 `.guiji-config-`），**配置临时文件从未被创建或改名**。`apply` 在约 10ms 后就返回了 `status=matches_before completedAt=null`。root 与非 root 下完全一样。
3. **为什么挂 20 分钟而不是立即报 cancelled**：探针在挂起期间打印的存活资源是 `resources=["Timeout"] handles=[]`，没有 socket、server 或文件句柄。最小对照 `minimal-never-resolves.test.mjs`（测试体只有 `await new Promise(() => {})`）在 `node --test`、`--test-isolation=none` 和直接 `node 文件` 三种方式下**都挂到 timeout**，存活资源同样只有 1 个 `Timeout`；而普通脚本 `node -e "new Promise(()=>{})"` 立即退出。所以这是 Node v24.21 的 `node:test` 在测试体未完成时保留的 ref 定时器，与本项目、Linux 和 root 都无关。上一轮日志里的 `'Promise resolution is still pending but the event loop has already resolved'` 是外层 SIGTERM 收尾时打印的，不是自然结束。`server/delivery.mjs:16` 的 30 秒 `setInterval` 已经 `unref()`，**不是**这个定时器（已用预加载探针核对）。
4. **结论**：触发条件是 A 类的平台守卫；D-R5 的写法把“写入没有走到 rename”变成了**无限等待**，而不是一次断言失败。在 macOS 上，只要将来有任何回归让 rename 之前就失败（例如 ACL、xattr 核验失败或范围变化），D-R5 也会同样挂起。这属于测试健壮性问题，不是产品缺陷。
5. **D-R6 不是独立问题**：以前没有结果只是因为排在 D-R5 后面；加了 `--test-timeout` 之后它运行了，失败原因与 #15–17 相同（`matches_before`）。打桩后通过。

## 4. 每类的机制证据与建议修法（只写建议，未实施）

### A 类：测试依赖 macOS 或本机工具（23 个）

**A1. 配置写入的平台守卫（npm 18 个中的 15 个 + D-R5 + D-R6 + 浏览器 3 个 = 20 个）**
- 机制：`server/config-file.mjs:147-149`：
  ```js
  async function defaultMetadataCheck(path, options = {}) {
    if (process.platform !== "darwin")
      throw fail("此平台尚不能可靠核验配置扩展属性，未写入");
  ```
  `atomicReplaceConfig` 的第一次 `checkMetadata(path)` 在建临时文件之前执行，所以文件字节和 inode 都不变（`10-probe-metadata-guard.txt`：`rename 是否被调用: false`、`inode 不变: true`）。`agent-config.mjs` 和 `rule-templates.mjs` 捕获异常后调用 `checkOperation`，因为当前 hash 等于 `beforeHash`，所以返回 `matches_before` + `completedAt: null`。后续的恢复（`reverse`）因为 `file.hash !== row.afterHash`，抛出“文件与原操作结果不一致，不能恢复”（#5、#9 的原文）。#16 的 `'append' !== 'drift'` 和 #18 的 `versionId: null`，都是因为第一次装入就没有真正写入，文件里没有区块、也没有已完成的安装记录。
- 为什么判为 A 而不是 C：守卫是**产品有意设计**，理由写在代码注释里：只允许 macOS 上可核验的 ACL/xattr 语义，Linux 没有等价核验就拒绝写入，这符合“权限和目录身份校验、写后回读”的业务约束。打桩后同一批测试在 Linux 的 root 和非 root 下全部通过，说明 rename、inode、`fsync`、`chown/chmod`、字节偏移补丁在 ext4 上与 macOS 的行为**没有差异**，所以没有 C。
- 为什么 macOS 本机通过：`process.platform === "darwin"`，并且有 `/bin/ls -lde`、`/usr/bin/xattr`。
- 建议修法（二选一，由本机会话决定）：
  1. **推荐**：沿用 `tests/config-file.test.mjs:302/342/496` 已有的写法，给这 15 个 npm 用例加 `{ skip: process.platform !== "darwin" }`（跳过原因写“macOS 配置写入器”）；3 个浏览器脚本在非 darwin 上整体跳过，或者只跳过写入段。另外补一个**只在非 darwin 上运行**的用例，断言守卫的对外语义：apply 返回 `matches_before`、`completedAt: null`，文件字节和 inode 不变，并给出“执行未确认完成”的提示。这样云端也有覆盖。
  2. 让 `createAgentConfig`/`createRuleTemplates`/`startServer` 接受 `checkMetadata` 注入（目前只透传 `filesystem`），测试在非 darwin 上注入“无扩展属性”的实现。代价是改动生产代码的依赖注入面，而且 xattr 核验路径在 Linux 上仍然没有覆盖。
- D-R5 另需加固（与平台无关）：把 `await renaming` 改成与 `applying` 竞争，例如 `await Promise.race([renaming, applying.then(() => { throw new Error("写入未走到 rename") })])`，这样前置失败会变成立即断言失败，不再无限等待。也可以在 `package.json` 的 `test` 脚本加 `--test-timeout`（例如 120000）作为全局兜底。两处都属于测试文件或配置改动，需要本机认领。

**A2. `/usr/bin/plutil`（agent-programs:424、discovery:93，共 2 个）**
- 机制：`server/agent-programs.mjs:162` 固定调用 `/usr/bin/plutil -convert json` 解析 Info.plist；Linux 上没有这个程序（`00-environment.txt`：`ls: cannot access '/usr/bin/plutil'`）。agent-programs 的测试自己也用 `plutil -convert binary1` 生成二进制 plist，直接报 `spawn /usr/bin/plutil ENOENT`。discovery 里 `parsePlist` 被拒绝后，身份状态为 `blocked`，所以 Codex 的 `programs` 为 `[]`。
- 建议：测试加 `{ skip: !existsSync("/usr/bin/plutil") }`；或者 discovery 测试通过 `detectAgents` 透传已经存在的 `plistParser` 注入点（`inspectAppIdentity` 已支持），用 JSON 解析器替代。产品只在 macOS 运行，不需要处理。

**A3. 本机 wiki-local helper（knowledge-writeback:310，1 个）**
- 机制：测试读取 `process.env.GUIJI_WIKI_HELPER || tests/../../wiki-local/wiki.py`，也就是仓库**上级目录**的本机工具。云端的 `/home/user/wiki-local/wiki.py` 不存在（`FileNotFoundError`）。
- 建议：helper 不存在时 `skip`，并写明原因；不要把私人 helper 放进仓库。

### B 类：仅 root 权限语义（1 个，另有 1 处叠加）

**B1. skill-files:198**
- 机制：测试用 `chmod 0o000` 制造“权限失败”。root 拥有 `CAP_DAC_OVERRIDE`，`open(O_RDONLY)` 不检查权限位，读取成功，所以 `assert.rejects` 报 `Missing expected rejection`。探针 `11-probe-root-permission.txt` 显示：uid 0 读取 `0o000` 文件成功，uid 1001 返回 `EACCES`。在非 root 下运行即通过（`matrix/nonroot-skill-files.txt` 16/16）。
- 建议：测试加 `{ skip: process.getuid?.() === 0 }`；或者改用注入 `filesystem` 抛出 `EACCES` 的方式模拟，这样与运行身份无关。

**B2（叠加在 A 之下）. D-R4（rule-templates:470）**
- 机制：D-R4 用 `chmod(app.root, 0o555)` 让临时文件无法创建。守卫打桩后，**root 下仍然失败**：写入实际成功，`completedAt` 非空。非 root 下通过。探针显示 uid 0 在 `0o555` 目录中建文件成功。
- 建议：与 B1 相同，改用注入 `filesystem.open` 对 `.guiji-config-` 临时文件抛出 `EACCES`，不依赖运行身份。

### C 类：Linux 文件系统语义差异（0 个）

打桩对照已经排除。已覆盖的语义包括：rename 替换 inode（agent-config:299）、权限位与 uid/gid 保留（agent-config-http:94）、BOM/CRLF 字节偏移（agent-config:333）、fsync 目录、`O_NOFOLLOW`/`O_EXCL`、约 140 KiB 的大记录（D-R6）。这些在 ext4 上的 root 和非 root 下全部通过。未覆盖的只有 ACL/xattr 核验本身，它在 Linux 上被守卫主动禁用，不能与 macOS 比较（见 §6）。

### D 类：真实产品缺陷（0 个）

没有发现在 macOS 上也会触发的产品逻辑缺陷。

### 时序类：2 个，判断为纯机器性能或帧节奏差异

- **interaction-browser:38（按下 150ms 后位移 3px）**：按键过渡是 `transform 0.08s`（`src/interaction.css:11`）。探针在空闲机器上测得 rAF p50 16.7ms、p90 16.8–33.3ms；`:active` 过渡在采样起点后 30–69ms 开始移动，95–135ms 到达 3px（两轮共 16 次），距 150ms 断言点**只剩约 15–50ms 余量**。无 GPU 的 headless shell 在忙时会掉帧，过渡起点被推迟，于是出现上一轮的 2.93/2.99。本轮空闲机器上 root 3/3、非 root 3/3 通过，与 root 无关。建议：断言改为轮询等待（例如 `waitForFunction` 等 transform 到 3px，并设上限），或者等 `el.getAnimations()` 全部 `finished` 后再读取；不要单纯加长固定等待。
- **search-browser:283（命令面板冷启动 ≤ 500ms）**：本轮 6 次中 palette-cold 为 322–600ms，3 次超过预算；warm 62–193ms、library 113–233ms 都达标。root 与非 root 都有超标，也都有达标，与身份无关。原因是冷启动时对约 22 MB 正文首次建索引或首次过滤，属于 CPU 绑定，4 vCPU 云主机与本机性能不同。建议：云端只记录 TIMING，不作为性能门禁；性能门禁以本机为准。

## 5. 观察（不构成 D，供本机参考）

- 在非 darwin 上，preview 可以正常生成，但 apply 必然在 `journal.prepare` 之后被守卫拦下，留下一条永远 pending、状态为 `matches_before` 的记录。代码注释明确规定调用 `atomicReplaceConfig` 之后不能宣称“未开始”，所以这符合现有设计；产品只在 macOS 运行，也不会遇到。如果将来支持 Linux，更好的做法是在 preview 阶段就提示“此平台不支持写入”，而不是先落记录。
- 以 `tester` 身份运行 Node 时会出现一行 `Warning: Ignoring extra certs from /root/.ccr/ca-bundle.crt … Permission denied`：会话级 `NODE_EXTRA_CA_CERTS` 指向 root 目录。测试不访问外网，这行警告不影响结果。

## 6. 未查明项

- ACL/xattr 核验路径（`defaultMetadataCheck` 的 darwin 分支）在云端**无法验证**：Linux 上没有 `/usr/bin/xattr`、`com.apple.provenance`，`ls -lde` 的语义也不同。它只能由本机覆盖。
- interaction 和 search 的时序余量只在云端测过，本机的实际余量（尤其是 search 冷启动的 ms 数）未知，建议本机记录一次 TIMING 作为对比基线。
- 没有在 macOS 上实测 §3 第 4 点“D-R5 在 rename 前失败时也会挂起”的推论；不过最小对照已经证明 Node 24 的 `node:test` 对无限等待的测试体不会自行结束，这一行为与平台无关。

## 7. 对 CLOUD-SESSIONS.md §3 的修订建议（云端标准跑法，由本机会话决定是否采纳）

1. **以非 root 身份运行**，消除 B 类：
   ```bash
   id tester >/dev/null 2>&1 || useradd -m tester
   mkdir -p /home/tester/pw && tar --exclude=.git -C <仓库> -cf - . | tar -xf - -C /home/tester/pw
   chown -R tester:tester /home/tester/pw
   su tester -c 'export NVM_DIR=/opt/nvm; . "$NVM_DIR/nvm.sh" >/dev/null; nvm use 24 >/dev/null; cd ~/pw; <命令>'
   ```
   注意：`su`（不带 `-`）会保留 `PLAYWRIGHT_MODULE` 和 `PLAYWRIGHT_BROWSERS_PATH`；`/opt/nvm` 和 `/opt/pw-browsers` 对普通用户可读。
2. **npm test 改为带单测超时，防止挂起**（只给无限等待设上限，不改断言，也不放宽任何已有超时；是否算“改变调用方式”由用户决定）：
   ```bash
   timeout 1200 node --test --test-timeout=60000 tests/*.test.mjs
   ```
   实测 67 秒跑完，不再占满 20 分钟。
3. **云端已知失败集更新为（非 root，基点 6d93fd6）**：fail 19 + cancelled 1，全部为 A 类，逐条列出：agent-config-http:94；agent-config:217/299/333/371/522/560/624/672/694/729；agent-programs:424；discovery:93；knowledge-writeback:310；rule-templates:236/293/396/470/503(D-R5 超时)/541(D-R6)。以 root 运行时再加 skill-files:198（B）。本机会话按 §4 A1 加上平台 skip 后，云端非 root 的期望应为 **0 失败**（skip 数相应增加）。
4. **浏览器脚本**：云端预期 25/28 必过。agent-config-browser、rule-templates-browser、rule-templates-fix-browser 在 Linux 上必然失败（A1），应排除或在脚本内按平台跳过写入段；interaction-browser 和 search-browser 只作参考（时序），失败时报告 TIMING 数值，不计为回归。
5. 在第 3 条落地之前，云端回归只看“相对上述已知集的增减”。

## 8. 本分支新增文件

- `docs/agents/handoffs/2026-09-30-cloud-env-diff.md`（本文件）
- `docs/agents/handoffs/cloud-env-diff-probes/`：`run-matrix.sh`、`stub-metadata-check.sh`、`probe-metadata-guard.mjs`、`probe-root-permission.mjs`、`probe-d-r5-hang.mjs`、`preload-active-handles.mjs`、`minimal-never-resolves.test.mjs`、`probe-press-timing.mjs`
- `docs/agents/handoffs/cloud-env-diff-logs/`：`00-environment.txt`、`10`–`15` 探针输出；`matrix/`（按文件 × 4 种配置）、`full/`（全量 × 3 种配置）、`browser/`（3 个同源脚本 × 4 种配置）、`timing/`（2 个时序脚本 × root/非 root × 3 次）

未改动任何既有文件，因此没有前后 SHA256 需要比对；`git diff --stat 6d93fd6` 只包含上述新增路径。探针副本（`/home/tester/pw-stub`）只存在于本容器中，没有入库。

## 9. 提前结束说明

用户要求停止后续实验时，本任务范围内的对照实验、探针、归类和交接文字**都已完成**，并已在提交 `11ea310` 中推送。因此没有需要标注“因用户要求提前结束而未完成”的任务项。收到要求后没有再开始任何测试或循环，也没有后台进程在运行。§6 的未查明项是云端条件无法验证的内容，与提前结束无关。
