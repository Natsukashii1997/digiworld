#!/bin/bash
# 编译「数码世界.app」（原生窗口壳，加载常驻服务 cn.personal-ai-workbench.server 的本地页面）。
#   bash desktop/app-shell/build.sh                  试装到 work/app-shell/
#   bash desktop/app-shell/build.sh ~/Applications   装成正式应用
# 环境变量 WORKBENCH_URL 可改加载地址（默认 http://127.0.0.1:5178/）。
# 目标位置已有别的「数码世界.app」（例如 Safari 网页应用）时不覆盖，先备份移走再装。
set -euo pipefail
project_dir="$(cd "$(dirname "$0")/../.." && pwd)"
output_dir="${1:-$project_dir/work/app-shell}"
url="${WORKBENCH_URL:-http://127.0.0.1:5178/}"
bundle_id=cn.personal-ai-workbench.app
app_dir="$output_dir/数码世界.app"
if [ -e "$app_dir" ]; then
  existing="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$app_dir/Contents/Info.plist" 2>/dev/null || true)"
  [ "$existing" = "$bundle_id" ] || { echo "$app_dir 已存在且不是本外壳（$existing），先备份移走再装" >&2; exit 2; }
fi
work="$project_dir/work/app-shell/build"
rm -rf "$work"
mkdir -p "$work/数码世界.app/Contents/MacOS" "$work/数码世界.app/Contents/Resources" "$work/AppIcon.iconset" "$work/swift-cache"
/usr/bin/xcrun swiftc -swift-version 5 -O -module-cache-path "$work/swift-cache" "$project_dir/desktop/app-shell/DigitalWorld.swift" -framework AppKit -framework WebKit -o "$work/数码世界.app/Contents/MacOS/DigitalWorld"
for size in 16 32 128 256 512; do
  /usr/bin/sips -z "$size" "$size" "$project_dir/desktop/app-icon/source-1024.png" --out "$work/AppIcon.iconset/icon_${size}x${size}.png" >/dev/null
  /usr/bin/sips -z $((size * 2)) $((size * 2)) "$project_dir/desktop/app-icon/source-1024.png" --out "$work/AppIcon.iconset/icon_${size}x${size}@2x.png" >/dev/null
done
/usr/bin/iconutil -c icns "$work/AppIcon.iconset" -o "$work/数码世界.app/Contents/Resources/AppIcon.icns"
cat > "$work/数码世界.app/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleName</key><string>数码世界</string><key>CFBundleDisplayName</key><string>数码世界</string><key>CFBundleIdentifier</key><string>$bundle_id</string><key>CFBundleExecutable</key><string>DigitalWorld</string><key>CFBundleIconFile</key><string>AppIcon</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleShortVersionString</key><string>1.0</string><key>CFBundleVersion</key><string>$(git -C "$project_dir" rev-parse --short HEAD)</string><key>LSMinimumSystemVersion</key><string>14.0</string><key>NSHighResolutionCapable</key><true/><key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict><key>WorkbenchURL</key><string>$url</string></dict></plist>
PLIST
/usr/bin/codesign --force --sign - "$work/数码世界.app"
mkdir -p "$output_dir"
rm -rf "$app_dir"
mv "$work/数码世界.app" "$app_dir"
touch "$app_dir"   # 让访达和程序坞刷新图标
printf '%s\n' "$app_dir"
