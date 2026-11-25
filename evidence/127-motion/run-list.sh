#!/bin/bash
# 只跑清单里的浏览器测试：run-list.sh <副本目录> <清单> <结果目录>
WT=$1; LIST=$2; OUT=$3; mkdir -p "$OUT"
export PLAYWRIGHT_BROWSERS_PATH=$HOME/Sandbox/2026-11-25-digiworld-motion/pw-browsers
cd "$WT"
run() { f=$1; n=$(basename "$f" .mjs); s=$(date +%s); timeout 600 node "$f" > "$OUT/$n.log" 2>&1; c=$?; echo -e "$c\t$(( $(date +%s)-s ))s\t$n" >> "$OUT/results.tsv"; }
export -f run; export OUT
: > "$OUT/results.tsv"
cat "$LIST" | xargs -P 3 -I{} bash -c 'run {}'
echo "done $(wc -l < "$OUT/results.tsv") ; fail $(awk '$1!=0' "$OUT/results.tsv" | wc -l)"
