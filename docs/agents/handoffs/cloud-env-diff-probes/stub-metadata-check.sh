#!/usr/bin/env bash
# 探针 2：只在"探针副本"里把 defaultMetadataCheck 的非 darwin 分支换成"无扩展属性"，
# 用来区分"被平台守卫拦下"与"Linux 文件语义/产品逻辑另有问题"。绝不在权威仓库里执行。
# 用法：stub-metadata-check.sh <仓库副本目录>
set -euo pipefail
f="$1/server/config-file.mjs"
grep -q 'process.platform !== "darwin"' "$f"
sed -i 's|  if (process.platform !== "darwin")\n||' "$f"
# 把平台守卫替换为：非 darwin 直接返回"无 provenance"，保留原有 preserve 语义检查
perl -0pi -e 's/  if \(process\.platform !== "darwin"\)\n    throw fail\("此平台尚不能可靠核验配置扩展属性，未写入"\);\n/  if (process.platform !== "darwin") {\n    if (Object.hasOwn(options, "preserve") && options.preserve?.provenance !== null)\n      throw fail("PROBE: 非 darwin 探针不支持 provenance");\n    return { provenance: null };\n  }\n/' "$f"
grep -n -A5 'process.platform !== "darwin"' "$f"
