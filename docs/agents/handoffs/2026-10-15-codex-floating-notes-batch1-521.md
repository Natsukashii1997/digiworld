# 桌面随手记 · 批1工程交回521

输入519，Codex520连续认领；本批交回521，Codex继续批2/3，当前写入者不释放。视觉权威仍为FN-516 v1，SHA256 `61e9d0b0ca13a9170ecf73549e6de18ca0ec3856ac32578d5fca4fceb0c5d223`。

单条GET/PUT便签接口已接入原仓库串行事务与持久化回读，复用鉴权。固定ID同内容幂等，正文+format起点冲突返回当前条目，不新增schema字段、不提供删除。编辑保留at/refined。网页随手记获焦刷新、整库保存前重读并合并；只对明确提交前的revision冲突最多尝试3次，未知结果不重放。同条被筛掉或在另一网页删除时仍保留可见草稿，可另存为新条或使用别处版本；切换新建/另一卡/勾选待办不会覆盖冲突稿。

范围：server/notes.mjs、repository.mjs、http.mjs；src/api.js、workspace-refresh.js、App.jsx、NotesV16.jsx；对应接口/合并/双窗口测试。既有notes-v16-browser断网注入从第几个GET改为“PUT执行后的第一个GET”，保持原删除结果未知验收语义。

验证：最终全量1327/1327（含批2先行3项合成恢复测试），见work/floating520/batch1-final-unit.log；单条/合并10项通过，见batch1-repair-green.log。新双窗口、既有中文富文本/IME/颜色/待办/删除恢复浏览器均通过：batch1-browser-5.log、batch1-notes-v16-2.log、batch1-notes-rich.log。原始首败完整保留；曾修复导入名未同步，并由最终浏览器覆盖。

只读双轴审查发现的草稿隐藏、并发格式、重读窗口、无效PUT及两条旁路均已修复；最终11文件冻结在本会话work/floating520/review2/manifest.json，Spec复核全部关闭。Claude尚未复核。

候选work/floating520/batch1-dist；截图work/floating520/batch1-browser。本批不新增界面造型，截图展示网页刷新/冲突输入保留；便签栏九态和球图在后两批。正式dist、5178服务、真实便签/数据、依赖和现有数码世界.app均未采用或修改；没有安装、登录项、提交、推送。

唯一下一步：Codex连续完成批2独立便签栏及批3Mac宿主，各自验证并单独交接；Claude随后逐批复核及最终T2。
