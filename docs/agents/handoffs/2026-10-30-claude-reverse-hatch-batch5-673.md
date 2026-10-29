# Claude 673：逆向孵蛋 3C 第 5 批 #31——REA 版本维护挪进设置

输入状态 WB-20261029-672（设置页 v19 PR #38 已合并 `4d4b5b1`）· 输出状态 WB-20261030-673
执行者：Claude（会话 local_8d9a380a）· worktree `.claude/worktrees/rea-settings`，分支 `claude/31-rea-settings`（基于 `4d4b5b1`）
依据：`docs/design/ui-v19/briefs/05-reverse-impl-plan.md` §4 第 5 批；issue #31；用户 10-29 定「放数据行下方的工具行、单独一个 PR」

## 改动

- `src/SettingsV16.jsx`：数据行下面加一行「工具」，放原样 `ReaUpdate`（组件、接口 `/api/reverse/update/*` 都没改）。
- `src/ReverseHatch.jsx`：撤掉页尾 `.rh-foot` 里的「工具」标题和 `<ReaUpdate />`；「把…移入回收区」保留，只在有标本时出现，区块名改「标本管理」。
- `src/reverse-v4.css`：REA 读数 `.gear*` 的作用域从 `.page-references.v16` 扩到 `:is(.page-references.v16, .settings-v16)`（`gear` 类名在项目空间另有用途，不改成全局）。更新预演抽屉 `.rea-update` 样式本来就不限页面，没动。
- `src/reverse-hatch.css`：删掉随之没用的 `.rh-foot h3`。
- 测试：`rea-update-browser`、`rea-update-recovery-browser` 入口改成 `#settings`（重进页面改成 世界总览 → 设置）；`reverse-hatch-browser` 原来等页尾「检查更新」，改成断言逆向页没有 REA 读数、没有「检查更新」。

## 验证

- 浏览器回归（临时构建 + 合成夹具，不碰 `data/` 与 5178）：`rea-update-browser`（1440/390/320 × 6 种状态）、`rea-update-recovery-browser`（三宽、刷新与重进、未决保护、axe）、`reverse-hatch-browser`、`settings-v16-browser` 全过。
- `npm test` 1615 条 1612 过：wiki-local、生产 factory 接线是已知基线；`reverse-ai-process` 的 Swift 编译用例满载超时（issue #6），单独重跑该文件 11/11。
- 对比图：`docs/design/ui-v19/shots/逆向第5批-REA挪进设置-对比.png`（设置 改前 / 改后，逆向页尾 改前 / 改后）。

## 未完成 / 下一步

- PR 等用户说「合并」。合并后 #31 可关；#27 只剩第 6 批 #32 发布到 5178，要用户另行授权（参照 `work/adopt-rh37/adopt.py`）。
- 主目录 `main` 停在 `eb97313`，带着 651 的未提交副本（内容已随 #38 合入）；要经用户同意后还原这些文件并快进到 origin/main。
- `ReverseV16.jsx`（未挂路由的旧页）仍引用 `ReaUpdate`，没动。

权限：只读合成夹具；未读真实 `data/`、Vault、Agent 会话；未碰正式 5178。本轮新坑：无。
