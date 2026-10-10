# 项目空间 Zone 顺序调整 · WB-20261009-317

## 输入与范围

- 输入 `WB-20261009-315`，常浩要求「个人产品」放在 Zone 01、「业务系统」放在 Zone 02；无人写入时认领 `WB-20261009-316` 单写。
- 只更改项目空间的显示顺序，不改项目 section ID、分类数据、进度状态或扫描规则。

## 改动与验证

- `src/projects-v16.js` 中 `portfolioSections` 将 `personal` 置于 `business` 前。`src/ProjectsV16.jsx` 已按分区结果索引生成 Zone 编号，因此无需修改渲染器。
- 更新 `tests/project-catalog.test.mjs`、`tests/project-catalog-browser.mjs`、`tests/project-catalog-live-browser.mjs` 的顺序断言，并在浏览器测试中明确验证 Zone 01/02 编号。
- `npm run build` 通过；`node --test tests/project-catalog.test.mjs` **2/2**；隔离项目页浏览器检查通过。原 5178 桌面 1440px 和手机 390px 浏览器检查通过：Zone 01=个人产品，Zone 02=业务系统，6 张主项目卡、原删除项目缺席，页面错误 0、无横向溢出。
- 原 5178 返回 HTML 与 `dist/index.html` 字节一致，HTML SHA256 `51b4bb746dd69692c69f0af6f146bd874391d975e7e943652cbc27315ad6fc36`；引用的 5 个资源均与 dist 对应文件逐字节一致。无需重启服务即可采用新构建。
- `data/CURRENT.json` SHA256 `1bf44f89d2b692061cafea297f6349b013d13eaf87c6b6d7028a99776cdd5926` 前后不变，真实项目数据未修改。

## 交回

- 输出 `WB-20261009-317` 后释放写入者。唯一下一步：常浩在原 `http://127.0.0.1:5178/#projects` 目视确认 Zone 01/02 顺序；真实使用验收尚未代签。
