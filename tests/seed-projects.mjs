// 项目扫描写接口已下线（#71），名册只读。夹具改为直接往隔离主库登记合成项目：
// 只扫描传入的临时目录（或用传入的假扫描结果），归并规则沿用扫描器本身，不经过 HTTP。
import { scanLocalProjects } from "../server/project-scan.mjs";
import { mergeProjects } from "../server/discovery.mjs";

const offline = { status: "not_connected", items: [], truncated: false, login: "", message: "", at: "" };

export async function seedProjects(repository, { roots, scanLocal = scanLocalProjects, remote = offline } = {}) {
  const local = await scanLocal(roots, {});
  return repository.updateConnections((c) => {
    const base = c || {
      roots, projects: [], agents: [],
      github: { status: "not_connected", login: "", message: "", at: "" },
      projectScannedAt: "", agentScannedAt: "", errors: [], truncated: false,
    };
    const connected = remote.status === "connected";
    return {
      ...base,
      roots,
      projects: mergeProjects(base.projects, local.items, connected ? remote.items : [], {
        protectedIds: (base.contextBindings || []).map((b) => b.projectId),
        locations: local.locations || [],
        at: local.at,
        remoteComplete: connected && !remote.truncated,
      }),
      projectScannedAt: local.at,
      errors: local.errors || [],
      truncated: !!(local.truncated || remote.truncated),
      github: { status: remote.status, login: remote.login || base.github.login, message: remote.message || "", at: remote.at || "" },
    };
  });
}
