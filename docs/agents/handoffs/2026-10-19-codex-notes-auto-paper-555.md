# 白字卡片自动多色纸面555

输入553→认领554→输出555；Codex。

## 已确认需求

常浩明确：『白字卡片也会自动有不同底色』。因此只恢复卡片纸色，不改文字、格式、工具栏、布局或右上复制。

## 实现与边界

新增纯展示helper src/note-paper.js：已有字色仍沿用首个字色的原纸面规则；没有字色则按便签ID稳定分配原红/蓝/绿/黄/灰五色。相同便签在便签墙与浮窗一致，修改正文、刷新、排序、增加其他便签不重排旧卡颜色。没有新增schema/持久字段，没有写正文或格式标记。原编辑态暖黄保持。

旧色盘有历史证据：git27160d2蓝var(--blue)/.06、绿var(--lcd)/.05，后来351派单降饱和。本轮恢复这两个旧值，其他色值沿用。未找到历史自动分配算法；ID hash是按本轮用户澄清补齐自动多色的实现，不宣称考古恢复了原算法。

范围仅Note/Floating两处tone调用、新helper、两份CSS蓝绿纸色4值和注释。NoteEditor、note-document、note-dom、rich-note、note-clipboard、NoteCopyButton逐字等于553；所有原控件/结构不改。

## 验证

- 1384/1384全量：work/paper554/unit.log；新增2项纸色稳定/旧字色单元。
- paper-browser-final/results.json：对照正式553的同批合成资料，两处白字多色、刷新/新增/重排稳定、相同ID同色、旧首字色保持；卡片/header/body/tools/copy/footer几何、正文/列表和字色逐项一致；原暖黄编辑/底部工具保持；复制仍成功且没有向文字插入卡片底色。渲染/复制未变合成notes/revision。合成图见paper-browser-final/wall-papers.png、floating-papers.png。
- 原notes-wall/floating/native-dom（8项）/caret（三类）浏览器回归通过。
- 独立只读review.md；CAS测试首败与修正在DIAGNOSTICS.md，未绕过现有版本门禁。

## 正式采用

冻结release：/Users/nat/Library/Application Support/PersonalAIWorkbench/releases/wb-20261019-555，436程序文件逐SHA匹配，服务PID 52498；原生PID 52524，原生程序未替换、签名通过、无全局快捷键。

正常退出保存后刷新私有adoption-backup（0700，禁止外传真实快照），当前revision 629；服务切换/UI回读后数据指针完全保持。原草稿目录、位置偏好、自启保留，临时验证钉住已还原off。正式应用实际看到了白字绿、红、黄纸面及7个复制入口；真实画面只临时查看，没有保存到项目证据。

根dist、依赖/锁文件、HEAD保持；不提交推送；测试服务均关闭。回退只恢复程序/plist，保留最新主库和FloatingNotesState。

唯一下一步：常浩自然使用确认白字卡片多色效果；其他功能和形式继续维持553，不继续扩大改动。此为工程、实际运行与独立只读核验，用户最终验收未代签。
