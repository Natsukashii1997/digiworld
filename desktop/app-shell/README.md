# 数码世界桌面应用（原生外壳）

`数码世界.app` 是一个 Swift + WKWebView 窗口壳，只加载常驻服务 `cn.personal-ai-workbench.server` 提供的 http://127.0.0.1:5178/，不自己拉起服务。写法照牛马之家（work-desk `desktop/macos/NiumaHome.swift`）。bundle id `cn.personal-ai-workbench.app`。

替代原来的 Safari「添加到程序坞」网页应用：网页应用打开会用磁盘里的旧首页，发布后黑屏（全局 G-16）；包内文件不能改（G-15）；Safari 不给网页用按需下载的系统字体。

## 构建

```bash
bash desktop/app-shell/build.sh                  # 试装到 work/app-shell/
bash desktop/app-shell/build.sh ~/Applications   # 装成正式应用
```

- `WORKBENCH_URL` 改加载地址，默认 http://127.0.0.1:5178/。
- 图标由 `desktop/app-icon/source-1024.png` 生成；满版方图交给系统切圆角，macOS 27 实测不会套灰底。
- 目标位置已有别的「数码世界.app」（比如旧网页应用）时脚本不覆盖，要先备份移走。

## 外壳做了什么

- 本站链接留在窗口内；外链、`target=_blank`、`window.open` 交给默认浏览器。
- alert / confirm / prompt、选文件、下载（存到「下载」，重名加序号，完成后在访达里显示）。
- 离开确认：WKWebView 退出、关窗时不触发 `beforeunload`，重新载入也不替页面弹确认。⌘Q、⌘W、⌘R、回到首页（⇧⌘H）之前，外壳先在页面里派发一次 `beforeunload`，页面拦下来就弹「离开这一页？」。
- 「重新载入」「回到首页」菜单项要指定 `target`：WKWebView 自己也响应 `reload:`，不指定会被它先接走，绕过离开确认。

## 核对

`check-page.html` 是外壳核对页（复制、选文件、下载、离开确认、外链、对话框、手写字体）。用法：

```bash
python3 -m http.server 5199 --bind 127.0.0.1 --directory desktop/app-shell
WORKBENCH_URL=http://127.0.0.1:5199/check-page.html bash desktop/app-shell/build.sh work/app-shell/test
open work/app-shell/test/数码世界.app
```

已知差异：从别的应用复制的内容，页面读剪贴板时系统会弹「粘贴」小菜单，要点一下才放行。Safari 也是这样，不是外壳的问题。

## 存储

原生外壳有自己的网页存储，和 Safari 网页应用不通。旧网页应用里的 localStorage / sessionStorage 不会带过来，包括首页、随手记页、Agent 目标页的网页草稿，收藏分组草稿，以及待查询的操作标记。换应用前先在旧应用里确认没有未保存的草稿。
