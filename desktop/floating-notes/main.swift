import AppKit
import WebKit
import Carbon
import CoreGraphics

func color(_ hex: UInt32, _ alpha: CGFloat = 1) -> NSColor {
    NSColor(calibratedRed:CGFloat((hex>>16)&255)/255,green:CGFloat((hex>>8)&255)/255,blue:CGFloat(hex&255)/255,alpha:alpha)
}
final class BallPanel:NSPanel { override var canBecomeKey:Bool {false};override var canBecomeMain:Bool {false} }
final class NotesPanel:NSPanel { override var canBecomeKey:Bool {true};override var canBecomeMain:Bool {false} }
final class HeaderDragView:NSView {
    override func acceptsFirstMouse(for event:NSEvent?)->Bool {true}
    override func hitTest(_ point:NSPoint)->NSView? {point.y>=bounds.height-52 && point.x<bounds.width-92 ? self:nil}
    weak var web:WKWebView?
    // 用户 2026-10-28：拖动条挡住了网页，点顶栏空白退不出编辑；拖动前先给顶栏补一次 pointerdown，按外部点击处理。
    override func mouseDown(with event:NSEvent){web?.evaluateJavaScript("document.querySelector('.fn-hd')?.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))");window?.performDrag(with:event)}
}
final class BallView:NSView {
    weak var owner:FloatingApp?
    override var isOpaque:Bool {false}
    override func acceptsFirstMouse(for event:NSEvent?)->Bool {true}
    var phase="saved",expanded=false,hover=false,dragging=false
    var arc:CGFloat=0
    static let icon=Bundle.main.image(forResource:"ball")
    override init(frame:NSRect){super.init(frame:frame);setAccessibilityElement(true);setAccessibilityRole(.button);setAccessibilityLabel("随手记悬浮球");toolTip="随手记"}
    required init?(coder:NSCoder){fatalError()}
    override func updateTrackingAreas(){super.updateTrackingAreas();trackingAreas.forEach(removeTrackingArea);addTrackingArea(NSTrackingArea(rect:bounds,options:[.mouseEnteredAndExited,.activeAlways],owner:self,userInfo:nil))}
    override func mouseEntered(with event:NSEvent){hover=true;needsDisplay=true}
    override func mouseExited(with event:NSEvent){hover=false;needsDisplay=true}
    override func accessibilityPerformPress()->Bool {owner?.toggle();return true}
    override func draw(_ dirtyRect:NSRect){
        guard let context=NSGraphicsContext.current?.cgContext else{return}
        context.saveGState();defer{context.restoreGState()}
        context.clear(bounds)
        // 以下按 32pt 坐标绘制，按悬浮球实际尺寸等比放大。
        let scale=Geometry.hit/32;context.scaleBy(x:scale,y:scale)
        if dragging {context.translateBy(x:16,y:16);context.scaleBy(x:1.06,y:1.06);context.translateBy(x:-16,y:-16)}
        if hover && !NSWorkspace.shared.accessibilityDisplayShouldReduceMotion {context.translateBy(x:0,y:1)}
        context.setAlpha(hover||expanded ? 1:0.94)
        let disk=CGRect(x:2,y:2,width:28,height:28)
        // 用户 2026-10-28：图标换成上传的新图（Resources/ball.png）；缺图时退回深色圆底。
        if let icon=BallView.icon {icon.draw(in:disk.insetBy(dx:-2,dy:-2))}else{color(0x0f1729).setFill();NSBezierPath(ovalIn:disk).fill()}
        if expanded||hover {color(0xffd166,expanded ? 1:0.6).setStroke();let outer=NSBezierPath(ovalIn:disk.insetBy(dx:-1.5,dy:-1.5));outer.lineWidth=1;outer.stroke()}
        if ["draft","failed","conflict"].contains(phase){let dot=NSRect(x:22,y:22,width:8,height:8);color(0x0c1325).setFill();NSBezierPath(ovalIn:dot).fill();color(phase=="draft" ? 0xffd166:0xff6b6b).setFill();NSBezierPath(ovalIn:dot.insetBy(dx:1.5,dy:1.5)).fill()}
        if phase=="saving"||phase=="unknown" {color(0xffd166).setStroke();let path=NSBezierPath();path.lineWidth=1.5;if NSWorkspace.shared.accessibilityDisplayShouldReduceMotion{path.setLineDash([3,3],count:2,phase:0);path.appendOval(in:NSRect(x:1,y:1,width:30,height:30))}else{path.appendArc(withCenter:NSPoint(x:16,y:16),radius:15,startAngle:arc,endAngle:arc+90)};path.stroke()}
    }
    override func mouseDown(with event:NSEvent){
        guard let owner,let window else{return};let origin=window.convertPoint(toScreen:event.locationInWindow),start=window.frame.origin
        var moved=false
        while let next=NSApp.nextEvent(matching:[.leftMouseDragged,.leftMouseUp],until:.distantFuture,inMode:.eventTracking,dequeue:true){
            let point=next.window?.convertPoint(toScreen:next.locationInWindow) ?? NSEvent.mouseLocation,dx=point.x-origin.x,dy=point.y-origin.y
            if hypot(dx,dy)>4 {moved=true;dragging=true;needsDisplay=true}
            if moved {window.setFrameOrigin(NSPoint(x:start.x+dx,y:start.y+dy));owner.showGuide(at:point)}
            if next.type == .leftMouseUp {break}
        }
        dragging=false;needsDisplay=true;owner.hideGuide()
        if moved {owner.snapBall()}else{owner.toggle()}
    }
}
struct Preferences:Codable {var positions:[String:BallPosition]=[:];var lastDisplayUUID:String?;var noteWindows:[String:NoteWindowPreference]?}
final class FloatingApp:NSObject,NSApplicationDelegate,WKNavigationDelegate,WKUIDelegate,WKScriptMessageHandlerWithReply {
    let baseURL:URL,stateURL:URL,vault:RecoveryVault
    var noteWindows:[String:NoteWindow]=[:],barPhase="saved",terminating=false
    var pendingNoteWindows=Set<String>()
    var preferences=Preferences(),ball:BallPanel!,panel:NotesPanel!,web:WKWebView!,ballView:BallView!,guide:NSPanel!,status:NSStatusItem!
    var pinned=false,composing=false,remoteLoaded=false,closing=false,quitPending=false,outsideIntent=false
    var previousApp:NSRunningApplication?
    var diagnosticEvents:[[String:Any]]=[]
    var monitors:[Any]=[],observers:[NSObjectProtocol]=[],animation:Timer?
    init(baseURL:URL,stateURL:URL)throws{self.baseURL=baseURL;self.stateURL=stateURL;vault=try RecoveryVault(directory:stateURL,origin:baseURL.absoluteString);super.init();if let data=try? Data(contentsOf:stateURL.appendingPathComponent("preferences.json")),let value=try? JSONDecoder().decode(Preferences.self,from:data){preferences=value}}
    func applicationDidFinishLaunching(_ notification:Notification){
        NSApp.setActivationPolicy(.accessory)
        ball=BallPanel(contentRect:NSRect(x:0,y:0,width:Geometry.hit,height:Geometry.hit),styleMask:[.borderless,.nonactivatingPanel],backing:.buffered,defer:false)
        ball.isOpaque=false;ball.backgroundColor = .clear;ball.hasShadow=false;ball.level = .floating;ball.hidesOnDeactivate=false
        ball.collectionBehavior=[.canJoinAllSpaces,.ignoresCycle,.fullScreenPrimary]
        if #available(macOS 13.0,*){ball.collectionBehavior.insert(.canJoinAllApplications)}
        ballView=BallView(frame:ball.contentView!.bounds);ballView.owner=self;ball.contentView=ballView
        panel=NotesPanel(contentRect:NSRect(x:0,y:0,width:368,height:600),styleMask:[.borderless],backing:.buffered,defer:false)
        panel.title="桌面随手记";panel.isOpaque=false;panel.backgroundColor = .clear;panel.hasShadow=true;panel.level = .floating;panel.hidesOnDeactivate=false;panel.isReleasedWhenClosed=false
        panel.collectionBehavior=[.canJoinAllSpaces,.fullScreenAuxiliary,.ignoresCycle]
        if #available(macOS 13.0,*){panel.collectionBehavior.insert(.canJoinAllApplications)}
        let configuration=WKWebViewConfiguration();configuration.websiteDataStore = .nonPersistent();configuration.userContentController.addScriptMessageHandler(self,contentWorld:.page,name:"floatingNotes")
        web=WKWebView(frame:panel.contentView!.bounds,configuration:configuration);web.autoresizingMask=[.width,.height];web.navigationDelegate=self;web.uiDelegate=self;web.underPageBackgroundColor = .clear
        let container=NSView(frame:panel.contentView!.bounds);container.addSubview(web);let drag=HeaderDragView(frame:container.bounds);drag.web=web;drag.autoresizingMask=[.width,.height];container.addSubview(drag);panel.contentView=container
        guide=NSPanel(contentRect:.zero,styleMask:[.borderless,.nonactivatingPanel],backing:.buffered,defer:false);guide.isOpaque=false;guide.backgroundColor=color(0xffd166,0.7);guide.level = .floating;guide.ignoresMouseEvents=true;guide.hasShadow=true;guide.collectionBehavior=[.canJoinAllSpaces,.ignoresCycle]
        buildMainMenu();buildMenu()
        restoreBall();ball.orderFrontRegardless();loadPage()
        let remembered=preferences.noteWindows ?? [:],pending=(try? vault.pendingNoteIDs()) ?? []
        for id in Set(remembered.filter{$0.value.open}.map{$0.key}+pending){noteWindows[id]=NoteWindow(id:id,owner:self,preference:remembered[id],visible:remembered[id]?.open ?? false)}
        if let global=NSEvent.addGlobalMonitorForEvents(matching:[.leftMouseDown,.rightMouseDown,.otherMouseDown],handler:{[weak self] event in self?.outsideClick(event:event)}){monitors.append(global)}
        if let local=NSEvent.addLocalMonitorForEvents(matching:[.leftMouseDown,.rightMouseDown,.otherMouseDown],handler:{[weak self] event in self?.outsideClick(event:event);return event}){monitors.append(local)}
        observers.append(NotificationCenter.default.addObserver(forName:NSApplication.didChangeScreenParametersNotification,object:nil,queue:.main){[weak self] _ in self?.restoreBall()})
        animation=Timer.scheduledTimer(withTimeInterval:0.1,repeats:true){[weak self] _ in guard let self else{return};if ["saving","unknown"].contains(self.ballView.phase) && !NSWorkspace.shared.accessibilityDisplayShouldReduceMotion{self.ballView.arc-=36;self.ballView.needsDisplay=true}}
    }
    func screenKey(_ screen:NSScreen)->String {guard let number=screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber,let uuid=CGDisplayCreateUUIDFromDisplayID(CGDirectDisplayID(number.uint32Value))?.takeRetainedValue() else{return "primary"};return CFUUIDCreateString(nil,uuid) as String}
    func currentScreen()->NSScreen {NSScreen.screens.first(where:{$0.frame.contains(ball?.frame.center ?? NSEvent.mouseLocation)}) ?? NSScreen.main ?? NSScreen.screens[0]}
    func restoreBall(){let screen=NSScreen.screens.first(where:{screenKey($0)==preferences.lastDisplayUUID}) ?? currentScreen(),key=screenKey(screen),position=preferences.positions[key] ?? BallPosition(edge:"right",fraction:0.55);ball.setFrame(Geometry.ball(position,in:screen.visibleFrame),display:true);if panel.isVisible{placePanel()}}
    func snapBall(){let screen=currentScreen(),position=Geometry.position(ball.frame,in:screen.visibleFrame);preferences.positions[screenKey(screen)]=position;preferences.lastDisplayUUID=screenKey(screen);ball.setFrame(Geometry.ball(position,in:screen.visibleFrame),display:true);savePreferences();if panel.isVisible{placePanel()}}
    func showGuide(at point:NSPoint){guard let screen=NSScreen.screens.first(where:{$0.frame.contains(point)}) else{return};let f=screen.visibleFrame,left=abs(point.x-f.minX)<48,right=abs(point.x-f.maxX)<48;if left||right{guide.setFrame(NSRect(x:left ? f.minX+2:f.maxX-5,y:f.minY+12,width:3,height:f.height-24),display:true);guide.orderFrontRegardless()}else{hideGuide()}}
    func hideGuide(){guide.orderOut(nil)}
    func placePanel(){panel.setFrame(Geometry.panel(ball:ball.frame,screen:currentScreen().visibleFrame),display:true)}
    @objc func toggle(){trace("toggle");if panel.isVisible{requestCollapse()}else{let front=NSWorkspace.shared.frontmostApplication;if front?.processIdentifier != ProcessInfo.processInfo.processIdentifier{previousApp=front};placePanel();NSApp.activate(ignoringOtherApps:true);panel.makeKeyAndOrderFront(nil);panel.makeFirstResponder(web);ballView.expanded=true;ballView.needsDisplay=true;web.evaluateJavaScript("window.floatingNotesHost?.focus()",completionHandler:nil)}}
    func outsideClick(event:NSEvent){let time=event.timestamp,point=event.window?.convertPoint(toScreen:event.locationInWindow) ?? event.locationInWindow;DispatchQueue.main.asyncAfter(deadline:.now()+0.15){[weak self] in self?.settledOutsideClick(time:time,point:point)}}
    func settledOutsideClick(time:TimeInterval,point:NSPoint){trace("outside",point:point);guard panel.isVisible,!pinned,!closing,!panel.isKeyWindow else{return};if panel.frame.contains(point)||ball.frame.contains(point){return};let spell=NSSpellChecker.shared;if (spell.spellingPanel.isVisible&&spell.spellingPanel.frame.contains(point)) || (spell.substitutionsPanel.isVisible&&spell.substitutionsPanel.frame.contains(point)){return};if composing || (panel.firstResponder as? NSTextInputClient)?.hasMarkedText()==true {outsideIntent=true;return};requestCollapse(automatic:true)}
    func requestCollapse(quit:Bool=false,automatic:Bool=false){if quit{quitPending=true};guard !closing else{return};closing=true
        if !remoteLoaded{closing=false;if quitPending{quitPending=false;NSApp.reply(toApplicationShouldTerminate:true)}else{hidePanel(restoreFocus:!automatic)};return}
        web.callAsyncJavaScript("return await window.floatingNotesHost.prepareCollapse()",arguments:[:],in:nil,in:.page){[weak self] result in guard let self else{return};self.closing=false;if automatic && !self.quitPending&&(self.pinned||self.panel.isKeyWindow){return};switch result{case .success(let value):if (value as? [String:Any])?["ok"] as? Bool==true{if self.quitPending{self.quitPending=false;NSApp.reply(toApplicationShouldTerminate:true)}else{self.hidePanel(restoreFocus:!automatic)}}else if self.quitPending{self.quitPending=false;NSApp.reply(toApplicationShouldTerminate:false);self.showError("中文输入或草稿保存尚未完成，请完成后再退出。")};case .failure:if self.quitPending{self.quitPending=false;NSApp.reply(toApplicationShouldTerminate:false)};self.showError("草稿尚未确认留在本机，请保留窗口并重试。")}}
    }
    func hidePanel(restoreFocus:Bool){
        trace("hide");let ownPID=ProcessInfo.processInfo.processIdentifier,restore=restoreFocus && NSApp.isActive && NSWorkspace.shared.frontmostApplication?.processIdentifier==ownPID
        panel.orderOut(nil);ballView.expanded=false;ballView.needsDisplay=true
        if restore,let previous=previousApp,!previous.isTerminated,NSWorkspace.shared.frontmostApplication?.processIdentifier==ownPID{if #available(macOS 14.0,*){NSApp.yieldActivation(to:previous);previous.activate(from:.current,options:[])}else{previous.activate(options:[])}}
    }
    func applicationShouldTerminate(_ sender:NSApplication)->NSApplication.TerminateReply {
        if terminating{return .terminateLater};terminating=true
        let windows=Array(noteWindows.values)
        func finish(_ ok:Bool){self.terminating=false;NSApp.reply(toApplicationShouldTerminate:ok);if !ok{self.showError("中文输入或草稿保存尚未完成，请完成后再退出。")}}
        func next(_ index:Int){if index==windows.count{self.savePreferences();finish(true);return};windows[index].flush{ok in if ok{next(index+1)}else{finish(false)}}}
        DispatchQueue.main.async {if self.remoteLoaded{self.web.callAsyncJavaScript("return await window.floatingNotesHost.prepareCollapse()",arguments:[:],in:nil,in:.page){result in if case .success(let value)=result,(value as? [String:Any])?["ok"] as? Bool==true{next(0)}else{finish(false)}}}else{next(0)}}
        return .terminateLater
    }
    func openNote(_ id:String,attempt:Int=0,completion:@escaping(Any?,String?)->Void){
        guard id.range(of:"^[a-zA-Z0-9_-]{1,100}$",options:.regularExpression) != nil else{completion(nil,"便签编号无效");return}
        if let window=noteWindows[id]{window.show();completion(true,nil);return}
        func retry(){
            guard attempt<40 else{completion(nil,"便签栏尚未连接，请稍后再试");return}
            DispatchQueue.main.asyncAfter(deadline:.now()+0.25){[weak self] in
                guard let self else{completion(nil,"随手记已关闭");return}
                self.openNote(id,attempt:attempt+1,completion:completion)
            }
        }
        guard remoteLoaded else{retry();return}
        guard !pendingNoteWindows.contains(id) else{completion(nil,"这张便签正在打开，请稍候");return}
        pendingNoteWindows.insert(id)
        // All entry points release the bar editor before giving this ID to its own window.
        web.callAsyncJavaScript("return window.floatingNotesHost ? await window.floatingNotesHost.prepareNoteOpen(id) : {ok:false,pending:true}",arguments:["id":id],in:nil,in:.page){[weak self] result in
            guard let self else{completion(nil,"随手记已关闭");return}
            defer{self.pendingNoteWindows.remove(id)}
            if case .success(let value)=result,let state=value as? [String:Any],state["pending"] as? Bool==true{retry();return}
            guard case .success(let value)=result,let state=value as? [String:Any],state["ok"] as? Bool==true else{
                if case .success(let value)=result,let state=value as? [String:Any]{completion(nil,state["message"] as? String ?? "草稿尚未保存，请稍后再试")}
                else{completion(nil,"便签栏尚未就绪，请稍后再试")}
                return
            }
            do{
                if let window=self.noteWindows[id]{window.show();completion(true,nil);return}
                if let recovered=try self.vault.load() as? [String:Any],let records=recovered["records"] as? [[String:Any]],records.contains(where:{$0["id"] as? String==id}){throw self.vault.fail("请先保存这张便签，再独立打开")}
                guard self.noteWindows.count<100 else{throw self.vault.fail("打开的便签过多，请先退出随手记再继续")}
                let window=NoteWindow(id:id,owner:self,preference:self.preferences.noteWindows?[id],visible:true);self.noteWindows[id]=window
                completion(true,nil)
            }catch{completion(nil,error.localizedDescription)}
        }
    }
    func application(_ application:NSApplication,open urls:[URL]){for url in urls where url.scheme=="digitalworld-notes"&&url.host=="note"{openNote(String(url.path.dropFirst())){[weak self] _,error in if let error{self?.showError(error)}}}}
    func refreshPhase(){let states=[barPhase]+noteWindows.values.map{$0.phase};ballView.phase=["conflict","failed","unknown","saving","draft"].first(where:states.contains) ?? "saved";ballView.needsDisplay=true}
    func applicationWillTerminate(_ notification:Notification){monitors.forEach(NSEvent.removeMonitor);observers.forEach(NotificationCenter.default.removeObserver);animation?.invalidate()}
    func savePreferences(){do{let data=try JSONEncoder().encode(preferences);try data.write(to:stateURL.appendingPathComponent("preferences.json"),options:.atomic)}catch{showError("位置暂时没记住，下次启动可能恢复默认值。")}}
    func loadPage(){remoteLoaded=false;web.load(URLRequest(url:URL(string:"/?floatingNotes=1#/float",relativeTo:baseURL)!.absoluteURL,cachePolicy:.reloadIgnoringLocalCacheData))}
    func webView(_ webView:WKWebView,didFinish navigation:WKNavigation!){remoteLoaded=webView.url?.fragment=="/float"}
    func webView(_ webView:WKWebView,didFailProvisionalNavigation navigation:WKNavigation!,withError error:Error){offlinePage()}
    func webView(_ webView:WKWebView,didFail navigation:WKNavigation!,withError error:Error){offlinePage()}
    func webViewWebContentProcessDidTerminate(_ webView:WKWebView){remoteLoaded=false;loadPage()}
    func webView(_ webView:WKWebView,decidePolicyFor action:WKNavigationAction,decisionHandler:@escaping(WKNavigationActionPolicy)->Void){guard action.targetFrame?.isMainFrame==true,let url=action.request.url else{decisionHandler(.cancel);return};decisionHandler(sameOrigin(url)&&url.path=="/" ? .allow:.cancel)}
    func sameOrigin(_ url:URL)->Bool {url.scheme==baseURL.scheme&&url.host==baseURL.host&&(url.port ?? 80)==(baseURL.port ?? 80)}
    func userContentController(_ userContentController:WKUserContentController,didReceive message:WKScriptMessage,replyHandler:@escaping(Any?,String?)->Void){
        let origin=message.frameInfo.securityOrigin
        guard message.frameInfo.isMainFrame,origin.protocol==baseURL.scheme,origin.host==baseURL.host,origin.port==(baseURL.port ?? 80),let payload=message.body as? [String:Any],let action=payload["action"] as? String else{replyHandler(nil,"不允许的页面来源");return}
        let surface=noteWindows.values.first(where:{$0.web === message.webView}),scope=surface?.scope ?? "bar"
        guard message.webView === web || surface != nil else{replyHandler(nil,"窗口来源无效");return}
        do {switch action {
        case "loadDrafts":replyHandler(try vault.load(scope:scope),nil)
        case "saveDrafts":
            if scope=="bar",let value=payload["value"] as? [String:Any],let records=value["records"] as? [[String:Any]],records.contains(where:{noteWindows[$0["id"] as? String ?? ""] != nil}){throw vault.fail("这张便签已在独立窗口打开，请在那里继续")}
            try vault.save(payload["value"] ?? NSNull(),scope:scope);replyHandler(true,nil)
        case "openNote":guard let value=payload["value"] as? [String:Any],let id=value["id"] as? String else{throw vault.fail("便签编号无效")};openNote(id,completion:replyHandler)
        case "activateNote":guard let value=payload["value"] as? [String:Any],let id=value["id"] as? String else{throw vault.fail("便签编号无效")};if let window=noteWindows[id]{window.show();replyHandler(true,nil)}else{replyHandler(pendingNoteWindows.contains(id),nil)}
        case "editCommand":guard let command=payload["value"] as? String,["copy","cut","paste"].contains(command),let sender=message.webView,sender.window?.isKeyWindow==true else{throw vault.fail("编辑窗口未激活")};sender.window?.makeFirstResponder(sender);let ok=NSApp.sendAction(NSSelectorFromString(command+":"),to:nil,from:sender);replyHandler(ok,ok ? nil:"请使用键盘快捷键")
        case "copyRich":
            guard let value=payload["value"] as? [String:Any],let plain=value["plain"] as? String,let html=value["html"] as? String,let rtf=value["rtf"] as? String,plain.utf8.count<=4_000_000,html.utf8.count<=16_000_000,rtf.utf8.count<=16_000_000,rtf.hasPrefix("{\\rtf1"),let rtfData=rtf.data(using:.ascii) else{throw vault.fail("复制内容无效或过长")}
            let item=NSPasteboardItem()
            guard item.setString(plain,forType:.string),item.setString(html,forType:.html),item.setData(rtfData,forType:.rtf) else{throw vault.fail("复制内容暂时无法准备")}
            if let rtfd=try RichClipboard.imageRTFD(value){guard item.setData(rtfd,forType:.rtfd) else{throw vault.fail("图片复制暂时无法准备")}}
            NSPasteboard.general.clearContents()
            guard NSPasteboard.general.writeObjects([item]) else{throw vault.fail("未能写入剪贴板，请重试")}
            replyHandler(true,nil)
        case "status":guard let value=payload["value"] as? [String:Any],let phase=value["phase"] as? String,["saved","saving","draft","failed","unknown","conflict"].contains(phase),let pinned=value["pinned"] as? Bool else{throw vault.fail("状态无效")};if let surface{surface.phase=phase;surface.setPinned(pinned)}else{self.pinned=pinned;barPhase=phase};refreshPhase();replyHandler(true,nil)
        case "composition":if surface != nil{replyHandler(true,nil);return};composing=payload["value"] as? Bool ?? false;if !composing&&outsideIntent{outsideIntent=false;DispatchQueue.main.asyncAfter(deadline:.now()+0.15){[weak self] in guard let self,!self.panel.isKeyWindow,!self.composing,!self.pinned else{return};self.requestCollapse(automatic:true)}};replyHandler(true,nil)
        case "collapse":replyHandler(true,nil);if let surface{surface.hide()}else{requestCollapse()}
        case "openMain":NSWorkspace.shared.open(URL(string:"/#notes",relativeTo:baseURL)!.absoluteURL);replyHandler(true,nil)
        case "retry":if let surface{surface.load()}else{loadPage()};replyHandler(true,nil)
        case "dragPanel":replyHandler(true,nil)
        default:replyHandler(nil,"不支持的操作")
        }}catch{replyHandler(nil,error.localizedDescription)}
    }
    func offlinePage(){remoteLoaded=false
        let html="""
        <!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;font:14px -apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif;color:#e9eeff;background:transparent}.panel{height:100%;border:1px solid rgba(140,178,255,.19);border-radius:14px;overflow:hidden;display:grid;grid-template-rows:52px 1fr 44px;background:linear-gradient(#152039,#0f1729 40%,#0c1325)}header,footer{display:flex;align-items:center;padding:0 16px;border-bottom:1px solid rgba(140,178,255,.11)}header b{font-size:16px}main{padding:64px 32px;text-align:center;color:#b4bfda;line-height:1.65}button{min-width:44px;min-height:44px;border-radius:8px;border:1px solid rgba(140,178,255,.32);background:none;color:#e9eeff;margin-top:16px;padding:0 16px}footer{border-top:1px solid rgba(140,178,255,.11);border-bottom:0;color:#8b98b8;font-size:13px}button:focus-visible{outline:2px solid #4de3ff}</style><div class="panel"><header><svg viewBox="0 0 12 12" style="width:14px;height:14px;fill:currentColor;shape-rendering:crispEdges" aria-hidden="true"><rect x="10" y="0" width="1" height="1"/><rect x="11" y="0" width="1" height="1"/><rect x="9" y="1" width="1" height="1"/><rect x="11" y="1" width="1" height="1"/><rect x="8" y="2" width="1" height="1"/><rect x="10" y="2" width="1" height="1"/><rect x="7" y="3" width="1" height="1"/><rect x="9" y="3" width="1" height="1"/><rect x="6" y="4" width="1" height="1"/><rect x="8" y="4" width="1" height="1"/><rect x="5" y="5" width="1" height="1"/><rect x="7" y="5" width="1" height="1"/><rect x="4" y="6" width="1" height="1"/><rect x="6" y="6" width="1" height="1"/><rect x="3" y="7" width="1" height="1"/><rect x="5" y="7" width="1" height="1"/><rect x="2" y="8" width="1" height="1"/><rect x="4" y="8" width="1" height="1"/><rect x="1" y="9" width="1" height="1"/><rect x="2" y="9" width="1" height="1"/><rect x="3" y="9" width="1" height="1"/><rect x="1" y="10" width="1" height="1"/><rect x="2" y="10" width="1" height="1"/><rect x="0" y="11" width="1" height="1"/></svg><b style="margin-left:8px">随手记</b><button aria-label="收起便签栏" style="margin:0 0 0 auto;border:0" onclick="window.webkit.messageHandlers.floatingNotes.postMessage({action:'collapse'})">−</button></header><main><svg viewBox="0 0 12 12" style="width:40px;height:40px;fill:currentColor;shape-rendering:crispEdges" aria-hidden="true"><rect x="10" y="0" width="1" height="1"/><rect x="11" y="0" width="1" height="1"/><rect x="9" y="1" width="1" height="1"/><rect x="11" y="1" width="1" height="1"/><rect x="8" y="2" width="1" height="1"/><rect x="10" y="2" width="1" height="1"/><rect x="7" y="3" width="1" height="1"/><rect x="9" y="3" width="1" height="1"/><rect x="6" y="4" width="1" height="1"/><rect x="8" y="4" width="1" height="1"/><rect x="5" y="5" width="1" height="1"/><rect x="7" y="5" width="1" height="1"/><rect x="4" y="6" width="1" height="1"/><rect x="6" y="6" width="1" height="1"/><rect x="3" y="7" width="1" height="1"/><rect x="5" y="7" width="1" height="1"/><rect x="2" y="8" width="1" height="1"/><rect x="4" y="8" width="1" height="1"/><rect x="1" y="9" width="1" height="1"/><rect x="2" y="9" width="1" height="1"/><rect x="3" y="9" width="1" height="1"/><rect x="1" y="10" width="1" height="1"/><rect x="2" y="10" width="1" height="1"/><rect x="0" y="11" width="1" height="1"/></svg><p>数码世界还没有启动，写过的草稿都在本机</p><button onclick="window.webkit.messageHandlers.floatingNotes.postMessage({action:'retry'})">重试</button></main><footer>等待连接数码世界<button style="margin:0 0 0 auto;border:0;padding:0" onclick="window.webkit.messageHandlers.floatingNotes.postMessage({action:'openMain'})">在数码世界打开</button></footer></div></html>
        """
        web.loadHTMLString(html,baseURL:baseURL)
    }
    func buildMainMenu(){
        let main=NSMenu(),appItem=NSMenuItem(),appMenu=NSMenu(title:"随手记"),editItem=NSMenuItem(),edit=NSMenu(title:"编辑")
        appItem.submenu=appMenu;main.addItem(appItem);let showItem=NSMenuItem(title:"显示便签栏",action:#selector(showNotes),keyEquivalent:"");showItem.target=self;appMenu.addItem(showItem);appMenu.addItem(.separator());let quitItem=NSMenuItem(title:"退出随手记",action:#selector(quit),keyEquivalent:"q");quitItem.target=self;appMenu.addItem(quitItem)
        editItem.submenu=edit;main.addItem(editItem)
        for (title,action,key,shift) in [("撤销","undo:","z",false),("重做","redo:","z",true),("剪切","cut:","x",false),("复制","copy:","c",false),("粘贴","paste:","v",false),("全选","selectAll:","a",false)]{let item=NSMenuItem(title:title,action:NSSelectorFromString(action),keyEquivalent:key);item.keyEquivalentModifierMask=shift ? [.command,.shift]:[.command];edit.addItem(item)}
        NSApp.mainMenu=main
    }
    @objc func showNotes(){if !panel.isVisible{toggle()}else{NSApp.activate(ignoringOtherApps:true);panel.makeKeyAndOrderFront(nil)}}
    func buildMenu(){status=NSStatusBar.system.statusItem(withLength:NSStatusItem.squareLength);status.button?.image=NSImage(systemSymbolName:"note.text",accessibilityDescription:"随手记");let menu=NSMenu();menu.addItem(withTitle:"显示/收起便签",action:#selector(toggle),keyEquivalent:"").target=self;menu.addItem(.separator());menu.addItem(withTitle:"退出随手记",action:#selector(quit),keyEquivalent:"").target=self;status.menu=menu}
    @objc func quit(){NSApp.terminate(nil)}
    func trace(_ event:String,point:NSPoint?=nil){
        guard CommandLine.arguments.contains("--diagnostics"),panel?.isVisible==true || event=="toggle" else{return}
        var value:[String:Any]=["event":event,"time":Date().timeIntervalSince1970,"visible":panel?.isVisible ?? false,"key":panel?.isKeyWindow ?? false,"pinned":pinned,"remote":remoteLoaded,"composing":composing,"phase":ballView?.phase ?? "saved","ball":NSStringFromRect(ball?.frame ?? .zero),"panel":NSStringFromRect(panel?.frame ?? .zero)]
        if let point{value["point"]=NSStringFromPoint(point)};diagnosticEvents.append(value);if diagnosticEvents.count>100{diagnosticEvents.removeFirst()}
        if let data=try? JSONSerialization.data(withJSONObject:diagnosticEvents,options:[.sortedKeys]){try? data.write(to:stateURL.appendingPathComponent("diagnostics.json"),options:.atomic)}
    }
    func showError(_ text:String){let alert=NSAlert();alert.messageText="随手记";alert.informativeText=text;alert.addButton(withTitle:"知道了");alert.runModal()}
}
extension CGRect {var center:NSPoint {NSPoint(x:midX,y:midY)}}
let arguments=CommandLine.arguments
if arguments.contains("--self-test"){Geometry.check();print("PASS native geometry: both edges, negative displays, clamping and short screens");exit(0)}
func argument(_ name:String)->String? {guard let index=arguments.firstIndex(of:name),arguments.count>index+1 else{return nil};return arguments[index+1]}
let rawURL=argument("--base-url") ?? "http://127.0.0.1:5178/"
guard let url=URL(string:rawURL),url.scheme=="http",url.host=="127.0.0.1",url.user==nil,url.password==nil,url.path=="/",url.query==nil,url.fragment==nil else{fputs("Invalid loopback base URL\n",stderr);exit(2)}
let directory=URL(fileURLWithPath:argument("--state-dir") ?? Bundle.main.bundleURL.deletingLastPathComponent().appendingPathComponent("FloatingNotesState").path,isDirectory:true)
do {let delegate=try FloatingApp(baseURL:url,stateURL:directory);let app=NSApplication.shared;app.delegate=delegate;app.run()}catch{fputs("Floating Notes: \(error.localizedDescription)\n",stderr);exit(1)}
