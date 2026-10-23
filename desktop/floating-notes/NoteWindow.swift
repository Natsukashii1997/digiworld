import AppKit
import WebKit

struct NoteWindowPreference:Codable {
    var x:Double,y:Double,width:Double,height:Double,pinned:Bool,open:Bool
}
final class NoteWindow:NSObject,NSWindowDelegate,WKNavigationDelegate {
    let id:String
    unowned let owner:FloatingApp
    let panel:NotesPanel
    let web:WKWebView
    var pinned:Bool,ready=false,closing=false,phase="saved"
    var retryTimer:Timer?
    var scope:String {"note:"+id}
    init(id:String,owner:FloatingApp,preference:NoteWindowPreference?,visible:Bool) {
        self.id=id;self.owner=owner;pinned=false
        let previous=preference.map{NSRect(x:$0.x,y:$0.y,width:$0.width,height:$0.height)}
        let matched=previous.flatMap{frame in NSScreen.screens.max{a,b in let x=a.visibleFrame.intersection(frame),y=b.visibleFrame.intersection(frame);return max(0,x.width)*max(0,x.height)<max(0,y.width)*max(0,y.height)}}
        let screen=(matched ?? NSScreen.main)?.visibleFrame ?? NSRect(x:0,y:0,width:1200,height:800)
        let width=min(max(preference?.width ?? 340,280),screen.width),height=min(max(preference?.height ?? 410,260),screen.height)
        let x=min(max(preference?.x ?? screen.midX-width/2,screen.minX),screen.maxX-width),y=min(max(preference?.y ?? screen.midY-height/2,screen.minY),screen.maxY-height)
        panel=NotesPanel(contentRect:NSRect(x:x,y:y,width:width,height:height),styleMask:[.titled,.closable,.resizable,.miniaturizable],backing:.buffered,defer:false)
        let config=WKWebViewConfiguration();config.websiteDataStore = .nonPersistent()
        config.userContentController.addScriptMessageHandler(owner,contentWorld:.page,name:"floatingNotes")
        web=WKWebView(frame:panel.contentView!.bounds,configuration:config)
        super.init()
        panel.setFrame(NSRect(x:x,y:y,width:width,height:height),display:false)
        panel.title="随手记";panel.minSize=NSSize(width:280,height:280);panel.isReleasedWhenClosed=false;panel.hidesOnDeactivate=false
        panel.collectionBehavior=[.canJoinAllSpaces,.fullScreenAuxiliary];panel.isFloatingPanel=false
        panel.delegate=self;panel.contentView=web;web.autoresizingMask=[.width,.height];web.navigationDelegate=self
        panel.level = .normal
        load()
        if visible{show()}else{panel.orderOut(nil)}
    }
    func load(){let scripts=web.configuration.userContentController;scripts.removeAllUserScripts();let value=try! JSONSerialization.data(withJSONObject:["id":id,"pinned":pinned]);scripts.addUserScript(WKUserScript(source:"window.floatingNoteWindow="+String(data:value,encoding:.utf8)!+";",injectionTime:.atDocumentStart,forMainFrameOnly:true));retryTimer?.invalidate();retryTimer=nil;ready=false;var components=URLComponents(url:owner.baseURL,resolvingAgainstBaseURL:false)!;components.queryItems=[URLQueryItem(name:"floatingNotes",value:"1"),URLQueryItem(name:"noteId",value:id)];components.fragment="/float";web.load(URLRequest(url:components.url!,cachePolicy:.reloadIgnoringLocalCacheData))}
    func show(){NSApp.activate(ignoringOtherApps:true);panel.makeKeyAndOrderFront(nil);panel.makeFirstResponder(web);remember();if ready{web.evaluateJavaScript("window.floatingNotesHost?.focus()",completionHandler:nil)}}
    func setPinned(_ value:Bool){pinned=false;panel.level = .normal;remember()}
    func remember(){
        let f=panel.frame
        owner.preferences.noteWindows=owner.preferences.noteWindows ?? [:]
        owner.preferences.noteWindows?[id]=NoteWindowPreference(x:f.origin.x,y:f.origin.y,width:f.width,height:f.height,pinned:pinned,open:panel.isVisible)
        owner.savePreferences()
    }
    func windowDidMove(_ notification:Notification){remember()}
    func windowDidResize(_ notification:Notification){remember()}
    func windowShouldClose(_ sender:NSWindow)->Bool {hide();return false}
    func hide(){
        guard !closing else{return};closing=true
        flush{[weak self] ok in guard let self else{return};self.closing=false
            if ok{self.panel.orderOut(nil);self.remember()}else{self.owner.showError("草稿尚未确认留在本机，请完成输入后再关闭。")}
        }
    }
    func flush(_ completion:@escaping(Bool)->Void){
        guard ready else{completion(true);return}
        web.callAsyncJavaScript("return await window.floatingNotesHost.prepareCollapse()",arguments:[:],in:nil,in:.page){result in
            if case .success(let value)=result {completion((value as? [String:Any])?["ok"] as? Bool==true)}else{completion(false)}
        }
    }
    func webView(_ webView:WKWebView,didFinish navigation:WKNavigation!){ready=webView.url?.fragment=="/float";if ready{retryTimer?.invalidate();retryTimer=nil}}
    func webView(_ webView:WKWebView,decidePolicyFor action:WKNavigationAction,decisionHandler:@escaping(WKNavigationActionPolicy)->Void){
        guard action.targetFrame?.isMainFrame==true,let url=action.request.url else{decisionHandler(.cancel);return}
        decisionHandler(owner.sameOrigin(url)&&url.path=="/" ? .allow:.cancel)
    }
    func webViewWebContentProcessDidTerminate(_ webView:WKWebView){load()}
    func webView(_ webView:WKWebView,didFailProvisionalNavigation navigation:WKNavigation!,withError error:Error){
        ready=false
        retryTimer?.invalidate();retryTimer=Timer.scheduledTimer(withTimeInterval:5,repeats:false){[weak self] _ in self?.load()}
        web.loadHTMLString("<meta charset='utf-8'><body style='font:16px -apple-system;padding:24px;color:#e9eeff;background:#0f1729'><p>暂时连不上数码世界，草稿保留在本机。</p><button style='padding:12px;min-height:44px;border:1px solid #8b98b8;border-radius:8px;color:#e9eeff;background:transparent' onclick=\"window.webkit.messageHandlers.floatingNotes.postMessage({action:'retry'})\">重新连接</button></body>",baseURL:owner.baseURL)
    }
}
