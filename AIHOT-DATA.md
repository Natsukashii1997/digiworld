# AI HOT 数据字段边界

依据仓库 tests/aihot.test.mjs 的已核对接口结构样例（内容为合成）。开发中未联网抓取真实数据。

- 日报日期只取 `report.date` 的 YYYY-MM-DD；兼容既有列表 date。
- 条目发布时间只取已有接口 publishedAt 等白名单，不能代表整期更新时间。
- 链接只取 links.original / links.aihot 等既有白名单。
- 现有样例没有期号和源更新时间字段，因此继续写“待接入数据”。不能用 date 派生序号，不能以 lastSuccessAt 冒充源更新时间。
- lastSuccessAt 是本机缓存成功拉取时刻，页面明确单列。未提供的分类不猜测。

后续接真实字段时需补样例、字段契约和隔离测试，由用户终验真实拉取。
