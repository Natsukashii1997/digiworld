#!/usr/bin/env python3
"""资产仓库的真实数据：卡片上的字段从正式页抓下来的标记（assets-main.html）里取，正文与版本数从只读抓的 /api/workspace 里取，
写进 data.json 的 assets。用法：python3 -I docs/design/ui-v19/build/assets-data.py <workspace.json>"""
import html, json, pathlib, re, sys

HERE = pathlib.Path(__file__).resolve().parent
dom = (HERE / "assets-main.html").read_text(encoding="utf-8")
ws = json.load(open(sys.argv[1], encoding="utf-8"))
text = lambda x: html.unescape(re.sub(r"<[^>]+>", "", x)).strip()
by_title = {}
for a in ws["assets"]:
    if a["archived"]:
        continue
    v = a["versions"][-1]
    by_title[v["title"]] = {"id": a["id"], "body": v.get("content") or "", "versions": len(a["versions"]), "at": v.get("at") or a["createdAt"], "createdAt": a["createdAt"], "tagsAll": v.get("tags") or []}
scroll_ws = next(s for s in ws["scrolls"] if not s.get("deletedAt"))
items, scroll = [], None
for m in re.finditer(r'<article class="asset-card( scroll-card)?"[^>]*>(.*?)</article>', dom, re.S):
    body = m.group(2)
    code = re.search(r'cover-code">([^<]*)', body).group(1)
    uses = int(re.search(r'odo-digit">(\d+)', body).group(1))
    typ = re.search(r'card-open type-(\w+)', body).group(1)
    if m.group(1):
        name = re.search(r'scroll-card-title" title="焚决 · ([^"]*)"', body).group(1)
        entries = []
        for e in re.finditer(r'<li class="scroll-preview-entry" data-scroll-entry-id="([^"]+)">.*?scroll-preview-index"[^>]*>(\d+)</span><h4 title="([^"]*)">.*?<p class="scroll-preview-text">(.*?)</p><span class="scroll-preview-uses">已复制 (\d+) 次', body, re.S):
            full = next((x["text"] for x in scroll_ws["entries"] if x["id"] == e.group(1)), text(e.group(4)))
            entries.append({"id": e.group(1), "n": e.group(2), "name": html.unescape(e.group(3)), "text": full, "uses": int(e.group(5))})
        scroll = {"id": scroll_ws["id"], "pos": len(items), "code": code, "type": "Scroll", "label": "焚决", "name": name, "uses": uses, "entries": entries, "at": scroll_ws.get("updatedAt") or scroll_ws["createdAt"], "stage": "成熟期", "cells": 3}
        continue
    label = html.unescape(re.search(r'<div class="card-type">(?:<svg.*?</svg>)?([^<]*)<span>', body, re.S).group(1)).strip()
    name = text(re.search(r"<h3>(.*?)</h3>", body, re.S).group(1))
    dm = re.search(r'<p( class="asset-description-empty")?>(.*?)</p>', body, re.S)
    desc = "" if dm.group(1) else text(dm.group(2))
    tags = [text(t) for t in re.findall(r"<span>(.*?)</span>", re.search(r'<div class="card-tags">(.*?)</div>', body, re.S).group(1))]
    stage = re.search(r'stage-name">([^<]*)', body).group(1)
    cells = len(re.findall(r'<i class="on ', body))
    w = by_title.get(name, {})
    items.append({"id": w.get("id", code), "code": code, "type": typ, "label": label, "name": name, "desc": desc, "tags": tags, "stage": stage, "cells": cells, "uses": uses,
                  "body": w.get("body", ""), "versions": w.get("versions", 1), "at": w.get("at", ""), "createdAt": w.get("createdAt", "")})
tags = re.findall(r'<option value="[^"]+">([^<]+) · (\d+)</option>', dom)
p = HERE / "data.json"
d = json.load(open(p, encoding="utf-8"))
d["assets"] = {"capturedAt": "2026-10-24", "items": items, "scroll": scroll, "tags": [[t, int(n)] for t, n in tags]}
json.dump(d, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("资产", len(items), "条；焚决卷", scroll["name"], len(scroll["entries"]), "条；标签", len(tags), "个")
for i in items: print(" -", i["code"], i["type"], i["name"], "| 出战", i["uses"], "|", i["stage"], i["cells"], "| 正文", len(i["body"]), "| v", i["versions"], "|", i["at"][:10])
