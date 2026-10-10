import { lstat, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { digest, failure } from "./repository.mjs";

export const manualProjectId = (path) => `manual-${digest(path).slice(0, 24)}`;

export function excludedProject(project, exclusions = []) {
  const keys = new Set(exclusions);
  if (keys.has(`id:${project.id}`)) return true;
  if ((project.aliases || []).some((id) => keys.has(`id:${id}`))) return true;
  if (project.repoKey && keys.has(`repo:${project.repoKey.toLowerCase()}`)) return true;
  return (project.localPaths || []).some((path) =>
    exclusions.some((entry) =>
      entry.startsWith("path:") &&
      (path === entry.slice(5) || path.startsWith(`${entry.slice(5)}/`)),
    ),
  );
}

export function reconcileProjectCatalog(catalog = [], projects = []) {
  return catalog.map((entry) => {
    const exact = projects.find((p) => p.id === entry.projectId);
    if (exact) return entry;
    const matches = projects.filter((p) => (p.aliases || []).includes(entry.projectId));
    if (matches.length !== 1) throw failure("项目身份变化，展示目录需要人工复核", 409);
    return { ...entry, projectId: matches[0].id };
  });
}

async function checkedManualPath(value, roots = []) {
  if (typeof value !== "string" || value.length > 2000 || !value.startsWith("/") || value.includes("\0"))
    throw failure("手工项目需要绝对目录路径");
  const path = resolve(value);
  const documents = join(homedir(), "Documents");
  const homeChild = path.startsWith(`${homedir()}/`) &&
    path.slice(homedir().length + 1).split("/").length === 1 &&
    !["Library", "Applications", "Downloads", "Desktop"].includes(basename(path)) &&
    !basename(path).startsWith(".");
  if (!path.startsWith(`${documents}/`) && !homeChild &&
      !roots.some((root) => path === root || path.startsWith(`${root}/`)))
    throw failure("手工项目只能登记 Documents、已批准扫描根或用户目录下的独立项目目录");
  try {
    const info = await lstat(path);
    if (!info.isDirectory() || info.isSymbolicLink() || await realpath(path) !== path)
      throw failure("手工项目目录必须是真实目录");
  } catch (error) {
    if (error.status) throw error;
    throw failure("手工项目目录不存在或无法读取");
  }
  return path;
}

export async function applyProjectCatalog(repository, input) {
  if (!input || !Number.isSafeInteger(input.revision) || input.revision < 0)
    throw failure("项目整理需要当前主库版本");
  if (input.items !== undefined && !Array.isArray(input.items)) throw failure("项目展示目录格式无效");
  if (input.exclusions !== undefined && !Array.isArray(input.exclusions)) throw failure("项目排除身份格式无效");
  if (input.manualProjects !== undefined && !Array.isArray(input.manualProjects)) throw failure("手工项目格式无效");
  const observed = await repository.read();
  if (!observed) throw failure("请先初始化工作台主库", 409);
  const manual = [];
  for (const item of input.manualProjects || []) {
    if (!item || Object.keys(item).some((key) => !["path", "name"].includes(key)))
      throw failure("手工项目字段无效");
    const path = await checkedManualPath(item.path, observed.connections?.roots || []);
    if (item.name !== undefined && (typeof item.name !== "string" || !item.name.trim() || item.name.length > 120))
      throw failure("手工项目名称无效");
    manual.push({ path, name: item.name?.trim() || basename(path), id: manualProjectId(path) });
  }
  if (new Set(manual.map((p) => p.path)).size !== manual.length)
    throw failure("手工项目目录重复");
  return repository.updateConnections((previous) => {
    const c = previous || {};
    const exclusions = [...new Set([...(c.projectExclusions || []), ...(input.exclusions || [])])];
    if ((c.projects || []).some((project) => project.active && excludedProject(project, exclusions)))
      throw failure("在推进项目需先手动取消在推进，再从项目空间排除");
    const projects = (c.projects || []).filter((p) => !excludedProject(p, exclusions));
    if ((c.contextBindings || []).some((binding) => !projects.some((p) => p.id === binding.projectId)))
      throw failure("目标项目仍有上下文连接，请先解除连接");
    for (const item of manual) {
      if (excludedProject({ id: item.id, repoKey: "", localPaths: [item.path] }, exclusions))
        throw failure("该目录已从项目空间明确排除");
      const owner = projects.find((p) => p.localPaths.includes(item.path));
      if (owner && owner.id !== item.id) throw failure("该目录已属于另一个项目，请直接整理现有项目");
      if (!owner) projects.push({
        id: item.id,
        name: item.name,
        kind: "手工",
        repoKey: "",
        localPaths: [item.path],
        manual: true,
        seenThisScan: false,
      });
    }
    const items = input.items === undefined
      ? (c.projectCatalog || []).filter((entry) => projects.some((p) => p.id === entry.projectId))
      : input.items;
    if (items.some((item) => item?.view !== "main" &&
      projects.some((project) => project.id === item.projectId && project.active)))
      throw failure("在推进项目请先取消在推进，再移出主项目");
    return { ...c, projects, projectCatalog: items, projectExclusions: exclusions };
  }, { expectedRevision: input.revision });
}
