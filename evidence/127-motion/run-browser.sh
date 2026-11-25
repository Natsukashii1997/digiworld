#!/bin/bash
# 跑全部浏览器回归：tests/*browser*.mjs 与 README 列的独立脚本，并发 3，每条限时 600 秒。
# 用法：run-browser.sh <副本目录> <结果目录>
WT=$1; OUT=$2; mkdir -p "$OUT"
export PLAYWRIGHT_BROWSERS_PATH=$HOME/Sandbox/2026-11-25-digiworld-motion/pw-browsers
cd "$WT"
ls tests/*browser*.mjs tests/browser.mjs tests/migration.mjs tests/accessibility.mjs tests/history-capacity.mjs 2>/dev/null | sort -u | grep -v -E "fixture|helpers" > "$OUT/list.txt"
run() { f=$1; n=$(basename "$f" .mjs); s=$(date +%s); timeout 600 node "$f" > "$OUT/$n.log" 2>&1; c=$?; echo -e "$c\t$(( $(date +%s)-s ))s\t$n" >> "$OUT/results.tsv"; }
export -f run; export OUT
: > "$OUT/results.tsv"
cat "$OUT/list.txt" | xargs -P 3 -I{} bash -c 'run {}'
echo "done $(wc -l < "$OUT/results.tsv") ; fail $(awk '$1!=0' "$OUT/results.tsv" | wc -l)"
