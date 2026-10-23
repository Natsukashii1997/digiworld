import {isDaemonCredentialValue} from './daemon-environment.mjs';
// 具体LaunchAgent候选。导入无真实动作；开发测试生成plist并注入exec。
import { execFile as nativeExecFile } from "node:child_process";
import { isAbsolute, join, resolve } from "node:path";
export const WORKBENCH_LABEL = "cn.personal-ai-workbench.server";
const fail = message => { throw Object.assign(new Error(message), { code: "DAEMON_UNSAFE" }); };
const path = p => {
  if (typeof p !== "string" || !isAbsolute(p) || resolve(p) !== p || /[\x00-\x1f\x7f]/.test(p)) fail("常驻路径无效");
  return p;
};
const xml = value => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const string = value => "<string>" + xml(value) + "</string>";
export function createLaunchAgentPlan({ verifiedNodePath, verifiedProjectRoot, verifiedDataDirectory, verifiedLogDirectory, verifiedHome, uid, selectedEnvironment = {} }) {
  const node = path(verifiedNodePath), project = path(verifiedProjectRoot), data = path(verifiedDataDirectory), logs = path(verifiedLogDirectory), home = path(verifiedHome);
  if (!Number.isSafeInteger(uid) || uid < 1 || uid > 0xffffffff) fail("常驻只允许真实用户域");
  if (!selectedEnvironment || typeof selectedEnvironment !== "object" || Array.isArray(selectedEnvironment) || Object.keys(selectedEnvironment).some(name => !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(name) || /KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH|COOKIE|SESSION|PRIVATE|SIGNATURE|PASSWD/i.test(name) || ["PORT", "WORKBENCH_DATA_DIR"].includes(name) || typeof selectedEnvironment[name] !== "string" || isDaemonCredentialValue(selectedEnvironment[name]))) fail("凭据或未知环境变量禁止写入常驻配置");
  const arguments_ = [node, join(project, "server/index.mjs")];
  const plistPath = join(home, "Library/LaunchAgents", WORKBENCH_LABEL + ".plist");
  const plist = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0"><dict>',
    "<key>Label</key>" + string(WORKBENCH_LABEL),
    "<key>ProgramArguments</key><array>" + arguments_.map(string).join("") + "</array>",
    "<key>WorkingDirectory</key>" + string(project),
    "<key>EnvironmentVariables</key><dict><key>WORKBENCH_DATA_DIR</key>" + string(data)
      + "<key>PORT</key><string>5178</string>"
      + Object.keys(selectedEnvironment).sort().map(name => "<key>" + xml(name) + "</key>" + string(selectedEnvironment[name])).join("") + "</dict>",
    "<key>RunAtLoad</key><true/><key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>",
    "<key>ThrottleInterval</key><integer>30</integer>",
    "<key>StandardOutPath</key>" + string(join(logs, "server.stdout.log")),
    "<key>StandardErrorPath</key>" + string(join(logs, "server.stderr.log")),
    "</dict></plist>",
  ].join("\n");
  return { label: WORKBENCH_LABEL, plistPath, plist, programArguments: arguments_, uid, port: 5178,
    launchDomain: "gui/" + uid, serviceTarget: "gui/" + uid + "/" + WORKBENCH_LABEL };
}
export function execLaunchctl(args, { execFile = nativeExecFile } = {}) {
  return new Promise((done, reject) => {
    execFile("/bin/launchctl", args, { shell: false, encoding: "utf8", timeout: 5000, maxBuffer: 64 * 1024,
      env: { PATH: "/usr/bin:/bin", LANG: "C", LC_ALL: "C" } }, (error, stdout) => {
      if (error) { reject(Object.assign(new Error("launchd操作无法核验"), { exitCode: error.code })); return; }
      done(stdout);
    });
  });
}
export function createLaunchAgentAdapter({ run = execLaunchctl, inspectPlist, prepared, writePlist,
  restorePlist, removePlist, recordResult, portOccupied, inspectBinding, assertEnabled }) {
  async function status(plan) {
    const installed = await inspectPlist(plan.plistPath);
    let loaded = null, pid = null;
    try {
      const output = await run(["print", plan.serviceTarget]);
      if (!output.includes(WORKBENCH_LABEL)) return { installed: Boolean(installed), loaded: null, healthy: null, reason: "launchd身份无法核验" };
      loaded = true; const match = output.match(/^\s*pid = ([0-9]+)$/m); pid = match ? Number(match[1]) : null;
    } catch (error) {
      // 113必须由真实生产适配器验证为“服务不存在”；其他非0不是不存在。
      if (error.exitCode === 113) loaded = false;
    }
    return { installed: Boolean(installed), installedSha256: installed?.sha256 || "", loaded, pid,
      healthy: null, reason: "健康需工作台当前服务身份与接口另行回读" };
  }
  return {
    status,
    async install({ plan, operationId }) {
      await assertEnabled("daemon"); await inspectBinding(plan);
      const before = await status(plan);
      if (before.loaded === null) fail("当前加载状态未知，先查询");
      const previous = await inspectPlist(plan.plistPath);
      await prepared(operationId, { plan, previous, loadedBefore: before.loaded }); // 原plist备份先落私有journal。
      await writePlist(plan, previous); // 排他创建/精确SHA替换+回读，不能写任意Label。
      if (await portOccupied(5178)) {
        const result = { installed: true, loaded: before.loaded, healthy: null, status: "waiting_for_user_restart",
          reason: "5178已有服务；请用户本人停止旧服务后启动此固定Label，工作台不停止或绕过旧服务" };
        await recordResult(operationId, result); return result;
      }
      try {
        if (!before.loaded) await run(["bootstrap", plan.launchDomain, plan.plistPath]);
        const after = await status(plan); await recordResult(operationId, after); return after;
      } catch { return { status: "unknown", reason: "安装加载结果未知，先查询，不重复bootstrap" }; }
    },
    async uninstall({ plan, operationId, expectedPlistSha256 }) {
      await assertEnabled("daemon"); await inspectBinding(plan);
      const before = await status(plan), file = await inspectPlist(plan.plistPath);
      if (before.loaded === null || !file || file.sha256 !== expectedPlistSha256) fail("原plist或加载身份不一致");
      await prepared(operationId, { plan, previous: file, loadedBefore: before.loaded });
      try {
        if (before.loaded) await run(["bootout", plan.serviceTarget]);
        const after = await status(plan);
        if (after.loaded !== false) return { status: "unknown", reason: "未确认卸载，保留plist" };
        await removePlist(plan.plistPath, expectedPlistSha256); const final = await status(plan);
        if (final.installed || final.loaded !== false) return { status: "unknown", reason: "卸载回读不一致" };
        await recordResult(operationId, { ...final, status: "verified" }); return { ...final, status: "verified" };
      } catch { return { status: "unknown", reason: "卸载结果未知，先查询" }; }
    },
    async rollback({ record, operationId }) {
      await assertEnabled("daemon"); await inspectBinding(record.plan);
      // 恢复之前必须由restorePlist检查本操作afterSHA，禁止覆盖外部修改。
      await restorePlist(record.plan, record.previous);
      const current = await status(record.plan);
      if (current.loaded === null) return { status: "unknown", reason: "加载状态未知" };
      if (record.loadedBefore && !current.loaded) {
        if (await portOccupied(5178)) return { status: "waiting_for_user_restart", reason: "等待用户本人处理5178后恢复原加载状态" };
        await run(["bootstrap", record.plan.launchDomain, record.plan.plistPath]);
      } else if (!record.loadedBefore && current.loaded) await run(["bootout", record.plan.serviceTarget]);
      const final = await status(record.plan);
      if (final.loaded !== record.loadedBefore) return { status: "unknown", reason: "回滚加载状态未核验" };
      await recordResult(operationId, { ...final, status: "rolled_back" }); return { ...final, status: "rolled_back" };
    },
  };
}
