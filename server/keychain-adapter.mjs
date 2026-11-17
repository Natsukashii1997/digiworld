// runner 以固定 Swift helper、JSON stdin 调用；不在 argv/data/日志放凭据。
const reasonMessages={PLATFORM_UNSUPPORTED:'此设备不支持 macOS 钥匙串',HELPER_UNAVAILABLE:'钥匙串辅助程序不存在或不可访问',HELPER_UNVERIFIED:'钥匙串辅助程序身份无法核验',SWIFT_UNAVAILABLE:'系统 Swift 不可用',HELPER_TIMEOUT:'钥匙串辅助程序超时或输出超限',HELPER_FAILED:'钥匙串辅助程序未成功执行',HELPER_READBACK:'钥匙串辅助程序回读无效',AUTH_DENIED:'钥匙串授权被拒绝或取消',LOCKED:'钥匙串锁定或当前会话不能交互',SERVICE_UNAVAILABLE:'系统钥匙串服务不可用',UNCONFIRMED:'钥匙串操作未确认'};
export const keychainUnavailableMessage=reason=>'钥匙串不可用：'+(Object.hasOwn(reasonMessages,reason)?reasonMessages[reason]:reasonMessages.UNCONFIRMED)+'；未保存到明文，请先处理钥匙串后重新预览';
const unavailable=reason=>Object.assign(new Error(keychainUnavailableMessage(reason)),{code:'KEYCHAIN_UNAVAILABLE',reasonCode:Object.hasOwn(reasonMessages,reason)?reason:'UNCONFIRMED'});
export function createKeychainAdapter({ runHelper }) {
  const validAccount = account => /^(anthropic|openai)\/(main|(?:backup|expected)-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/.test(account || "");
  async function invoke(action, account, secret, guard) {
    if (!validAccount(account)) throw Object.assign(new Error("钥匙串引用无效"), { code: "INVALID_CREDENTIAL_REF" });
    const payload = { action, account, ...(secret === undefined ? {} : { secret }) };
    let result;
    if(["set","create","delete"].includes(action)&&guard)await guard();
    try { result = await runHelper(payload); } catch (e) { throw unavailable(e?.reasonCode); }
    if (!result || result.ok !== true) { if (["CREDENTIAL_MISSING", "BACKUP_CONFLICT", "INVALID_CREDENTIAL"].includes(result?.code)) throw Object.assign(new Error("钥匙串操作未确认"), {code:result.code}); throw unavailable(result?.reasonCode); }
    if (action === "has" && typeof result.exists !== "boolean") throw unavailable("HELPER_READBACK");
    return result;
  }
  return {
    async has(account) { return (await invoke("has", account)).exists === true; },
    async get(account) { const value = (await invoke("get", account)).secret; if (typeof value !== "string" || value.length < 8 || value.length > 4096) throw new Error("凭据回读无效"); return value; },
    async set(account, secret, {guard}={}) { await invoke("set", account, secret,guard); if ((await invoke("get", account)).secret !== secret) throw new Error("凭据回读不一致"); return { saved: true, hasCredential: true }; },
    async prepareExpected(provider, operationId, secret, {guard}={}) {
      // 先在钥匙串排他保存预期新值；HTTP/普通日志只持久这个引用，不存secret或secret hash。
      const ref = provider + "/expected-" + operationId;
      await invoke("create", ref, secret,guard);
      if (await this.get(ref) !== secret) throw new Error("预期凭据回读失败");
      return { expectedCredentialRef: ref };
    },
    async applyExpected(provider, expectedCredentialRef, {guard}={}) {
      if (!expectedCredentialRef?.startsWith(provider + "/expected-")) throw new Error("预期引用不匹配提供方");
      return await this.set(provider + "/main", await this.get(expectedCredentialRef),{guard});
    },
    async createBackup(provider, operationId, {guard}={}) {
      const main = provider + "/main", ref = provider + "/backup-" + operationId;
      const exists = await this.has(main);
      if (!exists) return { existed: false, credentialBackupRef: "" };
      const secret = await this.get(main); await invoke("create", ref, secret,guard);
      if (await this.get(ref) !== secret) throw new Error("钥匙串备份回读失败");
      return { existed: true, credentialBackupRef: ref };
    },
    async rollback(provider, backup, expectedCredentialRef, {guard}={}) {
      // 重开后从钥匙串中的expected引用回读，新值不依赖旧进程内存。
      if (!expectedCredentialRef?.startsWith(provider + "/expected-")
          || backup.existed && backup.credentialBackupRef !== expectedCredentialRef.replace("/expected-", "/backup-"))
        throw new Error("回滚引用不属于同一操作");
      const expectedCurrentSecret = await this.get(expectedCredentialRef);
      const main = provider + "/main", exists = await this.has(main);
      if (!exists || await this.get(main) !== expectedCurrentSecret) throw new Error("凭据已变化，不自动回滚");
      const guardMain = async () => {
        // 通用授权guard可能await意向/设置，返回后重核main，不能覆盖该await内发生的外部修改。
        if (guard) await guard();
        if (await this.get(expectedCredentialRef) !== expectedCurrentSecret || !await this.has(main)
          || await this.get(main) !== expectedCurrentSecret) throw new Error("凭据已变化，不自动回滚");
      };
      if (backup.existed) { const old = await this.get(backup.credentialBackupRef); await this.set(main, old,{guard:guardMain}); }
      else { await invoke("delete", main,undefined,guardMain); if (await this.has(main)) throw new Error("凭据删除回读失败"); }
      return { rolledBack: true, hasCredential: backup.existed };
    },
  };
}
