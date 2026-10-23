# 设计类型C · 正式采用563

输入561 → 用户明确“确认” → 562认领 → 563完成；执行者Codex。

## 结果

设计功能前后端已正式采用，现运行 `/Users/nat/Library/Application Support/PersonalAIWorkbench/releases/wb-20261019-563`。原服务PID52498→23349，只执行一次bootout/bootstrap；没有重复kickstart或二次重启。正式HTML/JS/CSS/manifest/icon资源与发布文件逐字匹配。

数码世界桌面现有窗口已刷新，实际看到资产仓库「设计0」、新建默认选择设计、Skill包上传和调用名/生图要求字段；切换Prompt后显示直接调用说明。取消空表单，停留设计筛选，未创建测试资产、未调用生图或安装Skill。正式空表单截图见本任务outputs/设计类型-正式版表单.png。

采用前主库revision669，采用后及桌面回读后CURRENT.json指纹完全保持；数据目录和dataRootIdentity一致。随手记原生程序、偏好指纹不变。未替换桌面外壳、未改Agent配置/Vault，未提交推送或发外部消息。

## 发布完整性与首败

560冻结候选428项本身完整，但未包含原有收藏扩展9文件。正式预检在停服前识别遗漏并阻止发布；从已经逐字核验的正式555补入9项原文件，新发布完整437项，不带旧JS/CSS。业务改动仍17个既有运行源+新增design-asset.js；扩展没有业务改动。

独立复核437/437、无额外或缺失，9扩展与555一致，依赖链接仍指向原deps-20261016-539。冻结源、已验证构建没有新改动，沿用上一轮1389单元、设计专项/3套旧资产浏览器及T2证据；本轮未无意义重复全量测试。

## 证据与恢复

- work/design562/authorization.json、preflight.json、prepared.json：准确授权与采用前核验。
- release-manifest.json（437文件）、preserved-extension.json、review.md：完整发布与独立审查。
- stop-intent/stopped/start-intent/started.json：单次停止/启动回执。
- service-readback.json、ui-readback.json：正式服务、资源、数据和桌面表单回读。
- 私有备份位于work/design562/private-adoption-backup，目录0700、文件0600，已忽略Git；含采用前主库快照与服务plist。禁止外传或复制到用户输出目录。旧555发布保留。
- 原有共享dirty与根dist保持，CURRENT及issue-tracker更新；写入者释放。

回退仅在核对最新主库兼容性后进行。一旦用户创建Design真实数据，不可直接切回不认识Design的555后端，也不得覆盖新数据；须保留新库按兼容恢复处理。

唯一下一步：用户在资产仓库→设计→新建，导入自己的Skill包或填写Prompt并自然使用。真实Agent安装/生图及用户使用验收尚未代签，不再自动安装、调用、创建测试数据或重启。
