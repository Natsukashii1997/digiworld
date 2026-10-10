# 收藏移植来源

复制自 feitangyuan/kankan-shoucang，commit a788e60177a90387f2c580bcec91d475cdf6044f，AGPL-3.0-or-later，完整许可证见LICENSE。

前端核心在src/collection，Chrome扩展在browser-extension/collection，媒体与匿名解析在本目录lib。宿主适配增加独立鉴权、串行原子持久化、版本媒体、操作回读、流式限额、明确partial状态；不复制上游广泛CORS、全局Agent配置写入、隐藏缓存读取及默认旧数据合并。
