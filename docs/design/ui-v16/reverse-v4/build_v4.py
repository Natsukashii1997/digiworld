#!/usr/bin/env python3
# 逆向工程 v4 视觉稿：一条线（投入 → 终端取证[仅软件] → 复刻任务包）。沿用 v16 外壳/页头/标本架真实结构，只读合成数据。
import re, sys, html
D = sys.argv[1]  # docs/design/ui-v16
OUT = f"{D}/reverse-v4"
src = open(f"{D}/pages/reverse-fn.html", encoding="utf-8").read()

GEAR_OK = ('<div class="gear" role="group" aria-label="REA 取证工具"><span class="gear-scr"><span class="en">REA</span><b>6.4.0</b></span>'
           '<span class="gear-txt"><span class="gear-state ok">已是最新</span><small>正式发布版 · 今天 20:40 检查</small></span>'
           '<button class="gear-btn">检查更新</button></div>')
GEAR_NEW = ('<div class="gear has-new" role="group" aria-label="REA 取证工具"><span class="gear-scr"><span class="en">REA</span><b>6.4.0</b></span>'
            '<span class="gear-txt"><span class="gear-state new">可更新到 6.5.0</span><small>GitHub 正式发布 · 10/12</small></span>'
            '<button class="gear-btn on">一键更新</button></div>')

def rec(t, title, meta, dot, label, on=False):
    return (f'<button class="rec{" on" if on else ""}" role="radio" aria-checked="{str(on).lower()}"><span class="rec-type"><span class="en">{t}</span></span>'
            f'<b>{title}</b><span class="en-meta">{meta}</span><span class="dot {dot}">{label}</span></button>')

def rail(sel):
    items = [("ELECTRON", "Notion · 复制块的富格式剪贴板", "Notion.app · 10/13", "verify", "任务包就绪"),
             ("WEB", "飞书文档 · 划词评论浮层", "feishu.cn · 10/13", "todo", "待取证"),
             ("IMG", "SUMMER NOISE 音乐节海报", "behance.net · 10/04", "verify", "任务包就绪"),
             ("TXT", "产品发布帖的节奏", "x.com · 10/02", "verify", "任务包就绪"),
             ("TXT", "先给结论，再给理由", "mp.weixin.qq.com · 09/28", "done", "已存 Skill")]
    return ('<aside class="rail" aria-label="标本架"><div class="rail-filter simple" role="radiogroup" aria-label="筛选">'
            '<button role="radio" aria-checked="true">全部<span>5</span></button><button role="radio" aria-checked="false">软件<span>2</span></button>'
            '<button role="radio" aria-checked="false">作品<span>3</span></button></div><div class="rail-list" role="radiogroup" aria-label="参照物">'
            + "".join(rec(*it, on=(i == sel)) for i, it in enumerate(items)) + "</div></aside>")

term = '''<section class="term" aria-label="REA 取证终端"><div class="term-bar"><span class="en">REA · 取证终端</span><span class="term-state">完成 · 71 秒</span><button>重新取证</button></div>
<pre class="term-body"><span class="c">rea analyze-javascript-application /Applications/Notion.app/Contents/Resources/app.asar --integrity-policy record-and-continue</span>
<span class="dim">▸ 盘点并解析应用文件 …</span>
<span class="ok">✓ 4,812 个模块 · 37 条 IPC 通道 · 2 个原生扩展</span>          <span class="ev">ev_034b7236…</span>
<span class="warn">! 完整性不匹配 1 处：已记录并继续，相关字节视为不可信</span>
<span class="warn">! 覆盖不完整：796 条限制（大文件解析超出内存等）</span>
<span class="c">rea trace-application-feature  seed=string:"copy"</span>
<span class="ok">✓ 命中 14 处 → renderer/clipboard.js · preload/index.js · main/clipboard-handler.js</span>   <span class="ev">ev_9d04e6f2…</span>
<span class="c">rea trace-application-feature  seed=channel:"notion:clipboard-write"</span>
<span class="ok">✓ 渲染进程 → preload → 主进程 clipboard.write()</span>          <span class="ev">ev_3fa2b8c1…</span>
<span class="dim">── 完成。原始证据 107 MB 只留在本机，任务包只带摘要 ──</span></pre></section>'''

def pack(title, lines, meta, skill=True):
    body = "\n".join(lines)
    return (f'<section class="pack-out" aria-labelledby="pk-t"><div class="pack-top"><span class="en">TASK PACK</span><h3 id="pk-t">复刻任务包</h3><small>{meta}</small></div>'
            f'<pre class="pack-pre">{body}</pre><div class="pack-act"><button class="button">复制任务包</button>'
            + ('<button class="text-act">存成 Skill</button>' if skill else "")
            + '<span class="hint">拿去 Codex 或 Claude Code 里粘贴即可</span></div></section>')

soft_pack = pack("", [
    "<b># 复刻任务包 · Notion 复制块的富格式剪贴板</b>",
    "目标：/Applications/Notion.app（Electron · SHA e0f0a709 · REA 6.4.0 取证）",
    "想弄懂：复制一个块时，富格式是怎么进剪贴板的",
    "",
    "<b>## 已取得的证据（摘要）</b>",
    "1. renderer/clipboard.js 序列化选中块 · ev_9d04e6f2…",
    "2. preload 暴露 writeClipboard，经 notion:clipboard-write 发往主进程 · ev_3fa2b8c1…",
    "3. 主进程 clipboard.write() 同时写 text/html 与私有格式 · ev_5e88ac27…",
    "<b>## 请你做</b>",
    "1. 用 rea 复核以上三条，区分观察 / 推断 / 未知 …",
], "3,140 字 · 3 条证据摘要 · 2 项未覆盖")

work_pack = pack("", [
    "<b># 复刻任务包 · SUMMER NOISE 音乐节海报</b>",
    "参照：behance.net/gallery/… · 本机截图 ×3（路径见下）",
    "我看重：粗颗粒噪点 + 撞色大字的压迫感",
    "",
    "<b>## 请你做</b>",
    "1. 逆推风格配方：色板（色值）、字体、构图、质感、生图提示词与反向提示词",
    "2. 只凭配方重画一张，和原图并排给我看 …",
], "1,860 字 · 附 3 张截图路径")

def head(code, title, meta, want, seeds=""):
    return (f'<div class="sp-head"><span class="en">{code}</span><h2>{title}</h2><span class="sp-meta">{meta}</span>'
            f'<p class="sp-want"><b>想弄懂</b>{want}{seeds}</p></div>')

soft_main = ('<div class="re-main"><div class="bench m-screen">'
             + head("SPECIMEN · ELECTRON", "Notion · 复制块的富格式剪贴板", "/Applications/Notion.app · SHA e0f0a709 · RE-0A1B",
                    "复制一个块时，富格式是怎么进剪贴板的", '<span class="seed">copy</span><span class="seed">clipboard</span>')
             + term + soft_pack + "</div></div>")
work_main = ('<div class="re-main"><div class="bench m-screen">'
             + head("SPECIMEN · IMG", "SUMMER NOISE 音乐节海报", "behance.net · 本机截图 ×3 · RE-0412", "粗颗粒噪点 + 撞色大字的压迫感")
             + '<section class="orig" aria-label="原件"><span class="en">ORIGINAL · 原件</span><div class="orig-shots"><span></span><span></span><span></span></div></section>'
             + work_pack + "</div></div>")

def page(main, gear, sel, extra=""):
    s = src
    s = s.replace("把参照物逆推成配方，验证能 1:1 复刻，再举一反三。", "投入一件好东西，拿到能直接交给 AI 复刻的任务包。")
    s = s.replace("<li>只逆向你提供或公开的材料</li><li>配方经复刻验证才算数</li>", "<li>只逆向你拥有或获准分析的东西</li><li>软件由 REA 在本机取证</li>")
    s = s.replace('<div class="page-heading-action">', '<div class="page-heading-action v3-act">' + gear, 1)
    i = s.find('<aside class="rail"'); j = s.find("</aside>", i) + len("</aside>")
    s = s[:i] + rail(sel) + s[j:]
    i = s.find('<div class="re-main">'); j = s.rfind("</div></div></main>")
    s = s[:i] + main + s[j + len("</div>"):]
    s = s.replace("<title>v16 · 逆向工程</title>", "<title>v4 · 逆向工程</title>")
    s = s.replace('<link rel="stylesheet" href="../v16.css">', '<link rel="stylesheet" href="../v16.css"><link rel="stylesheet" href="reverse-v4.css">')
    return s.replace("</main>", "</main>" + extra, 1)

sheet = open(f"{D}/reverse-v3/update.html", encoding="utf-8").read()
sheet = sheet[sheet.find('<div class="upd-scrim">'):sheet.find("</aside>", sheet.find('<aside class="upd-sheet')) + len("</aside>")]

open(f"{OUT}/software.html", "w", encoding="utf-8").write(page(soft_main, GEAR_OK, 0))
open(f"{OUT}/artwork.html", "w", encoding="utf-8").write(page(work_main, GEAR_OK, 2))
open(f"{OUT}/update.html", "w", encoding="utf-8").write(page(soft_main, GEAR_NEW, 0, sheet))
print("ok")
