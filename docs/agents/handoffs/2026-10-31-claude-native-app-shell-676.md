# Claude 676：数码世界桌面应用改原生外壳（2026-10-31）

- 输入状态 / 输出状态：WB-20261030-675 → WB-20261031-677（两批完成，交回）
- 执行者 / 本轮范围：Claude（会话 local_111b8e7b），issue #44，分支 `claude/44-native-app-shell`。第 1 批只在仓库里做；第 2 批经用户说「同意替换」后替换了正式应用。

## 改动文件

- `desktop/app-shell/DigitalWorld.swift`：WKWebView 窗口壳，照牛马之家，只改名称、bundle id `cn.personal-ai-workbench.app`、地址 5178。比牛马之家多两处：
  - ⌘Q / ⌘W / ⌘R / 回到首页之前，先在页面里派发一次 `beforeunload`，页面拦下来就弹「离开这一页？」。WKWebView 自己不做这件事。
  - 「重新载入」「回到首页」菜单项指定 `target`：WKWebView 自己也响应 `reload:`，不指定会被它接走，绕过离开确认（调试实测：未指定时探测次数为 0）。牛马之家也有同样的问题，没改那个仓库。
- `desktop/app-shell/build.sh`：swiftc 编译、iconset 转 icns、写 Info.plist（含 `NSAllowsLocalNetworking`）、ad-hoc 签名。默认装到 `work/app-shell/`，传目录才装到别处；目标已有别的「数码世界.app」时不覆盖。
- `desktop/app-shell/check-page.html`：外壳核对页。
- `desktop/app-shell/README.md`：构建、核对、存储说明。

## 验证

证据放在主目录 `work/app-shell/evidence/`（不进仓库）。

| 项 | 结果 |
|---|---|
| 编译、签名 | `codesign --verify --strict` 通过 |
| 复制 writeText | 通过，`pbpaste` 读回 |
| 富文本 `clipboard.write` | 通过，剪贴板上有 HTML 和纯文本 |
| 读剪贴板 `clipboard.read` | 本页写入的内容可读；别的应用复制的内容，系统弹「粘贴」小菜单，要人点一下。这是 WebKit 的行为，Safari 也一样 |
| 选文件 | 面板能打开、能取消；后台操作点不动面板侧栏，「选中后传回页面」**未验证**，留给用户 |
| 下载 | blob 下载和同站 `download` 链接都存到「下载」；测试文件已移到废纸篓 |
| 离开确认 | ⌘R、⌘Q、⌘W 都弹框；选「留下」页面不动，选「离开」应用退出；页面没拦时不弹 |
| 外链 | 普通外链、新窗口外链都交给默认浏览器（Chrome），窗口里的页面不动 |
| confirm | 通过 |
| 正式 5178（只读） | 首页、随手记页正常显示，不黑屏；随手记页的手写字体生效；⌘R 正常 |
| 图标 | 系统自动切成圆角方形，没有套灰底 |

- 运行服务、真实数据：都没变。只用试装版打开正式 5178 看页面，没有写入。
- 副作用：核对时覆盖过一次用户剪贴板，在默认浏览器里打开过两次 example.com。

## 第 2 批：替换正式应用（用户 10-31「同意替换」）

- 旧网页应用（`com.apple.Safari.WebApp.E3B9F0BF-…`，正在运行）用 SIGTERM 退出后，整个包 `mv` 到主目录 `work/app-shell/webapp-backup/数码世界.app`。没有改包内文件，签名不变，网页应用自己的存储（`~/Library/Containers/…`）也没动。
- `bash desktop/app-shell/build.sh ~/Applications` 装新外壳：`codesign --verify --strict` 通过，Info.plist 为 `cn.personal-ai-workbench.app`、`http://127.0.0.1:5178/`、版本 `9926019`；`lsregister -f` 重新登记。试装副本已删掉并取消登记，免得系统打开错的那份。
- 程序坞里这一项按路径（`file:///Users/nat/Applications/数码世界.app/`）记录，现在打开的就是新外壳。
- 打开验证：进程是 `~/Applications/数码世界.app/Contents/MacOS/DigitalWorld`，页面正常、不黑屏（证据 `work/app-shell/evidence/正式应用-替换后.jpg`）。用户当时正在用这个窗口，所以没有替用户退出重开；试装阶段已经冷启动过多次。

### 怎么换回旧网页应用

1. 退出新的「数码世界」。
2. 删掉或移走 `~/Applications/数码世界.app`（新外壳，随时可以用 `build.sh` 重新编出来）。
3. 把主目录 `work/app-shell/webapp-backup/数码世界.app` 拖回 `~/Applications/`。包没被改过，签名不变，能直接打开；旧网页应用的本地存储还在原处。

## 未完成

- 选文件「选中后传回页面」一步由用户手动点一次。
- 后续（不在 #44）：随手记悬浮窗「打开主页」改为打开新外壳。

## 唯一下一步

用户在正式应用里手动试一次选文件（选中后取消上传），再审 PR #45；说「合并」后合并并关 #44。
