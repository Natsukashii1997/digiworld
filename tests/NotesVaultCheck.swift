import Foundation
@main struct NotesVaultCheck {
 static func main() throws {
  let dir=FileManager.default.temporaryDirectory.appendingPathComponent("note-vault-\(UUID())")
  defer {try? FileManager.default.removeItem(at:dir)}
  let vault=try RecoveryVault(directory:dir,origin:"http://127.0.0.1:61234/")
  func payload(_ id:String,_ text:String)->[String:Any]{["version":1,"rootIdentity":String(repeating:"a",count:64),"records":[["id":id,"text":text,"at":"2026-10-20T00:00:00Z","base":NSNull()]]]}
  try vault.save(payload("a","甲的草稿"),scope:"note:a")
  try vault.save(payload("b","乙的草稿"),scope:"note:b")
  try vault.save(["version":1,"rootIdentity":String(repeating:"a",count:64),"records":[]],scope:"note:a")
  let b=try vault.load(scope:"note:b") as! [String:Any]
  precondition((b["records"] as! [[String:Any]])[0]["text"] as? String=="乙的草稿")
  do {try vault.save(payload("b","越权"),scope:"note:a");fatalError("cross-note save accepted")}catch{}
  do {try vault.save(payload("b","重复"),scope:"bar");fatalError("duplicate recovery accepted")}catch{}
  var fork=payload("c","冲突另存")
  var rows=fork["records"] as! [[String:Any]];rows[0]["forkedFrom"]="a";fork["records"]=rows
  try vault.save(fork,scope:"note:a")
  let restored=try vault.load(scope:"note:a") as! [String:Any]
  precondition((restored["records"] as! [[String:Any]])[0]["id"] as? String=="c")
  let after=try vault.load(scope:"note:b") as! [String:Any]
  precondition((after["records"] as! [[String:Any]])[0]["text"] as? String=="乙的草稿")
  print("PASS isolated native recovery: interleaved windows, clear-one/retain-other, scope and duplicate guards")
 }
}
