# 焚决名称与条数小块精简 · 工程交回400

输入397→认领398→用户纠正399→输出400。用户最新两点是当前基线：只去独立名称/条数小块，保留原火焰表头；整体橙框突兀，撤掉。本轮早先移除Cover、添加橙框的解释错误及其结论已撤回，不作为通过或用户验收。权威规格：docs/agents/assets-warehouse/05-scroll-compact.md。

## 最终变更

- 保留原大火焰Cover、FJ编号、总次数、卷标和已有聚合标签；名称紧跟小火焰与焚决，合并为“焚决 · 心法”，去独立名称及“2条·逐条浏览”段落。原整卷复制、删除、Pin仍在封面位置。
- 恢复原深蓝灰边界、背景与阴影，无橙框/书脊/暖色背景。仅条目细分隔和留白、底部4px弱双页线体现内页，装饰不接收指针事件。
- 逐条复制按钮32px×32px、图标14px，按用户明确要求覆盖44px标准的局部例外。12px标签、完整正文与换行、逐条次数、728px内滚及普通352px卡保持。
- 会话锁、copyEntries、App、ScrollDetail、scrolls模型相对397前像逐字未改。双击、拒绝不计次、保存未知锁定、不自动重放及筛选/路由重入门禁不变。

## 验证与版本

- 最终11项冻结review5/manifest.json SHA256 `a4a33b8deba314acf12387e23a3dad56520125fdf3ed75e5da7cc4261738fc7b`。相对397真前像差异在review4/delta-this-ticket.patch，review5仅额外两个局部span规则和8px间距断言；没有将原dirty当作本轮改动。
- 构建成功，17文件build-manifest.json SHA256 `6b7f6da0fca0e1c087bea782c4d3f9cbd0b4b71f65bfbce27833dd63b2c51c4a`。JS `index-CsWIaMok.js`，CSS `index-Bm9kYncf.css`。最后两个CSS规则消除旧.card-type span自动左边距，名称紧跟图标8px；JS内容字节不变。
- 1206/1206完整串行单元unit-corrected.log；五原入口regression-corrected/results.json全绿：scrolls、assets-actions、assets-warehouse、assets-copy、assets-pin。
- 最终preview-final4.log及results.json通过：火焰Cover/FJ保留、仅一个合并名称、条数p为0、图标→名称8px、32/14、728/352、六宽内滚/键盘/无横溢/Axe、全文/顺序/标签/逐条计次/双击/拒绝/未提交及提交后响应丢失/筛选路由重入共享锁。54字长名320/390触屏可见、不遮挡、截断、无溢出通过，使用滚入视口的viewport图。
- 最后纯CSS修正按Matt94重开视觉及下游：上述专项、actions-final（三操作几何与原复制）重验全绿，新构建/5178/图/T2重新绑定；unit-corrected及其余原入口逻辑未变，JS字节相同，沿用依据qa-adoption-final.json。
- 只读双轴最终Standards硬性0/建议0，Spec新增0；冻结11/11与当前一致。见review-final.md。工程T2 VISUAL_PASS，未解决0，见t2-visual-record.md；不沿用撤回的无Cover/橙框结论，不代签Claude或常浩。
- 视觉path3，生图0。authority SHA256 `3dc651057e803b8af0db829fb96581d9f6fecbec7b9697af91524d8288f8c216`；screens SHA256 `620ed704762102ed92380e8d499ba04ca2c391fd93d3f1447618b76cdf2042d9`（最终六宽、2张长名touch viewport及真实live-final，共9图）。

## 采用、保全与首败

work/assets398/http-readback.json：5公开静态资源HTTP200，与17磁盘冻结对应且逐字节一致。live-final-readback.json/实图只读确认：心法Cover1、FJ.01、总5、唯一“焚决 · 心法”、条数段落0、图标名间距8、32/14、728高、普通352高、原条计次2/3，边框rgba(140,178,255,.11)。原5178 PID97328未重启；没有操作真实复制、编辑或测试性增删。

HEAD仍 `e6e5d8b74474ea408ebb171ab70415e32d57ada4`，staged为空，保留既有未提交改动。2191基线指纹無丢失、2180未变；变化仅授权文件与动态data/capability-use.json使用日志，日志保留不回滚、不归因。data/CURRENT.json主库指针不变。目标15份前像及全量diff/status在work/assets398/before、baseline.json、git-diff-before.patch；保护细目protection-final.json。

header-red.log为旧397未合并标题的有效红。专项首败保留：误选第一张空卷修为明确区域定位；长名样本超60字上限收窄合法54字。touch-screenshot-diagnosis.json证明fullPage截图使hoverNone/touch从true/1变为false/0；测试改每宽独立触屏context并强断言hover:none，保留原可见/遮挡/截断/溢出约束，最终viewport长名图证明三操作全显。不把测试模拟故障冒认为产品CSS缺陷。误删Cover/橙框的图及日志仅作撤回历史；IAB clip误返回页首的live-scroll-card.png不作为正式证据。当前正式实图只用live-final.png。

## 交接

[前后对照与非技术报告](../../../work/assets398/report.html)。本地工程与原5178采用已完成；Claude质量审查、常浩实际使用/视觉验收待做。397及更早历史待验不代签、不抹除；未发送跨客户端消息，不声称Claude已接手。

CURRENT400/tracker写后回读并释放写入者。唯一下一步：常浩按最新修正版试用、Claude据400最终冻结与图做质量验收。继续禁止提交、推送、安装、重启、测试性真实资产增删及Vault/Agent私人资料读写。
