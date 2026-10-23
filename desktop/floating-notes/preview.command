#!/bin/bash
set -euo pipefail
project_dir="$(cd "$(dirname "$0")/../.." && pwd)"
node_bin="${NODE_BINARY:-/usr/local/bin/node}"
app_bin="$project_dir/work/floating524/native-basic/随手记.app/Contents/MacOS/FloatingNotes"
[ -x "$node_bin" ] && [ -x "$app_bin" ] || { echo '候选尚未构建，请让 Codex 按 README 构建后再预览。'; read -r; exit 1; }
preview_dir="$(mktemp -d "$project_dir/work/floating-notes-preview.XXXXXX")"
server_pid='';native_pid=''
cleanup(){ [ -z "$native_pid" ] || kill -TERM "$native_pid" 2>/dev/null || true; [ -z "$server_pid" ] || kill -TERM "$server_pid" 2>/dev/null || true; }
trap cleanup EXIT INT TERM
cd "$project_dir"
WORKBENCH_TEST_STATIC_ROOT="$project_dir/work/floating524/candidate-dist" FLOAT_PREVIEW_STATUS="$preview_dir/status.json" "$node_bin" tests/floating-notes-preview.mjs > "$preview_dir/server.log" 2>&1 &
server_pid=$!
for ((attempt=0;attempt<100;attempt++));do [ ! -f "$preview_dir/status.json" ] || break;sleep 0.1;done
[ -f "$preview_dir/status.json" ] || { echo "隔离服务未就绪，请把此目录交给 Codex：$preview_dir";exit 1; }
preview_url="$($node_bin -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).url)' "$preview_dir/status.json")"
echo '这是合成便签预览，不连接正式数码世界。'
echo '点球输入，约1秒自动保存。可正常退出后按回车重开，以验证恢复。'
echo '输入 q 并回车结束预览；本窗口保留时，隔离服务持续运行。'
echo "本轮恢复区：$preview_dir/state"
while true;do
 "$app_bin" --base-url "$preview_url" --state-dir "$preview_dir/state" --diagnostics > "$preview_dir/native.log" 2>&1 &
 native_pid=$!
 wait "$native_pid" || true;native_pid=''
 read -r -p '回车重开，q结束：' choice || break
 [ "$choice" != q ] || break
done
