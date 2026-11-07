// 项目扫描写接口已下线（#71），全盘扫描与归并也已删除（#73），本机登记改由名册同步派生。
// 这个夹具直接往隔离主库登记合成项目：只看传入临时目录下的第一层子目录，逐个做单目录只读检查（复用 inspectProjectLocation），
// 认得出是项目的就登记成旧扫描同样的记录形状（local-<摘要> ID、目录观测）；也可传入假扫描结果。不经过 HTTP。
import { readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { digest } from "../server/repository.mjs";
import { inspectProjectLocation } from "../server/project-scan.mjs";

async function scanChildren(roots) {
  const at = new Date().toISOString(), items = [];
  for (const root of roots) {
    const children = (await readdir(root, { withFileTypes: true }))
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => join(root, e.name))
      .sort();
    for (const path of children) {
      const o = await inspectProjectLocation(roots, path);
      if (o.status !== "present") continue;
      items.push({
        id: `local-${digest(path).slice(0, 24)}`,
        name: basename(path),
        localPaths: [path],
        repoKey: o.repoKey ?? "",
        kind: o.kind,
        branch: o.branch,
        localSeenAt: o.checkedAt,
        locations: [{
          path, status: o.status, identity: o.identity,
          ...(o.identityVersion === 2 ? { identityVersion: 2 } : {}),
          checkedAt: o.checkedAt, ...(o.message ? { message: o.message } : {}),
        }],
      });
    }
  }
  return { items, at };
}

export async function seedProjects(repository, { roots, scanLocal = scanChildren } = {}) {
  const local = await scanLocal(roots, {});
  return repository.updateConnections((c) => {
    const base = c || {
      roots, projects: [], agents: [],
      github: { status: "not_connected", login: "", message: "", at: "" },
      projectScannedAt: "", agentScannedAt: "", errors: [], truncated: false,
    };
    const fresh = local.items.filter((p) => !base.projects.some((old) => old.id === p.id));
    return { ...base, roots, projects: [...base.projects, ...fresh], projectScannedAt: local.at };
  });
}
