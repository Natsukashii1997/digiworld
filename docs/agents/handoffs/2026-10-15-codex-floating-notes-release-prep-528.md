# 桌面随手记：上线准备、备份与回退交回528

输入WB-20261015-526，认领527，输出 **WB-20261015-528**，写入者释放。常浩明确只授权先做好上线准备、备份和回退；Claude视觉复核通过后，正式接入和安装仍由常浩另行确认。

## 本轮完成

已保存限定范围备份：当前正式前端19文件、526候选前端19文件与原生App、当前相关源码/锁文件、经519基线验证的功能前server源码159文件，以及revision197主数据指针与其对应不可变快照。总计 **616文件、25,745,971字节**，目录在Git忽略范围，主数据文件0600、目录0700。没有读取并转存无关凭据或整套私密运行账本。

已实际复制到新的隔离恢复目录，逐一验证SHA、大小、权限、数据指针与快照revision/SHA，**616/616通过**；备份与恢复后的原生App签名均通过。只验证文件恢复，没有启动恢复后的真实业务数据、运行调度器或重放业务。不是整机灾备，也不把源码备份说成旧运行进程内存备份。

执行单已写明前后端一起接入、固定服务身份与单次重启、个人应用目录安装、全程回读以及各失败阶段的回退。独立只读复核通过。拟安装`/Users/nat/Applications/随手记.app`；复用已测App的相邻`FloatingNotesState`恢复区，预检两处均不存在，正式安装前必须重查。未安装、未加登录项。

## 成果指针

- [完整上线与回退执行单](evidence-2026-10-15-codex-floating-notes-release527/RELEASE-PLAN.md)
- [备份目录](evidence-2026-10-15-codex-floating-notes-release527/bundle/)
- [逐文件清单](evidence-2026-10-15-codex-floating-notes-release527/bundle-manifest.json)，SHA256：`3b21891c7a2079ddb831ac44893e44f4229a2b50fe3339f51c53f18ca6ea53b4`
- [隔离恢复结果](evidence-2026-10-15-codex-floating-notes-release527/restore-verification.json)、[只读自检脚本](evidence-2026-10-15-codex-floating-notes-release527/verify-backup.py)
- [正式环境保护回读](evidence-2026-10-15-codex-floating-notes-release527/protection-final.json)、[安装落点预检](evidence-2026-10-15-codex-floating-notes-release527/install-preflight.json)
- [独立审查结论](evidence-2026-10-15-codex-floating-notes-release527/independent-review.md)

备份含真实主数据，仅本机保留。给Claude共享的是同一工作区的执行单与交接指针，不向外传输数据包。没有发送消息，不代签Claude已读。

## 关键回退规则

默认先停用便签App、恢复旧网页；健康且兼容的新后端可暂留。确属后端故障时，核对没有后续漂移并获得恢复重启授权，才恢复http/repository两个已验证前像及旧网页；不整仓覆盖，新增notes模块可留作未导入文件。App撤回时保留恢复区原路径。

**程序回退保留最新主库与未保存草稿。**不得拿今天revision197或上线前旧指针直接覆盖上线后数据。涉及数据恢复时，先保全当时最新快照和草稿，在隔离目录按便签ID/正文核对，再另获数据恢复授权。正式采用前重新备份最新版本，本次准备快照不取代届时备份。

## 保全与未完成

收尾回读：正式服务仍PID29709/runs4，LaunchAgent未改，正式dist19文件、主库指针、源码、依赖与HEAD未变；9项允许路由的HTTP资源匹配。10个theme/digievolution磁盘文件当前路由返回404，原始失败字段保留并分类，不虚称19项HTTP全通过。全部429项起始保护中，收尾只允许CURRENT及issue-tracker协作文档变化。

526候选本轮未修改或重建；沿用已通过的基本路径/单元/浏览器/原生证据，没有重复快捷键或全屏测试。全屏隐藏已知未通过、真实中文候选窗点击未验继续如实保留；本轮没有替代Claude视觉复核。

本轮只新增准备证据与此交接、更新CURRENT和issue-tracker；没有正式接入、安装、服务重启、真实数据写入、依赖变更或Git提交推送。

**唯一下一步：**Claude读取CURRENT，对526固定候选完成视觉复核；通过后等待常浩确认正式接入及安装，再由Codex按执行单重新预检、刷新备份和采用。
