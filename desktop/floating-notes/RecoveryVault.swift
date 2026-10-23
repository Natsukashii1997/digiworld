import Foundation
import Darwin

final class RecoveryVault {
    let directory: URL
    let origin: String
    private let lockDescriptor: Int32
    init(directory: URL, origin: String) throws {
        self.directory=directory; self.origin=origin
        try FileManager.default.createDirectory(at:directory,withIntermediateDirectories:true,attributes:[.posixPermissions:0o700])
        lockDescriptor=open(directory.appendingPathComponent("instance.lock").path,O_CREAT|O_RDWR|O_NOFOLLOW,0o600)
        guard lockDescriptor>=0,flock(lockDescriptor,LOCK_EX|LOCK_NB)==0 else {throw NSError(domain:"FloatingNotes",code:1,userInfo:[NSLocalizedDescriptionKey:"这个草稿位置已有便签栏在运行。"])}
    }
    deinit { flock(lockDescriptor,LOCK_UN);close(lockDescriptor) }
    private var draftsURL:URL { directory.appendingPathComponent("drafts.json") }
    private func scopes() throws -> [String:Any] {
        guard FileManager.default.fileExists(atPath:draftsURL.path) else {return [:]}
        let data=try Data(contentsOf:draftsURL)
        guard data.count<=6_000_000,let envelope=try JSONSerialization.jsonObject(with:data) as? [String:Any],envelope["origin"] as? String==origin else {throw fail("草稿来源需要核对，原文件已保留。")}
        if let value=envelope["value"] {return ["bar":value]} // Read legacy state without migrating on read.
        guard envelope["version"] as? Int==2,let values=envelope["scopes"] as? [String:Any] else {throw fail("草稿需要核对，原文件已保留。")}
        return values
    }
    func load(scope:String="bar") throws -> Any {try scopes()[scope] ?? NSNull()}
    func pendingNoteIDs() throws -> [String] {
        try scopes().compactMap { key,value in
            guard key.hasPrefix("note:"),let value=value as? [String:Any],let records=value["records"] as? [[String:Any]],!records.isEmpty else{return nil}
            return String(key.dropFirst(5))
        }
    }
    func save(_ value: Any,scope:String="bar") throws {
        guard scope=="bar" || scope.range(of:"^note:[a-zA-Z0-9_-]{1,100}$",options:.regularExpression) != nil else {throw fail("草稿窗口无效")}
        guard let value=value as? [String:Any],value["version"] as? Int==1,let records=value["records"] as? [[String:Any]],records.count<=100,let identity=value["rootIdentity"] as? String,identity.range(of:"^[a-f0-9]{64}$",options:.regularExpression) != nil else {throw fail("草稿内容需要核对。")}
        if scope != "bar",records.contains(where:{$0["id"] as? String != String(scope.dropFirst(5)) && $0["forkedFrom"] as? String != String(scope.dropFirst(5))}){throw fail("这份草稿属于另一张便签")}
        // Always reread the durable envelope. A failed readback must never let stale
        // in-memory state overwrite a write whose result is not yet known.
        var values=try scopes();values[scope]=value
        var ids=Set<String>(),count=0
        for payload in values.values {
            guard let payload=payload as? [String:Any],let entries=payload["records"] as? [[String:Any]] else{throw fail("草稿需要核对")}
            if !entries.isEmpty && payload["rootIdentity"] as? String != identity {throw fail("草稿资料位置需要核对")}
            for entry in entries {
                guard let id=entry["id"] as? String,ids.insert(id).inserted else {throw fail("这张便签已在另一窗口编辑")}
                count += 1
            }
        }
        guard count<=100 else {throw fail("本机草稿区已满，请先保存已有便签。")}
        let data=try JSONSerialization.data(withJSONObject:["version":2,"origin":origin,"scopes":values],options:[.sortedKeys])
        guard data.count<=6_000_000 else {throw fail("本机草稿区已满，请先保存已有便签。")}
        try data.write(to:draftsURL,options:.atomic)
        try FileManager.default.setAttributes([.posixPermissions:0o600],ofItemAtPath:draftsURL.path)
        guard try Data(contentsOf:draftsURL)==data else {throw fail("草稿回读未确认。")}
    }
    func fail(_ message:String)->NSError {NSError(domain:"FloatingNotes",code:2,userInfo:[NSLocalizedDescriptionKey:message])}
}
