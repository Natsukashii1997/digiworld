#!/usr/bin/env python3
"""资产仓库「设计」类型像素图候选：和 src/pixel.jsx 同一套网格语言（16 宽，K 轮廓 / N 22% 填充 / P 40% 阴影 / L 高光 / W 白），
画在正式页抓下来的 DES.01 卡上并排比较。用法（项目根目录）：python3 -I docs/design/ui-v19/build/design-glyph.py → ../资产仓库-设计像素图.html"""
import pathlib, re

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE.parent
PALETTE = {"K": "currentColor", "N": "var(--px-glyph-fill)", "P": "color-mix(in srgb, currentColor 40%, transparent)", "L": "var(--design-highlight)", "W": "#ffffff"}

GRIDS = {
    "A · 画框改良": [
        ".KKKKKKKKKKKKKK.", "KLNNNNNNNNNNNNPK", "KN............PK", "KN...LL.......PK",
        "KN..LWWL......PK", "KN..LWWL......PK", "KN...LL...K...PK", "KN.......KLK..PK",
        "KN...K..KLNNK.PK", "KN..KLKKLNNNNKPK", "KN.KLNNKNNNNNNPK", "KNKLNNNNNNNNNNPK",
        "KNNNNNNNNNNNNNPK", "KPPPPPPPPPPPPPPK", ".KKKKKKKKKKKKKK.", "................",
    ],
    "B · 调色板": [
        "................", ".....KKKKKK.....", "...KKNNNNNNKK...", "..KNNNKKNNNNNK..",
        ".KNNNKWLKNNNNNK.", ".KNNNNKKNNKKNNK.", "KNNNNNNNNNKWLKPK", "KNKKKNNNNNNKKNPK",
        "KK...KNNNNNNNNPK", "KK...KNNNNKKNNPK", "KNKKKNNNNKWLKNPK", ".KNNNNNNNNKKNNK.",
        ".KNNNNNNNNNNPPK.", "..KKNNNPPPPPKK..", "....KKKKKKKK....", "................",
    ],
    "C · 画板": [
        "KK............KK", "KKKKKKKKKKKKKKKK", "..KLNNNNNNNNPK..", "..KNNNNNNNNNPK..",
        "..KNLLLLLNKKPK..", "..KNLLLLLNNNPK..", "..KNLLLLLNKKPK..", "..KNLLLLLNNNPK..",
        "..KNNNNNNNNNPK..", "..KNKKKKKKKNPK..", "..KNNNNNNNNNPK..", "..KNNWWWWNNNPK..",
        "..KNNNNNNNNNPK..", "..KPPPPPPPPPPK..", "KKKKKKKKKKKKKKKK", "KK............KK",
    ],
}


def svg(rows, size=64):
    assert len(rows) == 16 and all(len(r) == 16 for r in rows), "必须 16×16"
    rects = []
    for y, row in enumerate(rows):
        x = 0
        while x < 16:
            ch = row[x]
            if ch == ".":
                x += 1; continue
            x0 = x
            while x < 16 and row[x] == ch:
                x += 1
            rects.append(f'<rect x="{x0}" y="{y}" width="{x - x0 + 0.02:.2f}" height="1.02" fill="{PALETTE[ch]}"></rect>')
    return (f'<svg class="pixel  cover-glyph" viewBox="0 0 16 16" width="{size}" height="{size}" shape-rendering="crispEdges" aria-hidden="true">'
            f'<g class="pixel-frame f0">{"".join(rects)}</g></svg>')


main = (HERE / "assets-main.html").read_text(encoding="utf-8")
card = re.search(r'<article class="asset-card" style="--i: 0;">.*?</article>', main, re.S).group(0)
assert "DES.01" in card
cur_svg = re.search(r'<div class="cover lcd type-Design[^>]*>.*?(<svg.*?</svg>)', card, re.S).group(1)
css = "".join(f'<link rel="stylesheet" href="../../../src/{f}.css">' for f in ("tokens", "styles", "base", "interaction", "ui-v14", "assets-detail", "assets-quick-copy"))
cols = [("现版 · 画框", card, cur_svg.replace('width="64" height="64"', 'width="128" height="128"'))]
for name, rows in GRIDS.items():
    cols.append((name, card.replace(cur_svg, svg(rows)), svg(rows, 128)))
body = "".join(f'<section><h2>{n}</h2><div class="asset-grid one">{c}</div><div class="zoom">{z}</div></section>' for n, c, z in cols)
html = f'''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>资产仓库 · 设计类型像素图候选</title>{css}
<style>
body{{margin:0;background:var(--bg);color:var(--text);padding:28px 32px}}
h1{{margin:0 0 4px;font:700 18px var(--sans)}} .lead{{margin:0 0 20px;color:var(--muted);font:13px/1.6 var(--sans)}}
.cmp{{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px}}
section h2{{margin:0 0 10px;font:600 13px var(--mono);color:var(--cyan);letter-spacing:.06em}}
.asset-grid.one{{display:block}}
.zoom{{display:grid;place-items:center;height:168px;margin-top:14px;border-radius:12px;background:var(--panel);box-shadow:inset 0 0 0 1px var(--line-2);color:var(--pink)}}
</style></head><body>
<h1>资产仓库 · 「设计」类型像素图候选</h1><p class="lead">同一张 DES.01 卡，只换像素图；下排是 2× 放大。网格语言与 src/pixel.jsx 一致：K 轮廓 · N 22% 填充 · P 40% 阴影 · L 高光 · W 白。</p>
<main class="main-content page-assets v14"><div class="cmp">{body}</div></main>
</body></html>'''
(OUT / "资产仓库-设计像素图.html").write_text(html, encoding="utf-8")
print("已生成：资产仓库-设计像素图.html（现版 + 3 候选）")
