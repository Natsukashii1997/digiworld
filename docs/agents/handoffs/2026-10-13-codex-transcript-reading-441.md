# 文稿与连续阅读采用441

输入439 → 认领440 → 输出441。根代理Codex串行写，只读子代理分别做质量对照/正确性审查/职责简洁性与T2；没有向其他用户任务发送消息。

## 结果与用户决定

用户要求修文稿识别，用刚才Kimi视频验证搜索和Agent读取；视频去图片文字板块，信息取消分页一直下拉。随后明确Kimi保持已删除，只隔离验证；批准固定SHA约256MB模型下载、本地对照；知晓Agent Swarms/MuonClip专名限制后批准本版启用及一次5178重启。上述已执行。没有恢复Kimi、改真实文稿或分组，没有上传视频或付费服务。

识别从中文固定系统优先改为现有SenseVoice多语言优先；系统降级显示“文稿需要核对”，空文稿不再标ready，引擎来源随导入/重分析保存。视频OCR页签、默认选页及内容均移除（依据note.type，包括无本地视频状态），图文保留；正文、视频文稿改完整连续滚动。MCP搜索摘要返回实际命中文稿段落及时间，read_saved_note保持全文。

## 证据与限制

- 同一Kimi作品7664016553972731199，2353.6秒。原视频已随用户删除进入系统废纸篓，macOS拒绝读取；未绕过权限。改从当前可见抖音播放器取得同作品另一HEVC码率副本，只在隔离目录。输入SHA `3d51f6b482c7668f1d48a2ab7ce4b3710ee69847f5a8fcf6b563fb3a649504e8`，不冒称与旧文件字节相同。
- 首55秒同音频系统/多语言对照：introduction/opportunity/democratizing等显著改善；全长输出764段至2352.12秒，无倒序/越界。可见字幕首/中/尾分布对照3处相符，非全片听审/准确率。
- 仍有专名漏识别：Agent Swarms→agent samps，MuonClip未识别，部分Kimi Linear词形损坏；关键词检索可能漏报。约24:04–25:07空档对应演示片，未逐秒听审，不能断言无语音。一般句子改善，不保证逐字准确；用户已知晓并同意采用。
- 最终生产识别函数→隔离HTTP导入→764段保存，MCP三组真实文稿检索命中，全文读回31893字符与本次保存逐字相等。见[kimi-validation.json](../../../work/transcript440/kimi-validation.json)。两次独立本地推理有少量非确定性词形变化，不强求跨推理逐字相等。
- 最初开源Chromium对该HEVC只播音频，画面未解码，播放“通过”结论已收窄并补验。使用独立Chrome测试实例，1920×1080画面实际解码218/228帧，22:59跳转播放与对应画面可见，1440/390末段可滚动到达。见[kimi-chrome-validation.json](../../../work/transcript440/kimi-chrome-validation.json)。临时视频编码差异不影响ASR输入作品身份。
- 完整单元1222/1222；连续阅读两宽、收藏六宽/axe/焦点/Esc、视频Range/播放/跳转回归通过。首败日志保留：旧OCR可见、旧摘要无命中上下文、空文稿ready；测试脚本错误与环境失败单列，未用其冒充产品红例。
- 冻结11文件双轴无重要发现，T2同构建VISUAL_PASS，见[审查](../../../work/transcript440/reviews.md)。继承既有视觉，无新视觉方向/依赖/生图；该结论不代签Claude和常浩验收。

## 正式采用和保护

用户一次授权后身份/空闲/哈希预检，仅执行一次LaunchAgent kickstart：PID7922→41099。核对主库指针、收藏state、plist不变；候选dist及固定校验模型已采用，5178的HTML/JS/CSS与候选逐字节一致。[重启回读](../../../work/transcript440/restart-readback.json)、[HTTP回读](../../../work/transcript440/http-readback.json)。本次重启授权已消费。

真实Chrome刷新后读取已有“卡帕西同款会生长的知识库搭建思路”：仅正文/文稿两页签，17段全文、0分页。保留页面已有未保存分组草稿；没有点恢复/丢弃。正式截图捕获超时，DOM证据与同构建隔离Chrome截图分列，不用隔离Kimi冒充已恢复正式收藏。

749文件保护基线：无未解释改动/丢失，替换的旧dist完整归档在work/transcript440/before-live-dist，源码11项冻结一致；真实state revision63、4有效/5回收、Kimi仍删除，数据字节不变。HEAD仍e6e5d8b74474ea408ebb171ab70415e32d57ada4；无提交/推送/Agent配置写入。实际运行采用已验证，当前客户端既有常驻MCP进程是否刷新未验证；新启动MCP使用新代码。

## 使用与下一步

刷新工作台即可，无需重装/重载收藏扩展或重新配对。新收藏视频自动使用本地多语言识别；旧收藏文稿没有自动重跑。本次未提供新重分析UI入口，勿按不存在的按钮操作。搜索支持关键词，未增加语义检索或自动中英翻译；引用专名仍按时间点核对原视频。

本轮已批准的有限采用完成，唯一下一步：常浩实际使用验收；如要求专名精确检索，另定有来源字幕/术语校对路线，不自行上传或下载新模型。

[质量对照及已知错词](../../../work/transcript440/quality-report.md) · [精确差异](../../../work/transcript440/review.diff) · [源清单](../../../work/transcript440/source-manifest.json) · [完整单元](../../../work/transcript440/unit-full.log) · [保护回读](../../../work/transcript440/protection-final.json)

![同构建Kimi隔离验证，未恢复真实收藏](../../../work/transcript440/kimi-top-1440.png)
![窄屏直接滚动至末段](../../../work/transcript440/kimi-end-390.png)
