import filesystem from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import {
  join,
  resolve,
  isAbsolute,
  dirname,
  basename,
  relative,
} from "node:path";
import { digest, failure } from "./repository.mjs";

export async function inspectAgentInventory(
  agentId,
  {
    home = homedir(),
    environment = process.env,
    filesystem: fs = filesystem,
  } = {},
) {
  if (!["codex", "hermes"].includes(agentId))
    throw failure("此 Agent 尚不支持目录发现");
  const homes = [],
    errors = [],
    candidates = new Map();
  let truncated = false,
    enumerated = 0;
  const defaultRoot = join(home, `.${agentId}`),
    profileRoots = new Set([defaultRoot]);
  function addCandidate(path, label, source) {
    path = resolve(path);
    const existing = candidates.get(path);
    if (existing) {
      if (!existing.source.includes(source)) existing.source += ` · ${source}`;
    } else candidates.set(path, { path, label, source });
  }
  addCandidate(defaultRoot, "默认 Home", "默认目录");
  const envKey = agentId === "codex" ? "CODEX_HOME" : "HERMES_HOME";
  const raw = environment[envKey];
  if (raw !== undefined && raw !== "") {
    const path = typeof raw === "string" ? raw.trim() : "";
    const blocked = new Set([
      "/",
      "/Users",
      "/Applications",
      "/System",
      "/Library",
      "/Volumes",
      "/etc",
      "/private",
      "/var",
      "/tmp",
      "/usr",
      "/opt",
      "/bin",
      "/sbin",
      "/private/etc",
      "/private/var",
      "/private/tmp",
      resolve(home),
      join(home, "Documents"),
      join(home, "Desktop"),
      join(home, "Downloads"),
    ]);
    let ancestor = resolve(home);
    while (dirname(ancestor) !== ancestor) {
      ancestor = dirname(ancestor);
      blocked.add(ancestor);
    }
    if (
      !path ||
      !isAbsolute(path) ||
      path.length > 2000 ||
      /[\x00-\x1f\x7f]/.test(path) ||
      blocked.has(resolve(path))
    ) {
      errors.push({
        path: envKey,
        message: `${envKey} 必须是绝对、非宽泛的专用目录，未扫描此候选`,
      });
    } else {
      addCandidate(path, "环境 Home", `服务进程 ${envKey}`);
      if (agentId === "hermes") {
        const value = resolve(path),
          withinDefault = relative(defaultRoot, value);
        const root =
          !withinDefault.startsWith("..") && !isAbsolute(withinDefault)
            ? defaultRoot
            : basename(dirname(value)) === "profiles"
              ? dirname(dirname(value))
              : value;
        if (blocked.has(root))
          errors.push({
            path: envKey,
            message: `${envKey} 对应 Profile 根过于宽泛，未枚举`,
          });
        else profileRoots.add(root);
      }
    }
  }
  if (agentId === "codex")
    addCandidate(join(home, ".agents"), "共享用户资产", "用户共享");
  async function inspectMetadata(path, directory = true) {
    try {
      const chain = [];
      for (let cursor = path; ; cursor = dirname(cursor)) {
        chain.unshift(cursor);
        if (dirname(cursor) === cursor) break;
      }
      const identities = [];
      for (const cursor of chain) {
        const info = await fs.lstat(cursor);
        if (info.isSymbolicLink())
          return {
            status: "blocked",
            errors: [{ path, message: "路径或祖先为符号链接，未跟随" }],
          };
        if ((directory || cursor !== path) && !info.isDirectory())
          return {
            status: "blocked",
            errors: [{ path, message: "路径或祖先不是普通目录" }],
          };
        identities.push(`${info.dev}:${info.ino}`);
      }
      if (directory) await fs.access(path, constants.R_OK | constants.X_OK);
      return { status: "present", errors: [], identity: identities.join("/") };
    } catch (error) {
      if (error.code === "ENOENT") return { status: "missing", errors: [] };
      return {
        status: "blocked",
        errors: [
          {
            path,
            message: ["EACCES", "EPERM"].includes(error.code)
              ? "无目录读取权限"
              : "目录元数据不可访问",
          },
        ],
      };
    }
  }
  if (agentId === "hermes") {
    for (const path of candidates.keys()) {
      if (basename(dirname(path)) !== "profiles") continue;
      const name = basename(path),
        deleted = await inspectMetadata(
          join(dirname(path), ".deleted", name),
          false,
        );
      if (
        !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(name) ||
        name === "default" ||
        deleted.status !== "missing"
      ) {
        candidates.delete(path);
        errors.push({
          path,
          message:
            "环境 Profile 名称无效、已删除或删除标记无法核验，未列入候选",
        });
      }
    }
    const profilePaths = new Set(
      [...candidates.keys()].filter(
        (path) => basename(dirname(path)) === "profiles",
      ),
    );
    for (const root of profileRoots) {
      if (truncated) break;
      const profileRoot = join(root, "profiles"),
        rootState = await inspectMetadata(profileRoot);
      errors.push(...rootState.errors);
      if (rootState.status !== "present") continue;
      try {
        const entries = await fs.opendir(profileRoot);
        const openedState = await inspectMetadata(profileRoot);
        if (
          openedState.status !== "present" ||
          openedState.identity !== rootState.identity
        ) {
          await entries.close();
          errors.push({
            path: profileRoot,
            message: "Profile 目录或祖先发生变化，未枚举",
          });
          continue;
        }
        const discovered = [];
        for await (const entry of entries) {
          if (++enumerated > 1000) {
            truncated = true;
            errors.push({
              path: profileRoot,
              message: "Profile 枚举项超过 1000，结果不完整",
            });
            break;
          }
          if (
            !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(entry.name) ||
            entry.name === "default" ||
            (!entry.isDirectory() && !entry.isSymbolicLink())
          )
            continue;
          const path = join(profileRoot, entry.name);
          const deleted = await inspectMetadata(
            join(profileRoot, ".deleted", entry.name),
            false,
          );
          if (deleted.status === "present") {
            candidates.delete(path);
            continue;
          }
          if (deleted.status === "blocked") {
            errors.push({
              path,
              message: "无法核验 Profile 删除标记，未列入候选",
            });
            candidates.delete(path);
            continue;
          }
          if (!profilePaths.has(path) && profilePaths.size >= 100) {
            truncated = true;
            errors.push({
              path: profileRoot,
              message: "Profile 超过 100 项，结果不完整",
            });
            break;
          }
          profilePaths.add(path);
          discovered.push({ path, name: entry.name });
        }
        const finalState = await inspectMetadata(profileRoot);
        if (
          finalState.status !== "present" ||
          finalState.identity !== rootState.identity
        ) {
          errors.push({
            path: profileRoot,
            message: "Profile 枚举期间目录发生变化，结果已丢弃",
          });
          continue;
        }
        for (const { path, name } of discovered)
          addCandidate(path, `Profile · ${name}`, "Profile 目录");
      } catch (error) {
        errors.push({
          path: profileRoot,
          message: ["EACCES", "EPERM"].includes(error.code)
            ? "无 Profile 枚举权限"
            : "Profile 枚举失败",
        });
      }
    }
  }
  for (const { path, label, source } of candidates.values()) {
    const directory = await inspectMetadata(path);
    const skillPath = join(path, "skills");
    const skill =
      directory.status === "present"
        ? await inspectMetadata(skillPath)
        : directory;
    homes.push({
      id: `agent-home-${digest(`${agentId}:${path}`).slice(0, 24)}`,
      label,
      path,
      source,
      status: directory.status,
      ...(directory.identity ? { identity: digest(directory.identity) } : {}),
      skills: [
        {
          path: skillPath,
          label: "Skills",
          status: skill.status,
          ...(skill.identity ? { identity: digest(skill.identity) } : {}),
          scope: source,
        },
      ],
      errors: [
        ...directory.errors,
        ...(directory.status === "present" ? skill.errors : []),
      ],
    });
  }
  return { agentId, at: new Date().toISOString(), homes, errors, truncated };
}
