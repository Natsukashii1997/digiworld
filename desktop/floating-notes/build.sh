#!/bin/bash
set -euo pipefail
project_dir="$(cd "$(dirname "$0")/../.." && pwd)"
output_dir="${1:-$project_dir/work/floating520/native}"
case "$output_dir" in "$project_dir"/work/*) ;; *) echo 'Build output must be inside project/work' >&2; exit 2;; esac
app_dir="$output_dir/随手记.app"
mkdir -p "$app_dir/Contents/MacOS" "$output_dir/swift-cache"
/usr/bin/xcrun swiftc -swift-version 5 -O -module-cache-path "$output_dir/swift-cache" "$project_dir/desktop/floating-notes/Geometry.swift" "$project_dir/desktop/floating-notes/RecoveryVault.swift" "$project_dir/desktop/floating-notes/RichClipboard.swift" "$project_dir/desktop/floating-notes/NoteWindow.swift" "$project_dir/desktop/floating-notes/main.swift" -framework AppKit -framework WebKit -framework Carbon -o "$app_dir/Contents/MacOS/FloatingNotes"
cat > "$app_dir/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleName</key><string>随手记</string><key>CFBundleDisplayName</key><string>随手记</string><key>CFBundleIdentifier</key><string>local.digitalworld.floatingnotes</string><key>CFBundleExecutable</key><string>FloatingNotes</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleVersion</key><string>1</string><key>CFBundleURLTypes</key><array><dict><key>CFBundleURLName</key><string>Digital World Notes</string><key>CFBundleURLSchemes</key><array><string>digitalworld-notes</string></array></dict></array><key>LSUIElement</key><true/><key>NSHighResolutionCapable</key><true/><key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict></dict></plist>
PLIST
/usr/bin/codesign --force --sign - "$app_dir"
"$app_dir/Contents/MacOS/FloatingNotes" --self-test
printf '%s\n' "$app_dir"
