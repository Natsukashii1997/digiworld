// 候选：固定工作台服务，JSON stdin/stdout。禁止把 secret 放 argv 或交付给前端。
// 仅产品用户动作调用；开发测试使用注入 runner，绝不编译或执行此 helper。
import Foundation
import Security

let service = "cn.personal-ai-workbench.model-api.v1"
func finish(_ value: [String: Any]) -> Never {
    if let data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]) {
        FileHandle.standardOutput.write(data)
    }
    exit(0)
}
func reason(_ status: OSStatus) -> String {
    if status == errSecAuthFailed || status == errSecUserCanceled { return "AUTH_DENIED" }
    if status == errSecInteractionNotAllowed { return "LOCKED" }
    if status == errSecNotAvailable { return "SERVICE_UNAVAILABLE" }
    return "UNCONFIRMED"
}
let input = FileHandle.standardInput.readDataToEndOfFile()
guard input.count <= 32768,
      let object = try? JSONSerialization.jsonObject(with: input) as? [String: Any],
      let action = object["action"] as? String,
      let account = object["account"] as? String,
      account.range(of: "^(anthropic|openai)/(main|(backup|expected)-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$", options: .regularExpression) != nil,
      Set(object.keys).isSubset(of: Set(["action", "account", "secret"])) else {
    finish(["ok": false, "code": "INVALID_INPUT"])
}
var query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
    kSecAttrService as String: service, kSecAttrAccount as String: account]
switch action {
case "has":
    query[kSecReturnAttributes as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne
    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)
    finish(["ok": status == errSecSuccess || status == errSecItemNotFound,
        "exists": status == errSecSuccess, "code": status == errSecSuccess || status == errSecItemNotFound ? "" : "KEYCHAIN_UNAVAILABLE", "reasonCode": reason(status)])
case "get":
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne
    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)
    guard status == errSecSuccess, let bytes = item as? Data, bytes.count <= 4096,
          let secret = String(data: bytes, encoding: .utf8) else {
        finish(["ok": false, "code": status == errSecItemNotFound ? "CREDENTIAL_MISSING" : "KEYCHAIN_UNAVAILABLE", "reasonCode": reason(status)])
    }
    finish(["ok": true, "secret": secret])
case "set", "create":
    guard let secret = object["secret"] as? String, let bytes = secret.data(using: .utf8),
          bytes.count >= 8, bytes.count <= 4096, !secret.contains("\n"), !secret.contains("\r"), !secret.contains("\0") else {
        finish(["ok": false, "code": "INVALID_CREDENTIAL"])
    }
    let change: [String: Any] = [kSecValueData as String: bytes,
        kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
    var status: OSStatus
    if action == "create" {
        query.merge(change) { _, new in new }
        status = SecItemAdd(query as CFDictionary, nil)
    } else {
        status = SecItemUpdate(query as CFDictionary, change as CFDictionary)
        if status == errSecItemNotFound {
            query.merge(change) { _, new in new }
            status = SecItemAdd(query as CFDictionary, nil)
        }
    }
    finish(["ok": status == errSecSuccess, "code": status == errSecDuplicateItem ? "BACKUP_CONFLICT" : status == errSecSuccess ? "" : "KEYCHAIN_UNAVAILABLE", "reasonCode": reason(status)])
case "delete":
    let status = SecItemDelete(query as CFDictionary)
    finish(["ok": status == errSecSuccess || status == errSecItemNotFound,
        "code": status == errSecSuccess || status == errSecItemNotFound ? "" : "KEYCHAIN_UNAVAILABLE", "reasonCode": reason(status)])
default: finish(["ok": false, "code": "INVALID_ACTION"])
}
