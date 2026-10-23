#!/usr/bin/env python3
# 逆向工程 v3 视觉稿：沿用 v16 外壳/页头/标本架/发车条的真实结构，替换主区为“解剖台”。只读合成数据。
import re, sys
D = sys.argv[1]  # docs/design/ui-v16
src = open(f"{D}/pages/reverse-fn.html", encoding="utf-8").read()
handoff = open(f"{D}/pages/reverse-handoff.html", encoding="utf-8").read()

def balanced(s, start):
    """从 start 处的 <div 起，取到与之配对的 </div>。"""
    depth, i = 0, start
    for m in re.finditer(r"<(/?)div\b", s[start:]):
        depth += -1 if m.group(1) else 1
        if depth == 0:
            end = s.find(">", start + m.start()) + 1
            return s[start:end]
    raise SystemExit("unbalanced")

launch = balanced(handoff, handoff.find('<div class="re-launch">'))
launch = launch.replace("逆推任务包", "复刻任务包").replace("把逆推任务交给", "把复刻任务交给").replace("逆推任务", "复刻任务")
# 发车条前面加“实现到”选择
where = ('<div class="impl-to" role="radiogroup" aria-label="实现到哪里">'
         '<span class="en">BUILD IN</span>'
         '<button role="radio" aria-checked="false">独立复刻<small>只凭配方，验证还原度</small></button>'
         '<button role="radio" aria-checked="true" class="on">我的项目<small>personal-ai-workbench</small></button></div>')
launch = launch.replace('<div class="re-launch">', '<div class="re-launch">' + where, 1)

ev = lambda h: f'<button class="evb" aria-label="复制证据编号 ev_{h}…"><i>证据</i>{h}</button>'
mk = lambda k: {"obs": '<span class="mk obs">观察</span>', "inf": '<span class="mk inf">推断</span>'}[k]

nodes = [
    ("UI", "右键菜单「复制块」", "菜单项文案与快捷键绑定", "obs", ["7c1e09a4"]),
    ("RENDERER", "copyBlocks()", "把选中块序列化成两份", "obs", ["2b6d1f03"]),
    ("IPC", "notion:clipboard-write", "preload 暴露 → 主进程监听", "inf", ["3fa2b8c1", "9d04e6f2"]),
    ("MAIN", "clipboard.write()", "一次写入多种格式", "obs", ["5e88ac27"]),
    ("DATA", "text/html + 私有格式", "粘回 Notion 保留块结构", "inf", []),
]
chain = '<ol class="nodes">' + "".join(
    f'<li class="node {k}{" on" if i == 2 else ""}"><button class="node-btn" aria-pressed="{str(i == 2).lower()}">'
    f'<span class="en">{tag}</span><b>{name}</b><small>{note}</small>{mk(k)}</button>'
    f'<span class="node-ev">{"".join(ev(h) for h in evs) or "<em>无直接证据</em>"}</span></li>'
    + ('<li class="link" aria-hidden="true"></li>' if i < len(nodes) - 1 else "")
    for i, (tag, name, note, k, evs) in enumerate(nodes)) + "</ol>"

detail = ('<div class="node-detail"><span class="en">NODE 3 / 5 · IPC</span>'
          '<p>preload 用 contextBridge 暴露 <code>writeClipboard</code>，经通道 <code>notion:clipboard-write</code> 发给主进程；'
          '通道名在 preload 与主进程两处字面一致（观察），传入参数的字段形状来自调用点推断。</p>'
          f'<div class="ev-row">{ev("3fa2b8c1")}{ev("9d04e6f2")}</div></div>')

unknowns = ('<aside class="unknowns" aria-labelledby="unk-t"><h3 id="unk-t"><span class="en">UNKNOWN</span>未知项<b>2</b></h3>'
            '<ol><li><span class="mono">U-01</span>私有格式的版本号与字段含义</li>'
            '<li><span class="mono">U-02</span>复制超长页面时是否分批写入</li></ol></aside>')

cases = ['右键「复制块」后剪贴板同时有纯文本与 HTML', '粘贴到普通编辑器保留标题、列表、粗体',
         '粘回本应用时保留块类型与缩进', '空选择时菜单项置灰', '复制失败给出可见提示', '复制 200 个块不卡顿']
cases_html = ('<section class="recipe" aria-labelledby="ac-t"><div class="sec-head"><h2 id="ac-t" class="en-head">'
              '<span class="en">ACCEPTANCE</span>验收用例</h2><span class="sec-meta">0 / 6 · 实现后逐条核对</span></div>'
              '<ol class="cases">' + "".join(f'<li class="todo"><i class="box" aria-hidden="true"></i><span class="mono">AC-0{i+1}</span>{t}</li>' for i, t in enumerate(cases)) +
              '</ol><details class="recipe-all"><summary>配方全文<span class="mono">5 块 · 6 条证据 · 2 项未知</span></summary></details></section>')

doors = ('<section class="ends" aria-labelledby="end-t"><div class="sec-head"><h2 id="end-t" class="en-head"><span class="en">ENDPOINT</span>终点</h2>'
         '<span class="sec-meta">两条路可以都走</span></div><div class="doors">'
         '<div class="door door-skill locked"><span class="door-px" aria-hidden="true">EGG_SPRITE</span><span class="en">FORGE · SKILL</span><b>炼成 Skill</b>'
         '<small>验收达标后孵化一颗数码蛋，进资产仓库</small><button class="ghost" disabled>达标后可炼成</button></div>'
         '<div class="door proj"><span class="door-px proj-ic" aria-hidden="true">PROJ_ICON</span><span class="en">SHIP · PROJECT</span><b>落地到项目</b>'
         '<small>personal-ai-workbench · 实现交回后在此盖章，项目空间可见</small><button class="ghost">换一个项目</button></div>'
         '</div></section>')

main_html = f'''<div class="re-main"><div class="bench m-screen dissect"><div class="bench-head"><span class="en">DISSECT · ELECTRON</span><h2>Notion · 复制块的富格式剪贴板</h2><span class="bench-meta">/Applications/Notion.app · SHA e0f0a709 · 取证于 REA 6.4.0 · RE-0A1B</span><ol class="rsteps"><li class="done"><i>✓</i>投入</li><li class="done"><i>✓</i>取证逆推</li><li class="now"><i>3</i>实现验证</li><li class=""><i>4</i>终点<small>Skill / 项目</small></li></ol></div>
<div class="dx-grid"><section class="chain" aria-labelledby="chain-t"><div class="judge-top"><span class="en" id="chain-t">EVIDENCE CHAIN · 证据链</span><span class="judge-hint">想弄懂：复制一个块时，富格式是怎么进剪贴板的</span></div>{chain}<div class="dx-sub">{detail}{unknowns}</div></section></div>
{launch}</div>{cases_html}{doors}</div>'''

# 页头：导语、边界、REA 装备读数
s = src
s = s.replace("把参照物逆推成配方，验证能 1:1 复刻，再举一反三。", "弄懂一件好东西：作品上鉴定台对照复刻，软件上解剖台取证。")
s = s.replace("<li>只逆向你提供或公开的材料</li><li>配方经复刻验证才算数</li>", "<li>只逆向你拥有或获准分析的东西</li><li>结论带证据，复刻验证才算数</li>")
GEAR_OK = ('<div class="gear" role="group" aria-label="REA 取证装备"><span class="gear-scr"><span class="en">REA</span><b>6.4.0</b></span>'
           '<span class="gear-txt"><span class="gear-state ok">已是最新</span><small>正式发布版 · 今天 20:40 检查</small></span>'
           '<button class="gear-btn">检查更新</button></div>')
GEAR_NEW = ('<div class="gear has-new" role="group" aria-label="REA 取证装备"><span class="gear-scr"><span class="en">REA</span><b>6.4.0</b></span>'
            '<span class="gear-txt"><span class="gear-state new">可更新到 6.5.0</span><small>GitHub 正式发布 · 10/12</small></span>'
            '<button class="gear-btn on">一键更新</button></div>')
s = s.replace('<div class="page-heading-action">', '<div class="page-heading-action v3-act">GEAR', 1)

# 标本架：作品/软件两台切换 + 软件标本
i = s.find('<aside class="rail"'); j = s.find("</aside>", i) + len("</aside>")
rec = lambda t, title, meta, dot, label, on=False: (
    f'<button class="rec{" on" if on else ""}" role="radio" aria-checked="{str(on).lower()}"><span class="rec-type"><span class="en">{t}</span></span>'
    f'<b>{title}</b><span class="en-meta">{meta}</span><span class="dot {dot}">{label}</span></button>')
rail = ('<aside class="rail" aria-label="标本架"><div class="bench-switch" role="tablist" aria-label="台面">'
        '<button role="tab" aria-selected="false"><b>作品</b><span class="en">ARTWORK · 4</span></button>'
        '<button role="tab" aria-selected="true" class="on"><b>软件</b><span class="en">SOFTWARE · 3</span></button></div>'
        '<div class="rail-filter" role="radiogroup" aria-label="按状态筛选"><button role="radio" aria-checked="true">全部<span>3</span></button>'
        '<button role="radio" aria-checked="false">待取证<span>1</span></button><button role="radio" aria-checked="false">实现中<span>1</span></button>'
        '<button role="radio" aria-checked="false">已完成<span>1</span></button></div><div class="rail-list" role="radiogroup" aria-label="软件标本">'
        + rec("ELECTRON", "Notion · 复制块的富格式剪贴板", "Notion.app · 10/13", "reverse", "实现中", True)
        + rec("WEB", "飞书文档 · 划词评论浮层", "feishu.cn · 10/13", "todo", "待取证")
        + rec("ELECTRON", "Claude · 会话全文检索", "Claude.app · 10/12", "done", "已落地 · workbench")
        + "</div></aside>")
s = s[:i] + rail + s[j:]

# 主区
i = s.find('<div class="re-main">'); j = s.rfind("</div></div></main>")
s = s[:i] + main_html + s[j + len("</div>"):]
assert "</main>" in s
s = s.replace("<title>v16 · 逆向工程</title>", "<title>v3 · 逆向工程 · 解剖台</title>")
s = s.replace('<link rel="stylesheet" href="../v16.css">', '<link rel="stylesheet" href="../v16.css"><link rel="stylesheet" href="reverse-v3.css">')

egg = re.search(r'<span class="partner-screen"[^>]*>.*?(<svg.*?</svg>)', src, re.S)
egg_svg = egg.group(1) if egg else ""
proj_ic = ('<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'
           '<path d="M4 20h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-7.9a1 1 0 0 1-.83-.45L9.6 4.45A1 1 0 0 0 8.77 4H4a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1Z"/><path d="m9 13 2 2 4-4"/></svg>')
s = s.replace("EGG_SPRITE", egg_svg).replace("PROJ_ICON", proj_ic)

out = f"{D}/reverse-v3"
open(f"{out}/dissect.html", "w", encoding="utf-8").write(s.replace("GEAR", GEAR_OK))

# 第二张：有新版本 + 更新预演抽屉
sheet = '''<div class="upd-scrim"></div><aside class="upd-sheet m-screen" role="dialog" aria-modal="true" aria-labelledby="upd-t">
<div class="upd-head"><span class="en">REA · UPDATE PLAN</span><h2 id="upd-t">更新到 6.5.0</h2><span class="bench-meta">GitHub 正式发布 · 2026-10-12 · <a href="#">更新说明</a></span></div>
<ol class="upd-steps"><li class="done"><i>✓</i>检查版本</li><li class="now"><i>2</i>预演</li><li><i>3</i>写入</li><li><i>4</i>回读</li></ol>
<section><h3><span class="en">WILL CHANGE</span>将改动 3 处 · 都会先备份</h3><ul class="upd-list">
<li><b>Claude Code</b><span class="mono">~/.claude.json</span><span class="diff">rea 注册 6.4.0 → 6.5.0</span></li>
<li><b>Codex</b><span class="mono">~/.codex/config.toml</span><span class="diff">rea 注册 6.4.0 → 6.5.0</span></li>
<li><b>REA Skill</b><span class="mono">reverse-engineer-anything</span><span class="diff">v41 → v43</span></li></ul></section>
<section><h3><span class="en">FIT CHECK</span>适配检查</h3><ul class="fit">
<li class="ok"><i>✓</i>任务包用到的 4 个工具在新版都还在</li><li class="ok"><i>✓</i>参数 integrity_policy / detail 未变</li></ul></section>
<div class="upd-bar"><span class="hint">写入后重启 Claude Code 和 Codex 生效</span><button class="ghost">取消</button><button class="button">确认更新</button></div></aside>'''
s2 = s.replace("GEAR", GEAR_NEW).replace("</main>", "</main>" + sheet, 1)
open(f"{out}/update.html", "w", encoding="utf-8").write(s2)
print("ok", len(s), len(s2))
