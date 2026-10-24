#!/usr/bin/env python3
"""UI v19 · 三版预览的生成脚本。用法（项目根目录）：python3 -I docs/design/ui-v19/build/make.py

世界总览：一（中枢）从 ui-v16 的首页稿原样生成，只换四块屏的内容、导航、日期与问候；二（仪表台）、三（状态屏）
把 ui-v18 稿里的侧栏（含伙伴屏画布）、暴龙机外壳、像素头像与 Prompt 像素图填进 build/ 下的模板。
随手记：一（便签墙）从 ui-v16 的随手记稿原样生成，只换筛选片与便签内容；二（收件箱）、三（便签架）同样填模板。
真实数据在 build/data.json（正式环境只读抓取的随手记原文）。
"""
import datetime
import html
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[4]
V16 = ROOT / "docs/design/ui-v16/pages"
V18 = ROOT / "docs/design/ui-v18/基地-B.html"
OUT = ROOT / "docs/design/ui-v19"
BUILD = OUT / "build"
DATA = json.loads((BUILD / "data.json").read_text(encoding="utf-8"))

TODAY = datetime.date.today()
WEEKDAY_ZH = "星期一 星期二 星期三 星期四 星期五 星期六 星期日".split()
WEEKDAY_EN = "MON TUE WED THU FRI SAT SUN".split()
DATE_ZH = f"{TODAY.month} 月 {TODAY.day} 日 {WEEKDAY_ZH[TODAY.weekday()]}"
DATE_SHORT = f"{TODAY.month}月{TODAY.day}日"
WEEK_EN = f"{WEEKDAY_EN[TODAY.weekday()]} · WEEK {TODAY.isocalendar()[1]}"

# 5×7 点阵字模，与 src/v14.jsx 的 LcdText / ui-v18/build/lcd-digits.js 相同
GLYPHS = {
    "0": "01110100011001110101110011000101110", "1": "00100011000010000100001000010001110",
    "2": "01110100010000100010001000100011111", "3": "11111000100010000010000011000101110",
    "4": "00010001100101010010111110001000010", "5": "11111100001111000001000011000101110",
    "6": "00110010001000011110100011000101110", "7": "11111000010001000100010000100001000",
    "8": "01110100011000101110100011000101110", "9": "01110100011000101111000010001001100",
}
BOOKMARK = ('<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
            'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-bookmark">'
            '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"></path></svg>')
HOME16 = (V16 / "home.html").read_text(encoding="utf-8")


def lcd_date(month, day):
    """v16 首页稿的大字日期：203×49 的点阵（6px 点、7px 距），两位月 · 两位日。"""
    text = f"{month:02d}·{day:02d}"
    starts = [0, 6, None, 18, 24]
    dim, lit = [], []
    rect = lambda c, r: f'<rect x="{c * 7}" y="{r * 7}" width="6" height="6" style="--c:{c}"></rect>'
    for ch, c0 in zip(text, starts):
        if ch == "·":
            for c in (13, 14):
                for r in (3, 4):
                    dim.append(rect(c, r)); lit.append(rect(c, r))
            continue
        g = GLYPHS[ch]
        for r in range(7):
            for c in range(5):
                dim.append(rect(c0 + c, r))
                if g[r * 5 + c] == "1":
                    lit.append(rect(c0 + c, r))
    return (f'<svg width="203" height="49" viewBox="0 0 203 49" role="img" aria-label="{text}">'
            f'<g fill="currentColor" opacity=".1">{"".join(dim)}</g><g fill="currentColor">{"".join(lit)}</g></svg>')


def icon16(label):
    return re.search(r'<button class="nav-item[^"]*"[^>]*>(<svg(?:(?!</svg>).)*</svg>)<span>' + label, HOME16, re.S).group(1)


def nav16(active):
    """v16 外壳的导航，换成现在的模块；active 是当前页。"""
    count = lambda n: f'<small class="nav-count"><span class="odometer  "><span class="odo-digit">{n}</span></span></small>'
    def item(label, svg, n=None):
        on = label == active
        return (f'<button class="nav-item{"  active" if on else " "}"{" aria-current=\"page\"" if on else ""}>'
                f'{svg}<span>{label}</span>{count(n) if n else ""}</button>')
    zone = lambda cls, title, en, items: (f'<div class="nav-zone nav-zone-{cls}" role="group" aria-label="{title}"><div class="nav-divider" role="separator"></div>'
                                          f'<div class="nav-zone-title" aria-hidden="true">{title}<small>{en}</small></div><div class="nav-group">{"".join(items)}</div></div>')
    home_btn = re.search(r'<button class="nav-item[^"]*"[^>]*>(?:(?!</button>).)*?<span>世界总览</span></button>', HOME16, re.S).group(0)
    if active != "世界总览":
        home_btn = home_btn.replace(' aria-current="page"', "").replace("nav-item  active", "nav-item ")
    return ('<nav aria-label="主导航" class="nav">'
            f'<div class="nav-zone nav-zone-today" role="group" aria-label="今日"><div class="nav-group">{home_btn}</div></div>'
            + zone("work", "捕获", "CAPTURE", [item("随手记", icon16("随手记"), 13), item("个人收藏", BOOKMARK, 13)])
            + zone("life", "炼化与出战", "FORGE", [item("资产仓库", icon16("资产仓库"), 8), item("项目空间", icon16("项目空间")), item("逆向工程", icon16("逆向工程"))])
            + zone("system", "系统", "SYSTEM", [item("设置", icon16("设置"))])
            + "</nav>")


def shell16(src, title, active, code, page):
    """v16 外壳的公共替换：样式路径、标题、导航、顶栏。"""
    s = src.replace('href="../app.css"', 'href="../ui-v16/app.css"').replace('href="../v16.css"', 'href="../ui-v16/v16.css"')
    s = re.sub(r"<title>.*?</title>", f"<title>{title}</title>", s)
    s = re.sub(r'<nav aria-label="主导航" class="nav">.*?</nav>', lambda m: nav16(active), s, flags=re.S)
    s = re.sub(r'<button class="icon-button topbar-inbox".*?</button>', "", s, flags=re.S)  # 待处理模块已撤下
    s = re.sub(r'<span class="crumb-code">\d+</span><strong>[^<]*</strong>', f'<span class="crumb-code">{code}</span><strong>{page}</strong>', s)
    return s


# ---------------- 世界总览 ----------------
def make_home_v1():
    s = shell16(HOME16, "世界总览 · 一 · 中枢（v16 原样）", "世界总览", "00", "世界总览")
    # 真实文本比稿里的长，v16 稿的栏是 330px 定宽但面板会被长文本撑开；这里只补 min-width，不改 v16 的样式文件
    s = s.replace("<style>body{margin:0}</style>", "<style>body{margin:0}"
                  ".page-home.v16 .hx-col-l,.page-home.v16 .hx-col-r,.page-home.v16 .hx-q,.page-home.v16 .hx-proj ol{grid-template-columns:minmax(0,1fr)}"
                  ".page-home.v16 .hx-mod,.page-home.v16 .hx-mod>*,.page-home.v16 .hx-q li,.page-home.v16 .hx-proj li{min-width:0}</style>")
    go_arrow = re.search(r'<button class="hx-go"[^>]*>继续 (<svg.*?</svg>)</button>', HOME16, re.S).group(1)
    sprite = re.search(r'<span class="hx-av">(<svg.*?</svg>)</span>', HOME16, re.S).group(1)
    sec_a = ('<section class="hx-mod hx-today" style="--hue:77,227,255" aria-labelledby="hx-t1"><header><span class="hx-port mono">A</span>'
             '<h2 id="hx-t1"><span class="en">QUICK NOTES</span>随手记</h2><a href="#">全部 →</a></header>\n'
             '  <div class="hx-qcount"><span><b class="mono c">13</b>待孵化</span><span><b class="mono y">1</b>已投递</span></div>'
             '<ul class="hx-q"><li class="main"><b>【走查】牛马之家：验证随手记投递 → 继续口令 → 已交代</b><span class="mono">10/23</span></li>'
             '<li><b>明确当前项目进度的 prompt · 大的审查的 prompt</b><span class="mono">10/23</span></li>'
             '<li><b>新的结构是用户概览、用户路径、快捷话术、待办事项</b><span class="mono">10/22</span></li>'
             '<li><b>Github 排行榜内部版本：日涨星、周涨星、月涨星</b><span class="mono">10/22</span></li></ul>\n</section>')
    sec_b = ('<section class="hx-mod hx-pend" style="--hue:255,107,107" aria-labelledby="hx-t2"><header><span class="hx-port mono">B</span>'
             '<h2 id="hx-t2"><span class="en">COLLECTION</span>个人收藏</h2><a href="#">全部 →</a></header>\n'
             '  <div class="hx-qcount"><span><b class="mono r">13</b>条</span><span><b class="mono y">6</b>AI 学习</span><span><b class="mono c">6</b>未分组</span></div>'
             '<ul class="hx-q"><li class="main"><b>6 种高审美 dashboard 交互拿来就用</b><span class="mono">设计美学</span></li>'
             '<li><b>新野兽派 & 新粗野主义｜6 种超抓眼 UI 交互</b><span class="mono">设计美学</span></li>'
             '<li><b>前端网页设计风格参考</b><span class="mono">编程开发</span></li>'
             '<li><b>新拟物风 5 种高级交互拿来就用</b><span class="mono">AI 工具</span></li></ul>\n</section>')
    sec_c = ('<section class="hx-mod hx-col" style="--hue:255,138,36" aria-labelledby="hx-t3"><header><span class="hx-port mono">C</span>'
             '<h2 id="hx-t3"><span class="en">ASSET LIBRARY</span>资产仓库</h2><a href="#">全部 →</a></header>\n'
             '  <p class="hx-run">8 份资产 <span class="mono">Prompt 5 · 规则 1 · 焚决 1 · 设计 1</span></p>\n'
             '  <ul class="hx-q"><li><b>答前校准</b><span class="mono">Prompt · ×2</span></li><li><b>会话交接 Handoff</b><span class="mono">Prompt · ×3</span></li>'
             '<li><b>省 Token 守则</b><span class="mono">规则</span></li></ul>\n'
             f'  <div class="hx-next"><span><b>心法 · 焚决</b><small>2 条 · 复制 4 次</small></span><button class="hx-go" aria-label="复制 心法">复制 {go_arrow}</button></div>\n</section>')
    sec_d = ('<section class="hx-mod hx-proj" style="--hue:166,227,110" aria-labelledby="hx-t4"><header><span class="hx-port mono">D</span>'
             '<h2 id="hx-t4"><span class="en">SAVE DATA</span>项目空间</h2><a href="#">项目空间 →</a></header>\n'
             '  <ol><li class="warn"><span class="hx-slot mono">01</span><b>牛马之家</b><span class="hx-flag warn">下一步未填 · 收件 7</span><span class="hx-av"><i class="hx-ghost"></i></span></li>'
             f'<li class=""><span class="hx-slot mono">02</span><b>数码世界 | 个人 AI 工作台</b><span class="hx-flag">阶段 2 已发布</span><span class="hx-av">{sprite}</span></li>'
             '<li class="sleep"><span class="hx-slot mono">03</span><b>空存档</b><span class="hx-flag sleep">去库里开新档</span><span class="hx-av"><i class="hx-ghost"></i></span></li></ol>\n</section>')
    for cls, h in [("hx-today", sec_a), ("hx-pend", sec_b), ("hx-col", sec_c), ("hx-proj", sec_d)]:
        s, n = re.subn(r'<section class="hx-mod ' + cls + r'".*?</section>', lambda m, h=h: h, s, flags=re.S)
        assert n == 1, cls
    s = re.sub(r'<div class="hx-date" aria-label="[^"]*"><span class="lcd-num "><svg width="203".*?</svg></span>',
               lambda m: f'<div class="hx-date" aria-label="{DATE_ZH}"><span class="lcd-num ">{lcd_date(TODAY.month, TODAY.day)}</span>', s, flags=re.S)
    s = re.sub(r'<span class="hx-dow"><b>[^<]*</b><span class="en">[^<]*</span></span>',
               f'<span class="hx-dow"><b>{WEEKDAY_ZH[TODAY.weekday()]}</b><span class="en">{WEEK_EN}</span></span>', s)
    s = re.sub(r'<p class="hx-greet">.*?</p>', '<p class="hx-greet">晚上好。<b class="r">13 条</b>随手记待孵化，<b class="o">牛马之家</b> 下一步还没填。</p>', s, flags=re.S)
    s = s.replace("再完成 3 次协同就会孵化", "13 颗蛋待孵化")
    s = re.sub(r'<div class="hx-quick">.*?</div>', '<div class="hx-quick"><a href="#">去随手记</a><i></i><a href="#">去收藏</a><i></i><a href="#">新建资产</a></div>', s, flags=re.S)
    # 走线信号：有事的线才亮——A 随手记 13 条待孵化（橙），D 牛马之家下一步未填（黄）
    s = re.sub(r'<path class="hx-sig [roy]" d="[^"]*"/>', "", s)
    pa = "M330 118 H354 Q366 118 366 130 V204 Q366 216 378 216 H429"
    pd = "M748 452 H724 Q712 452 712 440 V263 Q712 251 700 251 H625"
    s = s.replace(f'<path class="hx-tr" d="{pa}"/>', f'<path class="hx-tr" d="{pa}"/><path class="hx-sig o" d="{pa}"/>')
    s = s.replace(f'<path class="hx-tr" d="{pd}"/>', f'<path class="hx-tr" d="{pd}"/><path class="hx-sig y" d="{pd}"/>')
    assert s.count("hx-sig") == 2
    (OUT / "世界总览-1-中枢.html").write_text(s, encoding="utf-8")


def v18_parts(active):
    v18 = V18.read_text(encoding="utf-8")
    aside = v18[v18.find('<aside class="side">'): v18.find("</aside>") + 8]
    aside = aside.replace("基地</a>", "世界总览</a>")
    aside = aside.replace('随手记<i class="egg">5</i>', '随手记<i class="egg">13</i>').replace('个人收藏<i class="egg">12</i>', '个人收藏<i class="egg">13</i>')
    aside = aside.replace('资产仓库<i class="">9</i>', '资产仓库<i class="">8</i>')
    aside, n = re.subn(r'(<a class="" href="#">(?:(?!</a>).)*?项目空间<i class="">2</i></a>)', lambda m: m.group(1) + f'<a class="" href="#">{icon16("逆向工程")}逆向工程</a>', aside, flags=re.S)
    assert n == 1
    if active != "世界总览":
        aside = aside.replace('<a class="on" href="#">', '<a class="" href="#">', 1)
        aside, n = re.subn(r'<a class="" (href="#">(?:(?!</a>).)*?' + active + ")", lambda m: '<a class="on" ' + m.group(1), aside, count=1, flags=re.S)
        assert n == 1, active
    d = v18.find('data-partner="stage"')
    start = v18.rfind('<div class="b-stage">', 0, d)
    depth, end = 0, start
    for m in re.finditer(r"<div\b|</div>", v18[start:]):
        depth += 1 if m.group(0) == "<div" else -1
        if depth == 0:
            end = start + m.end(); break
    stage = v18[start:end].replace('<div class="b-stage">', '<div class="stage">')
    stage = re.sub(r'<span class="b-dvkey [ab]">[AB]</span>', "", stage)
    stage156 = stage.replace("width:232px;height:232px", "width:156px;height:156px").replace('width="232" height="232"', 'width="156" height="156"')
    sprite = re.search(r'<svg class="pixel  agent-sprite "(?:(?!</svg>).)*</svg>', v18, re.S).group(0)
    prompt = re.search(r'<svg class="pixel cursor "(?:(?!</svg>).)*</svg>', v18, re.S).group(0)
    return {"<!--ASIDE-->": aside, "<!--STAGE:232-->": stage, "<!--STAGE:156-->": stage156, "<!--SPRITE-->": sprite, "<!--PROMPT-->": prompt,
            "<!--DATE-->": DATE_SHORT, "<!--WEEK-->": WEEK_EN}


def fill(tpl, name, parts):
    t = (BUILD / tpl).read_text(encoding="utf-8")
    for k, v in parts.items():
        t = t.replace(k, v)
    left = re.findall(r"<!--[A-Z][A-Z0-9:-]*-->", t)
    assert not left, f"{tpl} 模板里还有没填的占位：{left}"
    (OUT / name).write_text(t, encoding="utf-8")


def make_home_v23():
    parts = v18_parts("世界总览")
    fill("2-仪表台.html", "世界总览-2-仪表台.html", parts)
    fill("3-状态屏.html", "世界总览-3-状态屏.html", parts)


# ---------------- 随手记 ----------------
def md_html(text, ol="", ul="", tasks="tasks"):
    """正文的 md1 → HTML：`1. ` 编号、`- ` 无序、`- [ ]` 待办，空行分段；其余行连成段落。"""
    out, para, lst = [], [], None
    def close_list():
        nonlocal lst
        if lst:
            out.append(f"</{lst[0]}>"); lst = None
    def close_para():
        if para:
            out.append("<p>" + "<br>".join(para) + "</p>"); para.clear()
    for raw in text.split("\n"):
        line = raw.rstrip()
        m_task = re.match(r"^\s*-\s*\[( |x|X)\]\s*(.*)$", line)
        m_ol = re.match(r"^\s*(\d+)[.．、]\s*(.*)$", line)
        m_ul = re.match(r"^\s*[-•]\s+(.*)$", line)
        if m_task or m_ol or m_ul:
            close_para()
            kind = "ul" if (m_task or m_ul) else "ol"
            cls = tasks if m_task else (ul if kind == "ul" else ol)
            if not lst or lst[0] != kind or lst[1] != cls:
                close_list(); lst = (kind, cls)
                out.append(f"<{kind}{(' class=\"' + cls + '\"') if cls else ''}>")
            if m_task:
                done = m_task.group(1).lower() == "x"
                out.append(f'<li class="{"done" if done else ""}">{html.escape(m_task.group(2))}</li>')
            else:
                out.append(f"<li>{html.escape((m_ol or m_ul).group(2 if m_ol else 1))}</li>")
        elif not line.strip():
            close_list(); close_para()
        else:
            close_list(); para.append(html.escape(line.strip()))
    close_list(); close_para()
    return "".join(out)


def note_view(n):
    at = datetime.datetime.fromisoformat(n["at"].replace("Z", "+00:00")).astimezone(datetime.timezone(datetime.timedelta(hours=8)))
    lines = [l for l in n["text"].split("\n") if l.strip()]
    first = re.sub(r"^\s*(\d+[.．、]|-\s*\[.\]|[-•])\s*", "", lines[0]).strip() if lines else "（空）"
    return {"id": n["id"], "time": at.strftime("%m/%d %H:%M"), "first": first, "lines": len(lines), "text": n["text"],
            "route": n.get("route"), "state": "delivered" if n.get("route") else "egg",
            "long": len(lines) > 6 or len(n["text"]) > 170}


NOTES = [note_view(n) for n in DATA["notes"]]
COUNTS = {"all": len(NOTES), "egg": sum(n["state"] == "egg" for n in NOTES), "delivered": sum(n["state"] == "delivered" for n in NOTES)}


def make_notes_v1():
    src = (V16 / "notes.html").read_text(encoding="utf-8")
    s = shell16(src, "随手记 · 一 · 便签墙（v16 原样）", "随手记", "01", "随手记")
    s = s.replace('<span class="page-code">09</span>', '<span class="page-code">01</span>')
    s = re.sub(r'<p class="page-lead">.*?</p>', '<p class="page-lead">先把念头记下来，再孵化：投递到项目、孵成资产、收入焚决或归档。</p>', s, flags=re.S)
    # 长便签的正文 overflow:hidden 会把编号列表的序号裁掉；序号放到内侧，不改 v16 样式文件
    s = s.replace("<style>body{margin:0}</style>", "<style>body{margin:0}.page-notes.v16 .sn.is-long .sn-ol,.page-notes.v16 .sn.is-long .sn-ul{list-style-position:inside}</style>")
    copy_ico = re.search(r'<button class="sn-ico" aria-label="复制">(.*?)</button>', src, re.S).group(1)
    fire_ico = re.search(r'<button class="sn-ico fire" aria-label="炼入焚决">(.*?)</button>', src, re.S).group(1)
    seal_ico = re.search(r'<span class="sn-seal">(<svg.*?</svg>)', src, re.S).group(1)
    pad = re.search(r'<button class="sn-pad".*?</button>', src, re.S).group(0)
    # 筛选片：照现在正式环境的 10 片
    chips = [("全部", COUNTS["all"], True), ("普通", COUNTS["all"], False), ("待办", 0, False), ("时间轴", 0, False), ("已炼", 0, False),
             ("待孵化", COUNTS["egg"], False), ("已投递", COUNTS["delivered"], False), ("已交代", 0, False), ("已孵成", 0, False), ("已归档", 0, False)]
    flt = '<div class="sn-filter" role="radiogroup" aria-label="随手记筛选">' + "".join(
        f'<button role="radio" aria-checked="{"true" if on else "false"}" class="{"on" if on else ""}">{k}<b>{v}</b></button>' for k, v, on in chips) + "</div>"
    s, n = re.subn(r'<div class="sn-filter".*?</div>', lambda m: flt, s, count=1, flags=re.S)
    assert n == 1
    tones = ["plain", "yellow", "green", "red", "blue", "gray"]
    tilts = ["0.9", "-0.6", "0.7", "-1", "0.8", "-0.4", "0.5", "-0.3", "0.6", "-0.8", "0.4", "-0.5", "0.9", "-0.7"]
    def card(i, v):
        seal = f'<span class="sn-seal">{seal_ico}<b>已投递 · {v["route"]}</b></span>' if v["route"] else ""
        more = '<button class="sn-more">展开全文</button>' if v["long"] else ""
        return (f'<article class="sn tone-{tones[i % len(tones)]}{" is-long" if v["long"] else ""}" style="--tilt:{tilts[i % len(tilts)]}deg">\n'
                f'  <i class="sn-tape" aria-hidden="true"></i>\n  <header><time class="sn-time">{v["time"]}</time>{seal}</header>\n'
                f'  <div class="sn-body">{md_html(v["text"], "sn-ol", "sn-ul", "sn-tasks")}</div>\n  {more}\n'
                f'  <footer class="sn-act"><button class="sn-ico" aria-label="复制">{copy_ico}</button><button class="sn-ico fire" aria-label="炼入焚决">{fire_ico}</button></footer>\n</article>')
    cards = [card(i, v) for i, v in enumerate(NOTES)]
    cols = [[pad] + cards[0::3], cards[1::3], cards[2::3]]
    wall = '<div class="sn-wall">' + "".join(f'<div class="sn-col">{"".join(c)}</div>' for c in cols) + "</div>"
    lst = '<div class="sn-list">' + pad + "".join(cards) + "</div>"
    s, n = re.subn(r'<div class="sn-wall">.*?</div></div><div class="sn-list">.*?</div></div></main>', lambda m: wall + lst + "</div></main>", s, count=1, flags=re.S)
    assert n == 1, "随手记稿的墙与列表没匹配上"
    (OUT / "随手记-1-便签墙.html").write_text(s, encoding="utf-8")


def make_notes_v23():
    parts = v18_parts("随手记")
    state_chip = lambda v: (f'<span class="chip lcd-chip">已投递 · {v["route"]}</span>' if v["state"] == "delivered" else '<span class="chip">待孵化</span>')
    rows = "".join(
        f'<div class="row{" on" if i == 0 else ""}" data-id="{v["id"]}" data-state="{v["state"]}" tabindex="0"><i class="dot"></i>'
        f'<div><b>{html.escape(v["first"])}</b><small>{v["time"]} · {v["lines"]} 行</small></div>{state_chip(v) if v["state"] == "delivered" else "<span></span>"}</div>'
        for i, v in enumerate(NOTES))
    data = {v["id"]: {"time": v["time"], "state": v["state"], "route": v["route"], "lines": v["lines"], "html": md_html(v["text"]), "text": v["text"]} for v in NOTES}
    first = NOTES[0]
    parts2 = dict(parts, **{"<!--ROWS-->": rows, "<!--NOTES-JSON-->": json.dumps(data, ensure_ascii=False).replace("</", "<\\/"),
                            "<!--FIRST-->": md_html(first["text"]), "<!--FIRST-TIME-->": first["time"], "<!--FIRST-LINES-->": str(first["lines"]),
                            "<!--FIRST-STATE-->": (f'已投递 · {first["route"]}' if first["route"] else "待孵化"),
                            "<!--N-ALL-->": str(COUNTS["all"]), "<!--N-EGG-->": str(COUNTS["egg"]), "<!--N-DELIVERED-->": str(COUNTS["delivered"])})
    fill("notes-2-收件箱.html", "随手记-2-收件箱.html", parts2)
    acts = ('<footer class="acts"><button class="act" data-go="deliver">投递</button><button class="act" data-go="hatch">孵成资产</button>'
            '<button class="act" data-go="refine">焚决</button><button class="act" data-go="archive">归档</button><button class="act" data-copy>复制</button></footer>')
    cards = "".join(
        f'<article class="card{" long" if v["long"] else ""}" data-id="{v["id"]}" data-state="{v["state"]}"><i class="tab" aria-hidden="true"></i>'
        f'<header><time>{v["time"]}</time>{state_chip(v)}</header><div class="body">{md_html(v["text"])}</div>'
        f'{"<button class=\"more\" data-more>展开</button>" if v["long"] else ""}{acts}</article>'
        for v in NOTES)
    parts3 = dict(parts, **{"<!--CARDS-->": cards, "<!--N-ALL-->": str(COUNTS["all"]), "<!--N-EGG-->": str(COUNTS["egg"]), "<!--N-DELIVERED-->": str(COUNTS["delivered"])})
    fill("notes-3-便签架.html", "随手记-3-便签架.html", parts3)


# ---------------- 对比页 ----------------
INDEX_TPL = (BUILD / "index.html").read_text(encoding="utf-8")


def make_index(name, title, items, note):
    tabs = "".join(f'<button data-v="{i + 1}">{label}</button>' for i, (label, _, _) in enumerate(items))
    views = "".join(f'<section class="view" data-v="{i + 1}"><h2><b>{label}</b>{cap}</h2><div class="frame"><iframe src="{file}" title="{label}"></iframe></div></section>'
                    for i, (label, cap, file) in enumerate(items))
    t = INDEX_TPL.replace("<!--TITLE-->", title).replace("<!--TABS-->", tabs).replace("<!--VIEWS-->", views).replace("<!--NOTE-->", note)
    (OUT / name).write_text(t, encoding="utf-8")


make_home_v1()
make_home_v23()
make_index("世界总览-三版对比.html", "世界总览 · 三版对比", [
    ("一 · 中枢", "暴龙机居中，四块屏在四周，走线有事才亮（v16 原样，只换四块屏的内容）", "世界总览-1-中枢.html"),
    ("二 · 仪表台", "暴龙机是顶上的仪表带，四个模块 2×2；实体机器材质，只有液晶亮", "世界总览-2-仪表台.html"),
    ("三 · 状态屏", "左边伙伴塔，右边四条模块卡带；四色哑光，像游戏的状态画面", "世界总览-3-状态屏.html"),
], "每版都是能操作的 1440 页面：试试记一笔（⌘↵）、复制、继续、戳蛋。")
make_notes_v1()
make_notes_v23()
make_index("随手记-三版对比.html", "随手记 · 三版对比", [
    ("一 · 便签墙", "胶带便签瀑布流，10 个筛选片（v16 原样，只换成真实便签）", "随手记-1-便签墙.html"),
    ("二 · 收件箱", "左边一行一条，右边整页读全文，四个去向在读页顶上；实体机器材质", "随手记-2-收件箱.html"),
    ("三 · 便签架", "便签还是便签，但摆正、等宽、胶带只表示状态；四个计数是液晶", "随手记-3-便签架.html"),
], "每版都是能操作的 1440 页面：试试记一笔 / 贴一张（⌘↵）、投递、归档、展开、复制。")
print("已生成：世界总览 ×3 + 对比页；随手记 ×3 + 对比页")


# ---------------- 个人收藏 ----------------
# 现版（阶段 2）的收藏页不是 v16 的"知识仓库"稿（那是另一个概念：知识源 → 个人说明芯片 → Agent），所以一不从 v16 稿生成，
# 而是把正式 5178 只读抓下来的渲染标记（build/collection-main.html，由 capture-collection.mjs 抓）装进 v16 外壳，样式用现版 src/collection.css。
COLL = DATA["collection"]
GNAMES = [g["name"] for g in COLL["groups"]]
PLAY = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="6 3 20 12 6 21 6 3"/></svg>'
E = html.escape


def coll_view(n):
    at = datetime.datetime.fromisoformat(n["savedAt"].replace("Z", "+00:00")).astimezone(datetime.timezone(datetime.timedelta(hours=8)))
    d = n["videoDuration"]
    return dict(n, time=at.strftime("%m/%d"), group=n["category"] if n["category"] in GNAMES else "散放",
                dur=f"{int(d // 60):02d}:{int(round(d % 60)):02d}" if d else "", host=n["sourceHost"].replace("www.", ""),
                search=" ".join([n["title"], n["category"], n["author"], *n["tags"]]).lower())


CNOTES = [coll_view(n) for n in COLL["notes"]]
CCOUNTS = {"all": len(CNOTES), "loose": sum(v["group"] == "散放" for v in CNOTES), "video": sum(v["type"] == "video" for v in CNOTES)}
GCOUNT = lambda g: sum(v["group"] == g for v in CNOTES)


def css_rules(path, needle):
    """从现版样式文件里抽出选择器含 needle 的顶层规则块（只给一 · 现版原样 用）。"""
    text = (ROOT / path).read_text(encoding="utf-8")
    return "".join(m.group(0).strip() for m in re.finditer(r"[^{}]*" + re.escape(needle) + r"[^{}]*\{[^{}]*\}", text))


def make_collection_v1():
    src = (V16 / "knowledge.html").read_text(encoding="utf-8")
    s = shell16(src, "个人收藏 · 一 · 桌面（现版原样）", "个人收藏", "02", "个人收藏")
    main = (BUILD / "collection-main.html").read_text(encoding="utf-8")
    s, n = re.subn(r"<main\b.*?</main>", lambda m: main, s, count=1, flags=re.S)
    assert n == 1
    # 现版样式依赖、v16 外壳里没有的：收藏令牌（src/tokens.css）、状态徽章（src/base.css）
    tokens = "".join(l.strip() for l in (ROOT / "src/tokens.css").read_text(encoding="utf-8").splitlines() if l.strip().startswith(("--collection-", "--primary-fill")))
    s = s.replace("<style>body{margin:0}", '<link rel="stylesheet" href="../../../src/collection.css"><style>body{margin:0}:root{' + tokens + "}"
                  + css_rules("src/base.css", "status-badge") + css_rules("src/base.css", "title-row") + css_rules("src/base.css", "page-help")
                  + ".collection-module .scroll-fade{flex:1;min-width:0}", 1)
    (OUT / "个人收藏-1-桌面.html").write_text(s, encoding="utf-8")


def k2_card(v):
    mark = f'<span class="mark">{PLAY}{v["dur"]}</span>' if v["type"] == "video" else (f'<span class="mark">图 {v["images"]}</span>' if v["images"] > 1 else "")
    meta = f'@{v["author"]} · {v["time"]} · ' + (f'文稿 {v["transcriptChars"]} 字' if v["type"] == "video" else f'图片文字 {v["ocrChars"]} 字')
    return (f'<article class="card" data-id="{v["id"]}" data-group="{E(v["group"])}" data-type="{v["type"]}" tabindex="0">'
            f'<div class="cover" data-open><img src="{v["coverUrl"]}" alt="" loading="lazy">{mark}</div>'
            f'<div class="body"><div class="line"><span class="chip cat">{E(v["category"])}</span><span class="chip state" data-state-chip hidden></span></div>'
            f'<h3 data-open>{E(v["title"])}</h3><small>{E(meta)}</small></div>'
            '<footer class="acts"><button class="act" data-hatch>孵化 ▾</button><button class="act" data-regroup>移入 ▾</button><button class="act" data-copy-link>复制链接</button></footer></article>')


def k3_row(v, on):
    sub = f'<span class="cat">{E(v["category"])}</span> · {v["time"]} · ' + (v["dur"] if v["dur"] else f'图 {v["images"]}')
    return (f'<div class="row{" on" if on else ""}" data-id="{v["id"]}" data-group="{E(v["group"])}" data-type="{v["type"]}" tabindex="0">'
            f'<img class="thumb" src="{v["coverUrl"]}" alt="" loading="lazy"><div><b>{E(v["title"])}</b><small>{sub}</small></div><span class="chip state" data-state-chip hidden></span></div>')


def make_collection_v23():
    parts = v18_parts("个人收藏")
    keep = ("title", "category", "type", "time", "author", "content", "transcript", "transcriptChars", "ocrChars", "images", "host", "url", "tags", "search", "dur")
    notes = {v["id"]: dict({k: v[k] for k in keep}, cover=v["coverUrl"], analysis=v["getAnalysis"]) for v in CNOTES}
    jsn = json.dumps({"groups": ["散放", *GNAMES], "notes": notes}, ensure_ascii=False).replace("</", "<\\/")
    common = {"<!--N-ALL-->": str(CCOUNTS["all"]), "<!--N-LOOSE-->": str(CCOUNTS["loose"]), "<!--N-VIDEO-->": str(CCOUNTS["video"]), "<!--JSON-->": jsn}
    rail = "".join(f'<button class="g" data-group-filter="{E(g)}">{E(g)}<span class="lcd" data-lcd data-text="{GCOUNT(g):02d}" data-gcount="{E(g)}"></span></button>' for g in GNAMES)
    fill("collection-2-图鉴.html", "个人收藏-2-图鉴.html", dict(parts, **common, **{"<!--GROUPS-->": rail, "<!--CARDS-->": "".join(k2_card(v) for v in CNOTES)}))
    rows, first = [], True
    for g in ["散放", *GNAMES]:
        members = [v for v in CNOTES if v["group"] == g]
        rows.append(f'<div class="gh{"" if members else " empty"}" data-gh="{E(g)}"><b>{E(g)}</b><span class="lcd" data-lcd data-text="{len(members):02d}" data-gcount="{E(g)}"></span>{"" if members else "<small>空</small>"}</div>')
        for v in members:
            rows.append(k3_row(v, first)); first = False
    fill("collection-3-阅读舱.html", "个人收藏-3-阅读舱.html", dict(parts, **common, **{"<!--ROWS-->": "".join(rows)}))


make_collection_v1()
make_collection_v23()
make_index("个人收藏-三版对比.html", "个人收藏 · 三版对比", [
    ("一 · 桌面", "卡片摊在桌上，拖到下面的分组里（现版原样，装进 v16 外壳；静态快照，只有悬停）", "个人收藏-1-桌面.html"),
    ("二 · 图鉴", "左边分组栏，右边等宽封面网格，点开在右侧抽屉里读；实体机器材质", "个人收藏-2-图鉴.html"),
    ("三 · 阅读舱", "左边按分组的清单，右边整页阅读：封面、文稿、解析；孵化在读页顶上", "个人收藏-3-阅读舱.html"),
], "二、三能操作：分组筛选、搜索、点开读、孵化（投递 / 孵成资产 / 焚决）、移入分组、复制链接、本地删除。")
print("已生成：个人收藏 ×3 + 对比页")


# ---------------- 资产仓库 ----------------
# v16 没有资产仓库的稿，一同样是把正式 5178 只读抓下来的渲染标记（build/assets-main.html，capture-page.mjs assets assets）装进 v16 外壳；
# 卡片样式 v16 外壳的 app.css 里已有，补现版的 src/assets-quick-copy.css（复制 / 删除 / 置顶键、焚决卷、类型色）。
AST = DATA["assets"]
ASSETS_MAIN = (BUILD / "assets-main.html").read_text(encoding="utf-8")
TYPE_LABEL = {"Prompt": "Prompt", "Scroll": "焚决", "Rule": "规则", "Design": "设计", "Skill": "Skill", "Workflow": "工作流"}
TYPE_ORDER = ["Prompt", "Scroll", "Rule", "Design", "Skill", "Workflow"]


def glyph(t):
    m = re.search(r'<div class="cover lcd type-' + t + r'[^"]*"[^>]*>(.*?)</div>', ASSETS_MAIN, re.S)
    return re.search(r"<svg.*?</svg>", m.group(1), re.S).group(0)


def make_assets_v1():
    src = (V16 / "knowledge.html").read_text(encoding="utf-8")
    s = shell16(src, "资产仓库 · 一 · 卡片墙（现版原样）", "资产仓库", "03", "资产仓库")
    s, n = re.subn(r"<main\b.*?</main>", lambda m: ASSETS_MAIN, s, count=1, flags=re.S)
    assert n == 1
    s = s.replace("<style>body{margin:0}", '<link rel="stylesheet" href="../../../src/assets-quick-copy.css"><style>body{margin:0}'
                  + css_rules("src/base.css", "status-badge") + css_rules("src/base.css", "title-row") + css_rules("src/base.css", "page-help")
                  + ".page-assets .asset-heading-actions{display:flex;align-items:center;gap:10px}.page-assets .asset-heading-actions .inline-search{width:min(360px,35vw);min-width:190px}", 1)
    (OUT / "资产仓库-1-卡片墙.html").write_text(s, encoding="utf-8")


def a_items():
    """卡片顺序照正式页（最近更新）；焚决卷插回它在正式页里的位置。"""
    out = list(AST["items"])
    if AST["scroll"]:
        out.insert(AST["scroll"]["pos"], AST["scroll"])
    return out


def stage_html(stage, cells):
    dots = "".join('<i class="on"></i>' if i < cells else "<i></i>" for i in range(5))
    return f'<span class="stage" data-stage-bar>{dots}<small data-stage-name>{stage}</small></span>'


def chips(tags, n=3):
    return "".join(f'<span class="chip">{E(t)}</span>' for t in tags[:n])


def a_attrs(it):
    return f'data-id="{it["id"]}" data-type="{it["type"]}" data-stage="{it["stage"]}" data-uses="{it["uses"]}" data-at="{it.get("at", "")}" data-name="{E(it["name"])}"'


def a2_row(it):
    if it["type"] == "Scroll":
        sub = "".join(f'<div class="entry" data-entry="{e["id"]}"><span class="n">{e["n"]}</span><div><b>{E(e["name"])}</b><small>{E(e["text"][:70])}</small></div>'
                      f'<span class="uses"><span class="lcd" data-lcd data-text="{e["uses"]:02d}" data-uses></span><small>次</small></span><button class="act" data-copy-asset>复制</button></div>' for e in it["entries"])
        return (f'<div class="row scroll" {a_attrs(it)} tabindex="0"><span class="ico t-Scroll">{glyph("Scroll")}</span>'
                f'<div class="main"><b data-open>焚决 · {E(it["name"])}</b><small>{len(it["entries"])} 条 · 卷里每条可单独复制</small></div><div class="tags"><span class="chip">心法</span></div>'
                f'{stage_html(it["stage"], it["cells"])}<span class="uses"><span class="lcd" data-lcd data-text="{it["uses"]:02d}" data-uses></span><small>出战</small></span>'
                f'<button class="act go" data-copy-asset>复制全卷</button></div><div class="sub" data-sub="{it["id"]}">{sub}</div>')
    return (f'<div class="row" {a_attrs(it)} tabindex="0"><span class="ico t-{it["type"]}">{glyph(it["type"])}</span>'
            f'<div class="main"><b data-open>{E(it["name"])}</b><small>{E(it["desc"]) or "还没有一句话说明。"}</small></div><div class="tags">{chips(it["tags"])}</div>'
            f'{stage_html(it["stage"], it["cells"])}<span class="uses"><span class="lcd" data-lcd data-text="{it["uses"]:02d}" data-uses></span><small>出战</small></span>'
            f'<button class="act go" data-copy-asset>复制</button></div>')


def a3_cart(it):
    head = (f'<header><span class="chip type">{E(it["label"])}</span><span class="chip state" data-state-chip hidden></span><span class="grow"></span>'
            f'<span class="uses"><span class="lcd" data-lcd data-text="{it["uses"]:02d}" data-uses></span><small>出战</small></span></header>')
    if it["type"] == "Scroll":
        entries = "".join(f'<div class="entry" data-entry="{e["id"]}"><span class="n">{e["n"]}</span><b>{E(e["name"])}</b>'
                          f'<span class="uses"><span class="lcd" data-lcd data-text="{e["uses"]:02d}" data-uses></span></span><button class="act" data-copy-asset>复制</button></div>' for e in it["entries"])
        body = f'<h3 data-open>焚决 · {E(it["name"])}</h3><div class="entries">{entries}</div>'
        foot = f'<footer>{stage_html(it["stage"], it["cells"])}<button class="act go" data-copy-asset>复制全卷</button></footer>'
    else:
        body = f'<h3 data-open>{E(it["name"])}</h3><p>{E(it["desc"]) or "还没有一句话说明。"}</p><div class="tags">{chips(it["tags"])}</div>'
        foot = f'<footer>{stage_html(it["stage"], it["cells"])}<button class="act go" data-copy-asset>复制</button></footer>'
    return (f'<article class="cart t-{it["type"]}" {a_attrs(it)}><div class="label"><span class="ico">{glyph(it["type"])}</span><span class="code">{it["code"]}</span></div>'
            f'<div class="body">{head}{body}{foot}</div></article>')


def make_assets_v23():
    parts = v18_parts("资产仓库")
    items = a_items()
    counts = {t: sum(i["type"] == t for i in items) for t in TYPE_ORDER}
    total_uses = sum(i["uses"] for i in items)
    mature = sum(i["stage"] != "成长期" for i in items)
    data = {i["id"]: {k: i.get(k) for k in ("code", "type", "label", "name", "desc", "tags", "stage", "cells", "uses", "body", "versions", "at", "createdAt", "entries")} for i in items}
    jsn = json.dumps({"items": data, "tags": AST["tags"], "types": TYPE_LABEL}, ensure_ascii=False).replace("</", "<\\/")
    common = {"<!--N-ALL-->": str(len(items)), "<!--N-USES-->": str(total_uses), "<!--N-MATURE-->": str(mature), "<!--JSON-->": jsn, "<!--SCROLL-SVG-->": glyph("Scroll")}
    rail = "".join(f'<button class="g{" dim" if not counts[t] else ""}" data-type-filter="{t}">{TYPE_LABEL[t]}<span class="lcd" data-lcd data-text="{counts[t]:02d}" data-tcount="{t}"></span></button>' for t in TYPE_ORDER)
    fill("assets-2-装备清单.html", "资产仓库-2-装备清单.html", dict(parts, **common, **{"<!--TYPES-->": rail, "<!--ROWS-->": "".join(a2_row(i) for i in items)}))
    seg = "".join(f'<button class="{"dim" if not counts[t] else ""}" data-type-filter="{t}"><span class="lcd" data-lcd data-text="{counts[t]:02d}" data-tcount="{t}"></span><small>{TYPE_LABEL[t]}</small></button>' for t in TYPE_ORDER)
    fill("assets-3-卡带架.html", "资产仓库-3-卡带架.html", dict(parts, **common, **{"<!--TYPES-->": seg, "<!--CARTS-->": "".join(a3_cart(i) for i in items)}))


make_assets_v1()
make_assets_v23()
make_index("资产仓库-三版对比.html", "资产仓库 · 三版对比", [
    ("一 · 卡片墙", "三列大卡：像素图 + 出战数在上，名字和用途在下（现版原样，装进 v16 外壳；静态快照）", "资产仓库-1-卡片墙.html"),
    ("二 · 装备清单", "左边类型栏，右边一行一件：图标、名字和用途、标签、阶段、出战液晶、复制；焚决卷展开成子行", "资产仓库-2-装备清单.html"),
    ("三 · 卡带架", "四列卡带：左边色标条（像素图 + 编号），名字和用途在第一眼，复制在卡上；每种类型一种哑光色", "资产仓库-3-卡带架.html"),
], "二、三能操作：复制（数据落进伙伴屏的蛋，出战 +1，成长期复制后进成熟期）、类型筛选、搜索、排序、点名字看全文、新建。")
print("已生成：资产仓库 ×3 + 对比页")

# ---------------- 项目空间 ----------------
def make_projects_v1():
    """一 · 现版原样：隔离副本抓的渲染标记（build/projects-main.html）装进 v16 外壳，样式引用现版 src/projects-v16.css。"""
    src = (V16 / "knowledge.html").read_text(encoding="utf-8")
    s = shell16(src, "项目空间 · 一 · 读档画面（现版原样）", "项目空间", "04", "项目空间")
    main = (BUILD / "projects-main.html").read_text(encoding="utf-8")
    s, n = re.subn(r"<main\b.*?</main>", lambda m: main, s, count=1, flags=re.S)
    assert n == 1
    links = "".join(f'<link rel="stylesheet" href="../../../src/{f}">' for f in PROJECT_CSS)
    s = s.replace("<style>body{margin:0}", links + "<style>body{margin:0}"
                  + css_rules("src/base.css", "status-badge") + css_rules("src/base.css", "title-row") + css_rules("src/base.css", "page-help"), 1)
    (OUT / "项目空间-1-读档画面.html").write_text(s, encoding="utf-8")


PROJECT_CSS = ["project-status.css", "projects-v16.css"]
make_projects_v1()


# ---------------- 项目空间 二 · 存档条 / 三 · 卡带槽 + 读档屏 ----------------
# 数据全部来自隔离副本抓的现版标记（build/projects-main.html）；收件取正式数据快照的 projectDesk（只读），
# 体检取两个项目目录的 git 只读结果；立绘由 build/projects-sprites.mjs 用现版 src/pixel.jsx 渲染。
PJ_MAIN = (BUILD / "projects-main.html").read_text(encoding="utf-8")
PJ_SPR = json.loads((BUILD / "projects-sprites.json").read_text(encoding="utf-8"))


def pj_text(fragment):
    return html.unescape(re.sub(r"<[^>]+>", "", fragment)).strip()


def pj_heat():
    sr = re.search(r'<span class="sr-only">(\d{4}-\d\d-\d\d：Git[^<]*)</span>', PJ_MAIN).group(1)
    out = []
    for part in sr.split("；"):
        d, g, c = re.match(r"(\d{4}-\d\d-\d\d)：Git (\d+)，CURRENT (\d+)", part).groups()
        out.append({"d": d, "git": int(g), "cur": int(c)})
    return out


def pj_library():
    zones = []
    for z in re.finditer(r'<div class="pj-rack"><h4><span class="en">(ZONE \d+)</span><b[^>]*>([^<]+)</b>.*?<ul>(.*?)</ul></div>', PJ_MAIN, re.S):
        rows = []
        for li in re.finditer(r'<li class="pj-cs([^"]*)">(.*?)</li>', z.group(3), re.S):
            body = li.group(2)
            slot = re.search(r'pj-cs-save">.*?<span class="en">(SLOT \d+)</span>', body, re.S)
            rows.append({
                "code": re.search(r'pj-cs-code en">([^<]+)', body).group(1),
                "name": html.unescape(re.search(r"<b>([^<]+)</b>", body).group(1)),
                "path": html.unescape(re.search(r'class="pj-path" title="([^"]+)"', body).group(1)),
                "flags": re.findall(r'<span class="pj-flag">([^<]+)</span>', body),
                "slot": slot.group(1) if slot else "",
                "at": re.search(r'pj-row-at en"[^>]*>([^<]+)', body).group(1),
                "new": "pj-cs-new" in body,
            })
        zones.append({"zone": z.group(1), "name": z.group(2), "rows": rows})
    folds = []
    for d in re.finditer(r'<details class="pj-pending"><summary>([^<]+?) · (\d+)<small>([^<]+)</small></summary><ul>(.*?)</ul></details>', PJ_MAIN, re.S):
        items = [{"name": html.unescape(a), "path": html.unescape(b)} for a, b in re.findall(r'<strong>([^<]+)</strong><span class="pj-path" title="([^"]+)"', d.group(4))]
        folds.append({"name": d.group(1), "n": int(d.group(2)), "desc": d.group(3), "items": items})
    scan = pj_text(re.search(r'<p class="scan-notice[^"]*"[^>]*>(.*?)</p>', PJ_MAIN, re.S).group(1))
    return zones, folds, scan


def pj_short(path):
    return path.replace("/Users/nat/", "~/")


def pj_prompt(save):
    """现版 src/collab.js startPrompt + projects-v16.js projectRelayPrompt 的同一结构；{AGENT} 由页面按所选伙伴替换。"""
    lines = ["【协同 · 一键开工】开工：{AGENT}", f"项目：{save['name']}", f"项目路径：{save['path']}", "", "先读（按顺序）：",
             "1. AGENTS.md（项目入口与规则；没有就跳过）", "2. CURRENT.md（唯一当前状态；记下 state_id 与当前写入者）", "",
             f"输入状态：state_id {save['stateId']}", f"唯一下一步：{save['next']}", "",
             "开工规则：当前写入者不是“无”时只做只读检查；为“无”时先在 CURRENT.md 登记认领并回读，再改其他文件。不读取凭据、私人会话或工作台主库内容；提交、推送等外部动作须用户当轮授权。",
             "3. 最新交接：未记录，接手后核对。"]
    return "\n".join(lines)


def pj_data():
    zones, folds, scan = pj_library()
    note = next(n for n in DATA["notes"] if n["id"].startswith("06f9340b"))
    nxt = pj_text(re.search(r'<div class="pj-next"><span class="en">[^<]*</span><p>(.*?)</p>', PJ_MAIN, re.S).group(1))
    dw = {"id": "dw", "slot": "01", "name": "数码世界｜个人 AI 工作台", "path": "/Users/nat/Documents/ChatGPT/个人/work/personal-ai-workbench",
          "state": "ok", "agent": "claude", "stage": 0, "next": nxt, "stateId": "WB-20261023-645", "writer": "Claude",
          "latest": "10/24 01:34", "latestKind": "CURRENT", "savepoint": 11, "heat": pj_heat(), "inbox": [], "gear": [],
          "checks": [["Git 仓库", "ok", "有"], ["远程备份", "ok", "有"], ["未提交改动", "ok", "2 个 · 不足 1 天"], ["敏感文件 / 公开仓库", "unk", "本次没读"]]}
    wd = {"id": "wd", "slot": "02", "name": "work-desk", "path": "/Users/nat/Documents/ChatGPT/个人/work/work-desk",
          "state": "unread", "reason": "尚未取得读取结果", "agent": None, "stage": -1, "latest": "10/22", "latestKind": "Git 提交", "savepoint": 1,
          "heat": None, "inbox": [{"kind": "随手记", "at": "10/23", "text": note["text"]}], "gear": [],
          "safety": ["没有 Git 远程备份", "有 4 个未提交改动"],
          "checks": [["Git 仓库", "ok", "有"], ["远程备份", "bad", "没有"], ["未提交改动", "bad", "4 个 · 超过 1 天"], ["敏感文件 / 公开仓库", "unk", "本次没读"]]}
    dw["prompt"] = pj_prompt(dw)
    agents = [{k: a[k] for k in ("id", "name", "character", "hue", "head", "full")} for a in PJ_SPR["agents"]]
    return {"saves": [dw, wd], "zones": zones, "folds": folds, "scan": scan, "agents": agents, "egg": PJ_SPR["egg"],
            "total": sum(len(z["rows"]) for z in zones), "read": "01:38"}


def pj_library_html(d):
    rows_html = []
    for z in d["zones"]:
        rows = ""
        for r in z["rows"]:
            src = r["code"].lower()
            flags = "".join(f'<span class="chip">{E(f)}</span>' for f in r["flags"])
            if r["slot"]:
                tail = f'<span class="slot-tag"><i class="led on"></i>{r["slot"]}</span>'
            elif r["new"]:
                tail = '<button class="act newsave" data-pj-new>开新档<b aria-hidden="true">▸</b></button>'
            else:
                tail = '<span class="slot-tag dim" title="手工登记、仅展示的项目不开档">仅展示</span>'
            rows += (f'<li class="cs src-{src}{" in-save" if r["slot"] else ""}" data-pj-row="{E(r["name"])}" data-src="{src}" data-path="{E(r["path"])}" data-search="{E((r["name"] + " " + r["path"]).lower())}">'
                     f'<span class="code">{r["code"]}</span><div class="nm"><b>{E(r["name"])}</b><small>{E(pj_short(r["path"]))}</small></div>'
                     f'<span class="flags">{flags}</span><span class="at">{E(r["at"])}</span>{tail}</li>')
        rows_html.append(f'<div class="rack"><h4><span class="en">{z["zone"]}</span><b>{E(z["name"])}</b><span class="lcd" data-lcd data-text="{len(z["rows"]):02d}"></span></h4><ul>{rows}</ul></div>')
    folds = "".join(f'<button class="fold" data-pj-fold="{i}" aria-expanded="false"><span class="lcd" data-lcd data-text="{f["n"]:02d}"></span><span><b>{E(f["name"])}</b><small>{E(f["desc"])}</small></span><i aria-hidden="true">▾</i></button>'
                    for i, f in enumerate(d["folds"]))
    n_local = sum(r["code"] == "LOCAL" for z in d["zones"] for r in z["rows"])
    n_git = d["total"] - n_local
    m = re.match(r"结果不完整：扫描于 (\d{4})/(\d+)/(\d+) (\d+:\d+):\d+。(.*)", d["scan"])
    scan = f'结果不完整 · 扫描于 {int(m.group(2))}/{int(m.group(3))} {m.group(4)} · {m.group(5)}' if m else d["scan"]
    return (f'<section class="lib" data-pj-lib aria-label="全部项目"><div class="sh"><span class="en">LIBRARY</span><h2>全部项目</h2><span class="lcd" data-lcd data-text="{d["total"]:02d}"></span>'
            f'<span class="grow"></span><span class="scan" data-pj-scanline title="{E(d["scan"])}"><i class="led amber"></i><span data-pj-scantext>{E(scan)}</span><span class="scan-s" data-pj-scanshort>{E(scan.split(" · ")[0])} · {E(scan.split(" · ")[1].replace("扫描于 ", ""))} 扫描</span><button class="act" data-pj-rescan>重新扫描</button></span></div>'
            f'<div class="tools"><p class="def">主项目有独立目标、跨任务阶段和单独的状态与验收；目录、任务和资产不自动算作项目。</p><span class="grow"></span>'
            f'<div class="seg src" role="radiogroup" aria-label="项目来源"><button class="on" data-pj-src="all">全部<span class="lcd" data-lcd data-text="{d["total"]:02d}"></span></button>'
            f'<button data-pj-src="local">LOCAL<span class="lcd" data-lcd data-text="{n_local:02d}"></span></button><button data-pj-src="git">GIT<span class="lcd" data-lcd data-text="{n_git:02d}"></span></button></div>'
            f'<label class="find"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input data-pj-find placeholder="搜索名称、路径" aria-label="搜索项目"></label></div>'
            f'<div class="racks">{"".join(rows_html)}</div><div class="folds">{folds}</div><div class="fold-panel" data-pj-foldpanel hidden></div></section>')


def make_projects_v23():
    parts = v18_parts("项目空间")
    d = pj_data()
    jsn = json.dumps(d, ensure_ascii=False).replace("</", "<\\/")
    common = {"<!--JSON-->": jsn, "<!--LIBRARY-->": pj_library_html(d), "<!--N-SAVES-->": f'{len(d["saves"]):02d}', "<!--N-ALL-->": f'{d["total"]:02d}',
              "<!--N-INBOX-->": f'{sum(len(s["inbox"]) for s in d["saves"]):02d}', "<!--READ-->": d["read"]}
    fill("projects-2-存档条.html", "项目空间-2-存档条.html", dict(parts, **common))
    fill("projects-3-卡带槽.html", "项目空间-3-卡带槽.html", dict(parts, **common))
    for key in ("3-1-一栏读", "3-2-主次两栏", "3-3-剧场", "4-1-交接条", "4-2-口令对白", "4-3-出发队列"):
        fill(f"projects-{key}.html", f"项目空间-{key}.html", dict(parts, **common))


make_projects_v23()
make_index("项目空间-三版对比.html", "项目空间 · 三版对比", [
    ("一 · 读档画面", "现版原样：三格存档卡（持笔数码兽 + 下一步 + 阶段 + 30 天活动）+ 卡槽架（装进 v16 外壳；静态快照）", "项目空间-1-读档画面.html"),
    ("二 · 存档条", "同一张读档画面把排版做对：每盘一条横向存档条，下一步整行、继续在首屏；空槽缩成细槽；发车条从被点的那条下面滑出", "项目空间-2-存档条.html"),
    ("三 · 卡带槽 + 读档屏", "更像一台机器：顶上插卡带，选哪盘就启动哪盘；读档屏里是下一步、持笔者与队伍、阶段、活动、体检，出发区常驻", "项目空间-3-卡带槽.html"),
], "二、三能操作：继续（选谁带走、口令预览、只复制 / 带走，数据落进伙伴屏）、开新档（库里的项目飞进空槽）、重新检查、重新扫描、来源筛选、搜索、折叠组展开、收件、详情。")
print("已生成：项目空间 ×3 + 对比页")
make_index("项目空间-三的优化.html", "项目空间 · 三的三版优化", [
    ("三 · 原稿", "用户选定的方向：卡带槽 + 读档屏（优化前，留作对照）", "项目空间-3-卡带槽.html"),
    ("优化 1 · 一栏读", "立绘 + 下一步 + 一排出发（选伙伴、继续）；口令折起；阶段 / 活动 / 体检 / 队伍收成底部一行读数", "项目空间-3-1-一栏读.html"),
    ("优化 2 · 主次两栏", "左边只有持笔者、下一步、继续；右边档案栏用页签一次看一样：口令 / 活动 / 体检 / 队伍", "项目空间-3-2-主次两栏.html"),
    ("优化 3 · 剧场", "RPG 读档画面：数码兽站在左边，下一步写在对话框里，右边是游戏菜单（继续 / 换伙伴 / 看口令 / 档案 / 只复制）", "项目空间-3-3-剧场.html"),
], "三版优化共用：页头并成一行、卡带只留 SLOT + 头像 + 名字 + 一盏状态灯、少一半边框、橙色只给继续、库里收起说明句和标签片。都能操作：换卡带、继续、选伙伴、复制、开新档、重新检查、重新扫描。")
print("已生成：项目空间 三的三版优化 + 对比页")
make_index("项目空间-剧场再优化.html", "项目空间 · 剧场的三版再优化", [
    ("剧场 · 上一稿", "优化 3 · 剧场（再优化前，留作对照）", "项目空间-3-3-剧场.html"),
    ("4-1 · 交接条", "剧场原样：对话框写下一步；下面一条交接条（伙伴头像 + 复制口令交给 X + 口令全文折叠）；30 天双轨活动整宽", "项目空间-4-1-交接条.html"),
    ("4-2 · 口令即对白", "数码兽把口令说出来：对话框就是完整口令（下一步一行加粗放大）；右栏竖排四个伙伴 + 一个复制按钮", "项目空间-4-2-口令对白.html"),
    ("4-3 · 出发队列", "四只数码兽站成一排，点谁谁往前一步（持笔者挂牌）；上方下一步，右边一个复制按钮", "项目空间-4-3-出发队列.html"),
], "三版共用：继续 / 看口令 / 只复制 / 换伙伴并成一个动作（选伙伴 + 复制口令交给 X，旁边'复制后打开 X'默认勾上）；活动改成整宽 30 天双轨（Git / CURRENT 各一行，格上写次数）；立绘与对话框等高对齐。")
print("已生成：项目空间 剧场的三版再优化 + 对比页")

