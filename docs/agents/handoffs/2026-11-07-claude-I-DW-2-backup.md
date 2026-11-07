# Claude 695：I-DW-2 快照备份与 5 个旧 Skill 去向（2026-11-07）

- **输入状态**：WB-20261107-694；main `62284a2`；数据 revision 1046（`1ee90f28…`）。只读操作，**没有改动、删除 data/ 下任何文件**。
- **证据目录**（本机，权限 700，不入库）：`~/Library/Application Support/PersonalAIWorkbench/evidence/I-DW-2-20261107/`
  - `data-backup.tgz`：整个 `data/`（2912 个文件，打包 518 MB），sha256 `32f7265c…`（全文见同名 .sha256）。
  - `manifest.json`：revision、快照 sha256、按类型的资产数，5 个 Skill 每个版本每个文件的路径、字节数、mode、sha256。
  - `skills/`：5 个 Skill 的原文件按版本导出。
  - `restore-drill.log`、`compare-my-skills.log`。
- **恢复演练**：把备份解压到证据目录下的临时位置后核对，结果是：
  - 文件数 2912 = 2912，大小不同的文件 0 个；
  - CURRENT 指向 revision 1046，快照 sha256 校验通过；
  - 资产数（Prompt 8、Skill 5、Rule 4、Workflow 2、Design 1）与清单一致；
  - 5 个 Skill 共 28 个文件，哈希不符 0 个；导出文件落盘校验不符 0 个。

  演练副本已删除，日志保留。没有启动服务做恢复（只做了文件和数据层面的核对）。
- **与 my-skills 比对**：5 个都没有同名目录，也没有内容相同的文件。
- **5 个旧 Skill 的去向**：

| 资产 | 状态 | 实际是什么 | 去向 |
|---|---|---|---|
| concept map webapp builder（`d04ba1b7`，21 个文件） | 已归档 | **常浩自己的 Skill**：PROVENANCE 写明 09-16 由 Codex 从常浩维护的 research-skills 仓库整理成分享包；另一份实体装在 `~/.codex/skills/`（SKILL.md 逐字节相同），不在 my-skills | 已开 my-skills 候选 [#70](https://github.com/Natsukashii1997/my-skills/issues/70) 走七站收编或退役；数码世界这份只留备份 |
| deep-research (1)（`c0828e6f`，2 个文件） | 已归档 | 第三方（LICENSE：Bytedance） | 只留备份；要关注原仓库就去 GitHub 中心收藏 |
| 设计的最后一公里（`3bb96f2e`） | 已归档 | 内置示例（`demo=true`） | 只留备份 |
| 有依据的深度研究（`4c51eed2`） | 已归档 | 内置示例（`demo=true`） | 只留备份 |
| 验收 · 原生 REA 全能力 · 自建样本 · 拆解（`97bae4cb`） | 在用 | 逆向功能的**验收样本**：正文写明「自行编译的验收样本……未经复刻验证」 | 只留备份；**不开 my-skills 候选**，因为它不是可复用的方法。执行单原写「REA 样本开候选」，按实情改为 concept-map |

- **更正**：V1.3 说「5 个都是自上传、第三方 0」，这是按「安装地址形态」算的。按内容算，其中 1 个是第三方（deep-research）、2 个是示例、1 个是验收样本，只有 concept-map 是常浩自建。
- **没做**：没有删除任何资产或数据；物理删除要等 I-DW-6 新面板验收后，再单独请常浩授权。
- **下一步**：I-DW-3 下线可编辑项目目录与扫描写入。
