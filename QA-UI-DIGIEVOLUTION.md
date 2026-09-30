# 数码进化 UI v1 · 本地候选记录

日期：2026-09-27。结论：代码与非浏览器检查通过，浏览器验收BLOCKED，待用户查看和最终验收。未提交、未发布。

## 变更

- App/index品牌改为数码进化；9路由沿用原功能与hash，统一深蓝Shell、表单、按钮、对话框、反馈与状态。
- 资产列表/详情双栏；网格视图保留；1100px以下使用原详情抽屉；内嵌与模态详情复用同一内容，不复刻业务逻辑。
- 10张批准图机械裁切，清单 `design/digievolution-v1/assets.json`。生成预算0、无新生图、无依赖安装。
- 未更改server、数据协议、包版本或主库；原未完成v17不在本轮完成功能声明内。

## 版本与验证

- start_head `817b2949ffbaeccae97b610691f2b78c35acb0c0`；应用原未跟踪。改前源码与后端快照 `test-results/digievolution-v1/baseline/`。
- 最终代码审查快照 `test-results/digievolution-v1/review-v3/`，52文件联合SHA256 `7a31b314eb52d38983e433423389f954b32ae709340e43ed5c74395782810fab`。
- `npm test`: **367/367 PASS**，其中原359项单元/API和8项新组件/素材/结构检查。最后运行exit0、fail0。测试数据目录均隔离。
- 新增测试第一次单独通过但整套有1次失败：seed生成跨毫秒导致默认选中项不同；测试fixture固定版本时间后，后续完整套件通过。产品仍按真实更新时间排序，未为测试更改业务排序。
- `npm run build`: PASS，1612模块。
- JS SHA256 `712a886afcc56e65e4698028fac24d1e76e76cf0516cb08672293e485e7cb7d4` (`index-ZvEl5WQJ.js`)。
- CSS SHA256 `0f148bcafd4fb8b43ca49b9fdb9ce93fe8604688205b50fdf8ef831420374493` (`index-DnR0swfz.css`)。
- dist/index.html SHA256 `5c49a0eb21b64575e775d2e647a08748ddcbee83bf914c78f0424e8e1e0d0290`。
- CSS解析、变量引用检查无未定义变量；关键正文/按钮静态对比度7.83–13.05:1。这不是完整可访问性验收。

## Standards

v1发现1项P2：内嵌详情卸载导致焦点返回失败。v2出现完整详情重开时焦点误回背景的分支。v3按是否仍有asset待展示区分；独立定向复核剩余0项。真实键盘时序待验。

## Spec

v1发现P1默认列表继承三列、P2焦点返回。明确单列并加回归检查；焦点guard经v3复核闭合。独立审查未发现后端、数据协议或业务功能越界；最终剩余0项。窄屏几何和真实交互待验。

## 权威与运行

- Gate1: SATISFIED_BY_APPROVED_AUTHORITY，精确图SHA `192d13e2e2e2be6c20b0c69758251ee290e7c0b6b3f2b6c3655ed4500454314f`，用户本轮明确确认；不是代理自选另一版。
- T2: BLOCKED，没有当前运行截图和浏览器基线，未伪造VISUAL_PASS。完整原因与未验矩阵见 `design-qa.md`。
- 本机服务从本项目 `npm start` 启动，地址 `http://127.0.0.1:5178`；尚未通过浏览器验证该构建的实际显示。
- 主库CURRENT revision5；CURRENT SHA `9cf1a6a3541c30ae148545b42278e441a9a6b1ce33082f7d70d378b923b8a310`；现行快照SHA `1f9f698413fb3e2fdacbb65e5cebfae7e53237a4c9aab28dd43087666d4d6ac4`。前后相同。

唯一下一步：恢复内置浏览器获准访问，完成隔离真实交互和同视口视觉比较，再T2及用户验收。浏览器、键盘、读屏、真实安装和业务功能完成度不得从构建/单元测试推断。
