#!/usr/bin/env bash
# 用法：run-matrix.sh <仓库目录> <日志目录> <标签>
# 在当前用户下用 Node 24 逐个跑 7 个相关测试文件；rule-templates 加 --test-timeout 防挂起。
export NVM_DIR=/opt/nvm; . "$NVM_DIR/nvm.sh" >/dev/null; nvm use 24 >/dev/null
cd "$1" || exit 1
out="$2"; tag="$3"; mkdir -p "$out"
for f in agent-config agent-config-http agent-programs discovery knowledge-writeback skill-files rule-templates; do
  start=$(date +%s.%N)
  timeout 300 node --test --test-timeout=30000 --test-reporter=spec "tests/$f.test.mjs" > "$out/$tag-$f.txt" 2>&1
  code=$?
  end=$(date +%s.%N)
  printf '%s\t%s\texit=%s\t%.1fs\n' "$tag" "$f" "$code" "$(echo "$end - $start" | bc)" | tee -a "$out/$tag-summary.txt"
done
