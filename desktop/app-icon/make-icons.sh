#!/bin/bash
# 由应用图标原图 source-1024.png（2026-10-28 用户定稿「A 数码夜景」：拼豆暴龙兽原配色 + 青色齿轮光环 + 科技城市夜景）生成：
#   public/assets/app-icon-192.png、app-icon-512.png：网站清单与 apple-touch-icon 用（Safari「添加到程序坞」按清单生成应用图标）
#   work/app-icon/AppIcon.icns（16–1024 含 @2x）：备用；Safari 网页应用改包内文件后重签会打不开（LaunchServices 校验模板应用签名，-10410），不能拿它直接替换
# 原图是满版不透明方图，圆角交给系统切；macOS 27 实测不会套灰底板。浏览器标签页图标仍是 digivice-192.png，不由这里生成。
# 原图的设计稿与脚本（读拼豆图纸、画背景）在 work/app-icon/bead-v12/，不进仓库。
set -euo pipefail
project_dir="$(cd "$(dirname "$0")/../.." && pwd)"
source="$project_dir/desktop/app-icon/source-1024.png"
iconset="$project_dir/work/app-icon/AppIcon.iconset"
rm -rf "$iconset"
mkdir -p "$iconset"
for size in 192 512; do
  /usr/bin/sips -z "$size" "$size" "$source" --out "$project_dir/public/assets/app-icon-$size.png" >/dev/null
done
for size in 16 32 128 256 512; do
  /usr/bin/sips -z "$size" "$size" "$source" --out "$iconset/icon_${size}x${size}.png" >/dev/null
  /usr/bin/sips -z $((size * 2)) $((size * 2)) "$source" --out "$iconset/icon_${size}x${size}@2x.png" >/dev/null
done
/usr/bin/iconutil -c icns "$iconset" -o "$project_dir/work/app-icon/AppIcon.icns"
printf '%s\n' "$project_dir/work/app-icon/AppIcon.icns"
