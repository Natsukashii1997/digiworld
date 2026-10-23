# 炉子 Agent迁移与上下文接力定向取证

输入状态：WB-20261016-530；执行认领531；输出状态：WB-20261016-532。执行者：Codex。

## 本轮授权与结果

用户要求先确认炉子实际页面，对齐标本后重跑，查清Agent迁移/上下文接力。用户手动启动独立Chrome并登录后执行。未自行启动浏览器或炉子桌面端，未执行真实迁移/会话提交/目标Agent配置写入。

实际入口 https://app.luzi.top/agents，DOM同时含/agents/migration与/agents/work-handoff。静态源确认migration是兼容跳转，实际操作回/agents迁移弹层；接力为独立桌面能力页。Web构建本机能力关闭。

标本b38a4c3b-44b8-4ac9-91f3-b13588608759仅改material.target.url（community→agents）、clues及updatedAt。revision201→202，独立回读确认；旧pack逐字段保留。免费预检ready且唯一精确匹配。启动一次Codex+REA运行c8c51efd-0aec-49a2-ad02-4e68de620ba9，2026-10-16 12:18:31至12:26:27 CST，REA6.4.0。最终completed，新pack选中，revision214，2个pack，busy=false/persistencePending=false，rawAvailable=true。

自动结果8条结论/9条未知，主要到路由与接口候选。页面识别一次、analyze_web_bundle两次（第二次查source maps，未提供），2个加载脚本解析失败0。不得把完成状态或unknowns空数组当功能验收。客户端输入352948（cached312320）、输出7861 tokens，费用未提供。

## 补充取证结论

通过REA inspect_web_page/export_web_scripts取得当前实际主脚本，取同源公开desktop桥接chunk，仅静态阅读。根代理和两个只读子代理分别核对迁移与接力；事实审查无重要发现。另只读核对已安装Luzi.app 0.2.2的有限字符串/符号，不运行或反汇编，未证明与网页构建完全一致。

- 迁移四层资产：指令、记忆、Skill、连接；capture→prepare→冲突选择→apply(plan_id)，目标多配置需选择。历史会话另走逐条prepare/apply，不混入资产计划；云端会话暂不恢复。
- 接力：按最近/来源/项目发现会话，实际单选，当前无项目路径会阻断；localReferences+projectRoot→prepare_work_handoff_local_prompt→prompt；再深链或复制/打开目标，由人发送。前端没有目标已接住的回执。
- 原生包存在format_local_prompt符号及读取历史材料、归纳原目标/完成未完成/停留位置、核对项目实际状态、说明下一步的模板片段。只支持候选机制，不证明完整prompt、截断算法或实际调用分支。
- 原生解析/摘要/截断、真实备份回滚、目标会话新建/复用、支持矩阵与真实接续效果仍未验证。resumeHint是历史会话迁移，不是接力恢复证据。
- 自动包中的context-packs仅为候选；补查主接力链走本地prompt与deep link/复制，不能将云接口串成必经步骤。自动包原样保留，独立报告补充证据。

## 证据与交付

用户报告：/Users/nat/Documents/Codex/2026-10-16/jie-s/outputs/炉子-Agent迁移与上下文接力-取证报告.md
实际入口截图：同outputs/炉子-Agent实际入口.png。

本聊天work/luzi531：delivery.json、page-entry-evidence.json、rea-session-final.json、source-capture.json、scripts/manifest.json、migration-analysis.md、handoff-analysis.md、desktop-chunk-source.json、native-literal-evidence.json、specimen-before/aligned/result.json、precheck.json、request/start/query.json、workbench-web-bundle[-maps]-evidence.json。原始CLI事件在项目data/reverse-evidence/上述record/run目录。

主脚本SHA256 2ed2ffd6f3052419a16b4ad54144d20a885f423c03b7959c19fd3ea1f313c30b；桥接7899d3dc2585e0edd7590fdbd62b450a6830c1ebac89329d222b48d3cb9d69b4；本机native aec73aab1db46c7ff401ee861f61860ca168ed977a10c29c3f703e3854ee747f。

启动初期无事件，1秒采样显示rollout解码、本次sqlite有更新；随后正常进入REA并完成。没有追查全局私人会话或修配置。早期Python证书库读取公开chunk失败，系统curl保留TLS校验成功；未关闭证书校验。

## 改动边界与下一步

本轮改动仅上述真实标本、运行证据与CURRENT/交接；无源码、测试、dist改动或重启/部署/安装。源实现仍含530首页和528随手记待验候选，未采用；这些验收门禁继续保留。未做真实迁移或真人接续验收，也未启动完整原生逆向/复刻。

唯一下一步：依据取证结论收敛智能体群的会话查找与上下文接续方案；真实目标写入、桌面实验及功能实现按后续明确范围处理。写入者释放，待另一方读取，不宣称已交接到其会话。
