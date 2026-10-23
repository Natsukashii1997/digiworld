#!/bin/sh
# 生成 UI v18 视觉稿并截图。用法：sh docs/design/ui-v18/build/run.sh（在项目根目录执行）
set -e
ROOT=$(cd "$(dirname "$0")/../../../.." && pwd)
D="$ROOT/docs/design/ui-v18"
OUT=$(mktemp -d)
ESB="$ROOT/node_modules/.bin/esbuild"
NODE_PATH="$ROOT/node_modules" "$ESB" "$D/build/make.jsx" --bundle --platform=node --format=esm \
  --jsx=automatic --loader:.js=jsx --log-level=warning --outfile="$OUT/make.mjs" \
  --banner:js="import {createRequire} from 'module';const require=createRequire('$ROOT/package.json');"
"$ESB" "$D/build/page.js" --bundle --format=iife --log-level=warning --outfile="$D/page.js"
node "$OUT/make.mjs" "$D/build/data.json" "$D"
node "$D/build/shoot.mjs"
rm -rf "$OUT"
