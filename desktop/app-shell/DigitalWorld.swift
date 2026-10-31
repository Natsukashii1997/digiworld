// 数码世界：原生窗口壳，加载 launchd 常驻服务提供的本地页面（地址取 Info.plist 的 WorkbenchURL）。
// 照牛马之家（work-desk desktop/macos/NiumaHome.swift）：本站链接留在窗口内；外部链接、新窗口交给默认浏览器；补齐 alert/confirm/prompt、文件选择和下载。
// 比牛马之家多一处：WKWebView 退出、关窗不触发 beforeunload，重新载入也不替页面弹离开确认，所以这几处先在页面里派发一次，页面拦下来再问。
import AppKit
import WebKit

final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
    let home = URL(string: Bundle.main.object(forInfoDictionaryKey: "WorkbenchURL") as? String ?? "http://127.0.0.1:5178/")!
    var window: NSWindow!
    var web: WKWebView!
    var downloads: [ObjectIdentifier: URL] = [:]
    var leaveConfirmed = false

    func applicationDidFinishLaunching(_ note: Notification) {
        buildMenu()
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = self
        web.uiDelegate = self
        web.allowsBackForwardNavigationGestures = true
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1440, height: 900),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "数码世界"
        window.contentView = web
        window.delegate = self
        window.center()
        window.setFrameAutosaveName("DigitalWorldMain")
        window.makeKeyAndOrderFront(nil)
        web.load(URLRequest(url: home))
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ app: NSApplication) -> Bool { true }

    // 离开确认：页面的 beforeunload 监听调用了 preventDefault 就问一次，选「离开」才继续
    func confirmLeave(_ then: @escaping (Bool) -> Void) {
        let probe = "(()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented})()"
        web.evaluateJavaScript(probe) { result, _ in
            guard result as? Bool == true else { return then(true) }
            let alert = NSAlert()
            alert.messageText = "离开这一页？"
            alert.informativeText = "页面提示还有内容没有安全保存。"
            alert.addButton(withTitle: "留下")
            alert.addButton(withTitle: "离开")
            then(alert.runModal() == .alertSecondButtonReturn)
        }
    }

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        if leaveConfirmed { return .terminateNow }
        confirmLeave { ok in
            self.leaveConfirmed = ok
            NSApp.reply(toApplicationShouldTerminate: ok)
        }
        return .terminateLater
    }

    func windowShouldClose(_ sender: NSWindow) -> Bool {
        if leaveConfirmed { return true }
        confirmLeave { ok in
            guard ok else { return }
            self.leaveConfirmed = true
            sender.close()
        }
        return false
    }

    @objc func reload(_ sender: Any?) {
        confirmLeave { ok in
            guard ok else { return }
            if self.web.url == nil || self.web.url?.scheme == "about" { self.web.load(URLRequest(url: self.home)) } else { self.web.reload() }
        }
    }

    @objc func goHome(_ sender: Any?) {
        confirmLeave { ok in if ok { self.web.load(URLRequest(url: self.home)) } }
    }

    func buildMenu() {
        let main = NSMenu()
        func add(_ title: String, _ items: [NSMenuItem]) {
            let item = NSMenuItem(), menu = NSMenu(title: title)
            items.forEach(menu.addItem)
            item.submenu = menu
            main.addItem(item)
        }
        func mi(_ title: String, _ action: Selector?, _ key: String, _ mods: NSEvent.ModifierFlags = .command) -> NSMenuItem {
            let item = NSMenuItem(title: title, action: action, keyEquivalent: key)
            item.keyEquivalentModifierMask = mods
            return item
        }
        add("数码世界", [mi("隐藏数码世界", #selector(NSApplication.hide(_:)), "h"), .separator(),
                      mi("退出数码世界", #selector(NSApplication.terminate(_:)), "q")])
        add("编辑", [mi("撤销", Selector(("undo:")), "z"), mi("重做", Selector(("redo:")), "z", [.command, .shift]), .separator(),
                   mi("剪切", #selector(NSText.cut(_:)), "x"), mi("拷贝", #selector(NSText.copy(_:)), "c"),
                   mi("粘贴", #selector(NSText.paste(_:)), "v"), mi("全选", #selector(NSText.selectAll(_:)), "a")])
        // WKWebView 自己也响应 reload:，不指定 target 会被它先接走，绕过离开确认
        let reloadItem = mi("重新载入", #selector(reload(_:)), "r"), homeItem = mi("回到首页", #selector(goHome(_:)), "h", [.command, .shift])
        reloadItem.target = self
        homeItem.target = self
        add("显示", [reloadItem, homeItem])
        add("窗口", [mi("最小化", #selector(NSWindow.miniaturize(_:)), "m"), mi("关闭", #selector(NSWindow.performClose(_:)), "w")])
        NSApp.mainMenu = main
    }

    func isLocal(_ url: URL?) -> Bool {
        guard let url else { return true }
        if url.scheme == "about" || url.scheme == "blob" || url.scheme == "data" { return true }
        return url.host == home.host && url.port == home.port
    }

    // 导航：本站留在窗口内，其余交给默认浏览器
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if action.shouldPerformDownload { return decisionHandler(.download) }
        if !isLocal(action.request.url) {
            NSWorkspace.shared.open(action.request.url!)
            return decisionHandler(.cancel)
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse,
                 decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        let disposition = (response.response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Content-Disposition") ?? ""
        decisionHandler(disposition.lowercased().hasPrefix("attachment") || !response.canShowMIMEType ? .download : .allow)
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = self }

    // 服务没起来时给出说明，而不是白屏
    func webView(_ webView: WKWebView, didFailProvisionalNavigation nav: WKNavigation!, withError error: Error) {
        let html = """
        <meta charset="utf-8"><body style="font:15px -apple-system;padding:48px;color:#e9eeff;background:#070b16">
        <h2>连不上数码世界服务</h2><p>\(home.absoluteString) 没有响应。常驻服务 cn.personal-ai-workbench.server 可能还在启动，或已停止。</p>
        <p>按 ⌘R 重试。</p></body>
        """
        webView.loadHTMLString(html, baseURL: nil)
    }

    // target=_blank / window.open：本站在当前窗口打开，外部交给默认浏览器
    func webView(_ webView: WKWebView, createWebViewWith config: WKWebViewConfiguration,
                 for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url {
            if isLocal(url) { webView.load(action.request) } else { NSWorkspace.shared.open(url) }
        }
        return nil
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = NSAlert()
        alert.messageText = message
        alert.addButton(withTitle: "好")
        alert.runModal()
        completionHandler()
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = NSAlert()
        alert.messageText = message
        alert.addButton(withTitle: "确定")
        alert.addButton(withTitle: "取消")
        completionHandler(alert.runModal() == .alertFirstButtonReturn)
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let alert = NSAlert()
        alert.messageText = prompt
        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 320, height: 24))
        field.stringValue = defaultText ?? ""
        alert.accessoryView = field
        alert.addButton(withTitle: "确定")
        alert.addButton(withTitle: "取消")
        completionHandler(alert.runModal() == .alertFirstButtonReturn ? field.stringValue : nil)
    }

    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.canChooseDirectories = parameters.allowsDirectories
        panel.canChooseFiles = true
        panel.beginSheetModal(for: window) { completionHandler($0 == .OK ? panel.urls : nil) }
    }

    // 下载：存到「下载」文件夹，重名自动加序号，完成后在访达中显示
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String,
                  completionHandler: @escaping (URL?) -> Void) {
        let dir = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask)[0]
        let base = (suggestedFilename as NSString).deletingPathExtension, ext = (suggestedFilename as NSString).pathExtension
        var target = dir.appendingPathComponent(suggestedFilename), n = 1
        while FileManager.default.fileExists(atPath: target.path) {
            n += 1
            target = dir.appendingPathComponent(ext.isEmpty ? "\(base) \(n)" : "\(base) \(n).\(ext)")
        }
        downloads[ObjectIdentifier(download)] = target
        completionHandler(target)
    }

    func downloadDidFinish(_ download: WKDownload) {
        if let url = downloads.removeValue(forKey: ObjectIdentifier(download)) {
            NSWorkspace.shared.activateFileViewerSelecting([url])
        }
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        downloads.removeValue(forKey: ObjectIdentifier(download))
        let alert = NSAlert(error: error)
        alert.runModal()
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
