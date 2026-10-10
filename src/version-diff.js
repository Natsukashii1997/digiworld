import { fileBytes } from "./skill-package.js";

const mcpComparable = value => JSON.stringify(value ? Object.fromEntries(Object.keys(value).sort().map(key=>[key,value[key]])) : null);

export function compareVersions(before, after) {
  const fields = [];
  for (const [key, label] of [
    ["title", "名称"],
    ["description", "描述"],
    ["source", "来源"],
    ["tags", "标签"],
    ["references", "资产引用"],
    ["workflowTemplate", "协同模板结构"],
    ["mcpConfig", "MCP 配置"],
  ]) {
    const left = key === "mcpConfig" ? mcpComparable(before[key]) : ["tags", "references", "workflowTemplate"].includes(key)
      ? JSON.stringify(before[key] ?? (key === "workflowTemplate" ? null : []))
      : before[key] || "";
    const right = key === "mcpConfig" ? mcpComparable(after[key]) : ["tags", "references", "workflowTemplate"].includes(key)
      ? JSON.stringify(after[key] ?? (key === "workflowTemplate" ? null : []))
      : after[key] || "";
    if (left !== right) fields.push({ key, label, before: left, after: right });
  }
  const contentChanged = (before.content || "") !== (after.content || "");
  const files = [];
  const leftFiles = new Map(
    (before.files || []).map((file) => [file.path, file]),
  );
  const rightFiles = new Map(
    (after.files || []).map((file) => [file.path, file]),
  );
  const paths = [
    ...new Set([...leftFiles.keys(), ...rightFiles.keys()]),
  ].sort();
  for (const path of paths) {
    const left = leftFiles.get(path) || null;
    const right = rightFiles.get(path) || null;
    const changes = [];
    if (left && right) {
      const leftBytes = fileBytes(left);
      const rightBytes = fileBytes(right);
      if (
        leftBytes.length !== rightBytes.length ||
        leftBytes.some((byte, i) => byte !== rightBytes[i])
      )
        changes.push("content");
      if (left.mode !== right.mode) changes.push("mode");
      if ((left.directory === true) !== (right.directory === true))
        changes.push("type");
    }
    if (!left || !right || changes.length)
      files.push({
        path,
        status: !left ? "added" : !right ? "removed" : "modified",
        before: left,
        after: right,
        changes,
      });
  }
  return {
    fields,
    files,
    contentChanged,
    identical: !fields.length && !files.length && !contentChanged,
  };
}

export function diffText(before, after) {
  const normalize = (text) => text.replace(/\r\n?/g, "\n");
  const formatOnly = before !== after && normalize(before) === normalize(after);
  const full = { mode: "full", rows: [], formatOnly };
  if (before.length > 100000 || after.length > 100000) return full;
  // Each token retains its terminator, including CRLF and the final newline.
  const lines = (text) => text.match(/[^\r\n]*(?:\r\n|\r|\n)|[^\r\n]+$/g) || [];
  const left = lines(before);
  const right = lines(after);
  if (left.length > 5000 || right.length > 5000) return full;
  // Hirschberg LCS：5000行上限，滚动行线性内存，保留原行结束符。
  function lengths(a0,a1,b0,b1,reverse=false) {
    let previous = new Uint16Array(b1-b0+1);
    for(let x=0;x<a1-a0;x++) {
      const next = new Uint16Array(b1-b0+1), a = left[reverse?a1-1-x:a0+x];
      for(let y=0;y<b1-b0;y++) next[y+1] = a===right[reverse?b1-1-y:b0+y] ? previous[y]+1 : Math.max(previous[y+1],next[y]);
      previous=next;
    }
    return previous;
  }
  const matches=[];
  function align(a0,a1,b0,b1) {
    while(a0<a1 && b0<b1 && left[a0]===right[b0]) matches.push([a0++,b0++]);
    if(a0===a1 || b0===b1) return;
    if(a1-a0===1) { for(let j=b0;j<b1;j++) if(left[a0]===right[j]) {matches.push([a0,j]);break;} return; }
    const mid=(a0+a1)>>1, f=lengths(a0,mid,b0,b1), g=lengths(mid,a1,b0,b1,true);
    let best=-1,cut=0;
    for(let j=0;j<=b1-b0;j++) if(f[j]+g[b1-b0-j]>best) {best=f[j]+g[b1-b0-j];cut=j;}
    align(a0,mid,b0,b0+cut);align(mid,a1,b0+cut,b1);
  }
  align(0,left.length,0,right.length);
  const rows=[];let i=0,j=0;
  for(const [a,b] of [...matches,[left.length,right.length]]) {
    while(i<a) rows.push({type:"removed",text:left[i++]});
    while(j<b) rows.push({type:"added",text:right[j++]});
    if(i<left.length && j<right.length) {rows.push({type:"same",text:left[i++]});j++;}
  }
  return {mode:"lines",rows,formatOnly};
}


// 计数与渲染容量分开：全文模式仍无损保留两版，不生成超量 DOM。
// 公共前后缀只从计数的计算窗口剥离，行终止符始终参与比较。
export function diffLineCounts(before, after) {
  const exact = (removed, added) => ({ available: true, removed, added, reason: "" });
  if (before === after) return exact(0, 0);
  const tokens = text => text.match(/[^\r\n]*(?:\r\n|\r|\n)|[^\r\n]+$/g) || [];
  const left = tokens(before), right = tokens(after);
  let start = 0, leftEnd = left.length, rightEnd = right.length;
  while (start < leftEnd && start < rightEnd && left[start] === right[start]) start++;
  while (leftEnd > start && rightEnd > start && left[leftEnd - 1] === right[rightEnd - 1]) {
    leftEnd--; rightEnd--;
  }
  const a = left.slice(start, leftEnd), b = right.slice(start, rightEnd);
  if (!a.length || !b.length) return exact(a.length, b.length);
  // 单行或没有公共行时 LCS 可在线性工作量内确定，不占用有界二次路径。
  if (a.length === 1 || b.length === 1) {
    const same = a.length === 1 ? b.includes(a[0]) : a.includes(b[0]);
    return exact(a.length - Number(same), b.length - Number(same));
  }
  const leftSet = new Set(a);
  if (!b.some(line => leftSet.has(line))) return exact(a.length, b.length);
  if (a.length > 5000 || b.length > 5000)
    return { available: false, removed: null, added: null,
      reason: "去掉相同前后缀后，变化窗口仍超过 5000 行；保留两版全文，不猜差异行数" };
  const leftText = a.join(""), rightText = b.join("");
  if (leftText.length > 100000 || rightText.length > 100000)
    return { available: false, removed: null, added: null,
      reason: "去掉相同前后缀后，变化窗口仍超过 100000 字符；保留两版全文，不猜差异行数" };
  const result = diffText(leftText, rightText);
  return exact(result.rows.filter(row => row.type === "removed").length,
    result.rows.filter(row => row.type === "added").length);
}
