import filesystem from "node:fs/promises";
import { constants } from "node:fs";
import { execFile } from "node:child_process";
import { basename, dirname, join, resolve, isAbsolute } from "node:path";
import { digest, failure } from "./repository.mjs";

const LIMIT = 64 * 1024;
const versionText = (value) =>
  typeof value === "string" && /^[0-9][a-zA-Z0-9.+_-]{0,79}$/.test(value);
const unknown = (message = "未发现可核验的版本声明") => ({
  status: "unknown",
  value: "",
  source: "",
  evidencePath: "",
  message,
});
function blocked(message, evidencePath = "") {
  return { ...unknown(message), status: "blocked", evidencePath };
}
function issue(message) {
  return Object.assign(new Error(message), { code: "UNSAFE_METADATA" });
}
const identity = (info) => `${info.dev}:${info.ino}`;
async function checkPath(fs, path, directory = false) {
  const chain = [];
  for (let cursor = path; ; cursor = dirname(cursor)) {
    chain.unshift(cursor);
    if (dirname(cursor) === cursor) break;
  }
  const identities = [];
  for (const cursor of chain) {
    const info = await fs.lstat(cursor);
    if (info.isSymbolicLink()) throw issue("路径或祖先为符号链接，未读取");
    if (cursor !== path || directory) {
      if (!info.isDirectory()) throw issue("路径或祖先不是普通目录");
    } else if (!info.isFile() || info.nlink !== 1) {
      throw issue("仅支持没有硬链接的普通文件");
    }
    identities.push(identity(info));
  }
  return identities.join("/");
}
async function readMetadata(fs, path) {
  const before = await checkPath(fs, path);
  const handle = await fs.open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const initial = await handle.stat();
    if (!initial.isFile() || initial.nlink !== 1 || initial.size > LIMIT)
      throw issue("版本元数据不是安全的小型普通文件");
    if (
      !before.endsWith(`/${identity(initial)}`) ||
      before !== (await checkPath(fs, path))
    )
      throw issue("版本文件已变化");
    const buffer = Buffer.alloc(LIMIT + 1);
    let used = 0;
    while (used < buffer.length) {
      const { bytesRead } = await handle.read(
        buffer,
        used,
        buffer.length - used,
        used,
      );
      if (!bytesRead) break;
      used += bytesRead;
    }
    const after = await handle.stat();
    if (
      used > LIMIT ||
      after.nlink !== 1 ||
      initial.size !== after.size ||
      initial.mtimeMs !== after.mtimeMs ||
      initial.ctimeMs !== after.ctimeMs ||
      before !== (await checkPath(fs, path))
    )
      throw issue("版本元数据过大或读取期间发生变化");
    return buffer.subarray(0, used);
  } finally {
    await handle.close();
  }
}
async function programIdentity(fs, path, kind) {
  const chain = await checkPath(fs, path, kind === "App");
  const info = await fs.lstat(path);
  if (kind === "App") {
    if (!info.isDirectory() || !chain.endsWith(`/${identity(info)}`))
      throw issue("应用目录在核验期间发生变化");
    return digest(chain);
  }
  if (
    !info.isFile() ||
    info.nlink !== 1 ||
    !chain.endsWith(`/${identity(info)}`)
  )
    throw issue("程序入口在核验期间发生变化");
  return digest(
    `${chain}:${info.size}:${info.mtimeMs}:${info.ctimeMs}:${info.mode}`,
  );
}
function known(value, source, evidencePath) {
  if (!versionText(value)) throw issue("版本声明格式无效");
  return {
    status: "known",
    value,
    source,
    evidencePath,
    message: "仅为安装元数据，未验证运行采用",
  };
}
async function codexVersion(fs, path) {
  if (
    !["codex", "codex.js"].includes(basename(path)) ||
    basename(dirname(path)) !== "bin"
  )
    return unknown();
  const root = dirname(dirname(path));
  const evidencePath = join(root, "codex-package.json");
  try {
    const data = JSON.parse(
      (await readMetadata(fs, evidencePath)).toString("utf8"),
    );
    if (
      data.layoutVersion !== 1 ||
      data.variant !== "codex" ||
      data.entrypoint !== "bin/codex" ||
      resolve(root, data.entrypoint) !== path
    )
      throw issue("安装包身份或程序入口不匹配");
    return known(data.version, "安装包声明", evidencePath);
  } catch (error) {
    if (error.code !== "ENOENT")
      return blocked("安装包版本声明无法核验", evidencePath);
  }
  const packagePath = join(root, "package.json");
  try {
    const data = JSON.parse(
      (await readMetadata(fs, packagePath)).toString("utf8"),
    );
    const entrypoint =
      typeof data.bin === "string" ? data.bin : data.bin?.codex;
    if (
      data.name !== "@openai/codex" ||
      typeof entrypoint !== "string" ||
      !/^(?:\.\/)?bin\/codex(?:\.js)?$/.test(entrypoint) ||
      resolve(root, entrypoint) !== path
    )
      throw issue("npm 包身份或程序入口不匹配");
    return known(data.version, "npm 包声明", packagePath);
  } catch (error) {
    return error.code === "ENOENT"
      ? unknown()
      : blocked("npm 版本声明无法核验", packagePath);
  }
}

function parsePlist(bytes) {
  return new Promise((resolve, reject) => {
    const child = execFile(
      "/usr/bin/plutil",
      ["-convert", "json", "-o", "-", "--", "-"],
      { timeout: 2000, maxBuffer: 256 * 1024 },
      (error, stdout) => {
        if (error) return reject(issue("App 元数据解析失败"));
        try {
          resolve(JSON.parse(stdout));
        } catch {
          reject(issue("App 元数据格式无效"));
        }
      },
    );
    child.stdin.on("error", () => {});
    child.stdin.end(bytes);
  });
}
export async function inspectAppIdentity(
  path,
  { filesystem: fs = filesystem, plistParser = parsePlist } = {},
) {
  const evidencePath = join(path, "Contents/Info.plist");
  try {
    const data = await plistParser(await readMetadata(fs, evidencePath));
    if (
      !data ||
      typeof data.CFBundleIdentifier !== "string" ||
      !/^[a-zA-Z0-9.-]{1,150}$/.test(data.CFBundleIdentifier)
    )
      throw issue("App 身份无效");
    return {
      status: "present",
      identifier: data.CFBundleIdentifier,
      value: data.CFBundleShortVersionString,
      evidencePath,
    };
  } catch (error) {
    return {
      status: error.code === "ENOENT" ? "missing" : "blocked",
      identifier: "",
      evidencePath,
    };
  }
}
async function appVersion(path, options, source) {
  const identity = await inspectAppIdentity(path, options);
  if (identity.status === "missing")
    return { identityVerified: false, version: unknown("App 身份声明未找到") };
  if (
    identity.status !== "present" ||
    identity.identifier !== "com.openai.codex"
  )
    return {
      identityVerified: false,
      version: blocked("App 身份或版本声明无法核验", identity.evidencePath),
    };
  try {
    return {
      identityVerified: true,
      version: known(identity.value, source, identity.evidencePath),
    };
  } catch {
    return {
      identityVerified: true,
      version: blocked("App 版本格式无效", identity.evidencePath),
    };
  }
}

async function entries(fs, path, limit) {
  const before = await checkPath(fs, path, true);
  const directory = await fs.opendir(path);
  try {
    if (before !== (await checkPath(fs, path, true)))
      throw issue("目录枚举前发生变化");
  } catch (error) {
    await directory.close();
    throw error;
  }
  const result = [];
  for await (const entry of directory) {
    if (result.length >= limit) throw issue("版本目录枚举超过上限");
    result.push(entry);
  }
  if (before !== (await checkPath(fs, path, true)))
    throw issue("目录枚举期间发生变化");
  return result;
}
async function hermesVersion(fs, path) {
  if (basename(path) !== "hermes" || basename(dirname(path)) !== "bin")
    return unknown();
  const lib = join(dirname(dirname(path)), "lib");
  let candidates = [];
  try {
    const versions = (await entries(fs, lib, 64)).filter((entry) =>
      /^python\d+\.\d+$/.test(entry.name),
    );
    if (versions.length > 8) throw issue("Python 安装目录过多");
    for (const version of versions) {
      const packages = join(lib, version.name, "site-packages");
      for (const entry of await entries(fs, packages, 1000)) {
        if (
          /^hermes[-_]agent-[a-zA-Z0-9.+_-]{1,80}\.dist-info$/.test(entry.name)
        )
          candidates.push(join(packages, entry.name));
      }
    }
    if (!candidates.length) return unknown();
    if (candidates.length !== 1)
      throw issue("发现多份 Hermes 包声明，无法确定对应版本");
    const evidencePath = join(candidates[0], "METADATA");
    const header = (await readMetadata(fs, evidencePath))
      .toString("utf8")
      .split(/\r?\n\r?\n/, 1)[0];
    const names = [...header.matchAll(/^Name: (.+)\r?$/gm)];
    const values = [...header.matchAll(/^Version: (.+)\r?$/gm)];
    if (
      names.length !== 1 ||
      names[0][1]
        .trim()
        .toLowerCase()
        .replace(/[-_.]+/g, "-") !== "hermes-agent" ||
      values.length !== 1
    )
      throw issue("Hermes 包身份或版本声明不唯一");
    const points = (
      await readMetadata(fs, join(candidates[0], "entry_points.txt"))
    ).toString("utf8");
    let section = "",
      sections = 0;
    const hermes = [];
    for (const line of points.split(/\r?\n/)) {
      const name = line.trim().match(/^\[([^\]]+)\]$/);
      if (name) {
        section = name[1];
        if (section === "console_scripts") sections++;
      } else if (
        section === "console_scripts" &&
        /^hermes\s*=/.test(line.trim())
      )
        hermes.push(line.trim());
    }
    if (
      sections !== 1 ||
      hermes.length !== 1 ||
      !/^hermes\s*=\s*hermes_cli\.main:main$/.test(hermes[0])
    )
      throw issue("Hermes 命令入口声明不匹配");
    return known(values[0][1].trim(), "Python 包声明", evidencePath);
  } catch (error) {
    if (error.code === "ENOENT" && !candidates.length) return unknown();
    return blocked(
      error.code === "UNSAFE_METADATA"
        ? error.message
        : "Hermes 包声明无法安全核验",
      candidates.length === 1 ? join(candidates[0], "METADATA") : lib,
    );
  }
}

export async function inspectAgentPrograms(
  agentId,
  programs,
  { filesystem: fs = filesystem, plistParser = parsePlist } = {},
) {
  if (
    !["codex", "hermes"].includes(agentId) ||
    !Array.isArray(programs) ||
    programs.length > 100
  )
    throw failure("程序检查参数无效");
  const output = [],
    seen = new Set();
  for (const program of programs) {
    const { path, kind } = program || {};
    if (
      typeof path !== "string" ||
      !isAbsolute(path) ||
      path !== resolve(path) ||
      path.length > 2000 ||
      /[\x00-\x1f\x7f]/.test(path) ||
      !["App", "CLI"].includes(kind)
    )
      throw failure("程序入口需要已发现的绝对路径");
    const key = `${agentId}:${kind}:${path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const record = {
      id: `agent-program-${digest(key).slice(0, 24)}`,
      path,
      kind,
      status: "present",
      version: unknown(),
    };
    let initialIdentity;
    try {
      initialIdentity = await programIdentity(fs, path, kind);
      await fs.access(
        path,
        kind === "App" ? constants.R_OK | constants.X_OK : constants.X_OK,
      );
    } catch (error) {
      record.status = error.code === "ENOENT" ? "missing" : "blocked";
      record.version =
        record.status === "missing"
          ? unknown("程序入口已不存在")
          : blocked("程序入口无法安全核验");
      output.push(record);
      continue;
    }
    if (agentId === "codex" && kind === "CLI")
      record.version = await codexVersion(fs, path);
    if (agentId === "hermes" && kind === "CLI")
      record.version = await hermesVersion(fs, path);
    if (agentId === "codex" && kind === "App") {
      const inspected = await appVersion(
        path,
        { filesystem: fs, plistParser },
        "App 声明",
      );
      record.version = inspected.version;
      if (!inspected.identityVerified) record.status = "blocked";
    }
    if (
      agentId === "codex" &&
      kind === "CLI" &&
      basename(path) === "codex" &&
      basename(dirname(path)) === "Resources" &&
      basename(dirname(dirname(path))) === "Contents" &&
      dirname(dirname(dirname(path))).endsWith(".app")
    ) {
      const inspected = await appVersion(
        dirname(dirname(dirname(path))),
        { filesystem: fs, plistParser },
        "所属 App 声明",
      );
      record.containerVersion = inspected.version;
    }
    try {
      if (initialIdentity !== (await programIdentity(fs, path, kind)))
        throw issue("程序入口发生变化");
      if (record.status === "present") record.identity = initialIdentity;
    } catch {
      record.status = "blocked";
      record.version = blocked("程序入口在检查期间发生变化，请重试");
      delete record.containerVersion;
    }
    output.push(record);
  }
  return output;
}
