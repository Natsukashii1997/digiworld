import { randomUUID } from "node:crypto";
import { digest, failure } from "./repository.mjs";
import { inspectProjectLocation } from "./project-scan.mjs";

const conflict = (message) => failure(message, 409);
function fields(input, allowed) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => !allowed.includes(key))
  )
    throw failure("项目关联请求无效");
}
function revision(value) {
  if (!Number.isSafeInteger(value) || value < 1) throw failure("主库版本无效");
}
function location(observation, previous, accept) {
  const changed =
    !accept &&
    previous?.identity &&
    observation.identity &&
    previous.identity !== observation.identity;
  const identity = accept
    ? observation.identity
    : previous?.identity || observation.identity;
  const observedIdentity = changed
    ? observation.identity
    : observation.identity === identity
      ? undefined
      : previous?.observedIdentity;
  return {
    path: observation.path,
    status: changed ? "changed" : observation.status,
    ...(identity ? { identity } : {}),
    ...(observedIdentity ? { observedIdentity } : {}),
    checkedAt: observation.checkedAt,
    ...(changed
      ? { message: "目录身份已变化，请重新确认" }
      : observation.message
        ? { message: observation.message }
        : {}),
  };
}

// Relationship edits only: never moves project files or chooses a new Current.
export function createProjectIdentity(
  repository,
  { clock = Date.now, inspect = inspectProjectLocation } = {},
) {
  const previews = new Map();
  async function plan(connections, input) {
    const project = connections?.projects.find((p) => p.id === input.projectId);
    if (!project) throw conflict("项目已变化，请重新扫描并选择");
    const candidate =
      input.mode === "merge"
        ? connections.projects.find((p) => p.id === input.candidateId)
        : undefined;
    if (
      input.mode === "merge" &&
      (!candidate ||
        candidate.id === project.id ||
        !candidate.localPaths.length)
    )
      throw conflict("请选择另一个已有本地目录的项目");
    const bindings = connections.contextBindings || [];
    if (candidate && bindings.some((b) => b.projectId === candidate.id))
      throw conflict(
        "候选项目已有 Current 连接，已保留双方；请先处理其来源连接",
      );
    if (
      candidate &&
      project.repoKey &&
      candidate.repoKey &&
      project.repoKey !== candidate.repoKey
    )
      throw conflict("两个项目的 GitHub 关联不同，不能合并");
    if (input.mode === "accept" && !project.localPaths.includes(input.path))
      throw failure("只能重新确认项目已登记的目录");
    if (input.replacePath && !project.localPaths.includes(input.replacePath))
      throw failure("只能替换当前项目已登记的缺失目录");
    const paths = [
      ...new Set([...project.localPaths, ...(candidate?.localPaths || [])]),
    ];
    if (paths.length > 100)
      throw conflict("合并后目录超过上限，请保留独立项目");
    const evidence = [];
    for (const path of paths)
      evidence.push(await inspect(connections.roots, path));
    const acceptedPaths = candidate?.localPaths || [input.path];
    for (const path of acceptedPaths) {
      const item = evidence.find((p) => p.path === path);
      if (
        item?.status !== "present" ||
        !item.identity ||
        !item.scopeSignature ||
        item.repoKey === undefined
      )
        throw conflict("候选目录或 Git 信息未核实，请重新扫描后再关联");
      const old = (candidate || project).locations?.find(
        (p) => p.path === path,
      );
      if (
        candidate &&
        (old?.status === "changed" ||
          old?.observedIdentity ||
          (old?.identity && old.identity !== item.identity))
      )
        throw conflict("候选目录身份已变化，请先在候选项目中重新确认目录");
      const expected = candidate?.repoKey || project.repoKey || "";
      if (candidate && item.repoKey && item.repoKey !== expected)
        throw conflict("目录的 GitHub 关联已变化，请先重新扫描核对");
      if (
        candidate?.repoKey &&
        !evidence.some(
          (p) =>
            candidate.localPaths.includes(p.path) &&
            p.repoKey === candidate.repoKey,
        )
      )
        throw conflict("候选项目的 GitHub 关联已失效，请先重新扫描核对");
    }
    if (
      input.replacePath &&
      evidence.find((p) => p.path === input.replacePath)?.status !== "missing"
    )
      throw conflict("旧目录尚未证实缺失，不能解除关联");
    const newPaths = paths.filter((path) => path !== input.replacePath);
    const aliases = [
      ...new Set([
        ...(project.aliases || []),
        ...(candidate ? [candidate.id, ...(candidate.aliases || [])] : []),
      ]),
    ].filter((id) => id !== project.id);
    if (aliases.length > 1000)
      throw conflict("历史项目身份超过上限，未修改关联");
    const repoKey = candidate
      ? project.repoKey || candidate.repoKey || ""
      : evidence.find((p) => p.path === input.path).repoKey;
    if (
      !candidate &&
      repoKey !== project.repoKey &&
      evidence.some(
        (p) =>
          p.path !== input.path &&
          (p.status !== "present" ||
            p.repoKey === undefined ||
            (p.repoKey && p.repoKey !== repoKey)),
      )
    )
      throw conflict(
        "其他已关联目录的远端不同或尚未核实，保留原关联；请先核对所有目录，暂不支持拆分项目",
      );
    const merged = {
      ...(candidate || {}),
      ...project,
      repoKey,
      localPaths: newPaths,
      aliases,
      locations: newPaths.map((path) =>
        location(
          evidence.find((p) => p.path === path),
          project.locations?.find((p) => p.path === path) ||
            candidate?.locations?.find((p) => p.path === path),
          acceptedPaths.includes(path),
        ),
      ),
    };
    if (candidate && !project.githubUrl && candidate.githubUrl) {
      for (const key of [
        "githubUrl",
        "githubSeenAt",
        "private",
        "description",
        "language",
        "updatedAt",
      ])
        if (candidate[key] !== undefined) merged[key] = candidate[key];
    }
    if (!candidate) {
      const selected = evidence.find((p) => p.path === input.path);
      for (const key of ["kind", "branch"])
        if (selected[key] !== undefined) merged[key] = selected[key];
      merged.localSeenAt = selected.checkedAt;
      if (repoKey !== project.repoKey) {
        for (const key of [
          "githubUrl",
          "githubSeenAt",
          "private",
          "description",
          "language",
          "updatedAt",
        ])
          delete merged[key];
        if (repoKey) merged.githubUrl = `https://github.com/${repoKey}`;
      }
    }
    const contextNeedsReview = bindings.some((b) => b.projectId === project.id);
    const proof = digest(
      JSON.stringify({
        roots: connections.roots,
        project,
        candidate,
        bindings: bindings.filter((b) =>
          [project.id, candidate?.id].includes(b.projectId),
        ),
        evidence: evidence.map(
          ({ path, status, identity, scopeSignature, repoKey }) => ({
            path,
            status,
            identity,
            scopeSignature,
            repoKey,
          }),
        ),
      }),
    );
    return {
      merged,
      proof,
      public: {
        mode: input.mode,
        project: { id: project.id, name: project.name },
        ...(candidate
          ? { candidate: { id: candidate.id, name: candidate.name } }
          : {}),
        oldPaths: project.localPaths,
        newPaths,
        removedPath: input.replacePath || "",
        oldRepoKey: project.repoKey || "",
        repoKey,
        aliases,
        contextNeedsReview,
        evidence,
      },
    };
  }
  return {
    async preview(input) {
      fields(
        input,
        input?.mode === "merge"
          ? ["mode", "projectId", "candidateId", "replacePath", "revision"]
          : ["mode", "projectId", "path", "revision"],
      );
      if (!["merge", "accept"].includes(input.mode))
        throw failure("关联类型无效");
      revision(input.revision);
      const state = await repository.read();
      if (!state || state.revision !== input.revision)
        throw conflict("主库已变化，请刷新后重新预览");
      const prepared = await plan(state.connections, input);
      if ((await repository.read()).revision !== state.revision)
        throw conflict("预览期间主库已变化，请重新预览");
      const token = randomUUID(),
        expires = clock() + 300000;
      for (const [key, p] of previews)
        if (p.expires <= clock()) previews.delete(key);
      if (previews.size >= 20) previews.delete(previews.keys().next().value);
      previews.set(token, {
        input: structuredClone(input),
        proof: prepared.proof,
        expires,
      });
      return {
        ...prepared.public,
        token,
        revision: state.revision,
        expiresAt: new Date(expires).toISOString(),
      };
    },
    async confirm(input) {
      fields(input, ["token", "revision"]);
      revision(input.revision);
      const prepared = previews.get(input.token);
      if (
        !prepared ||
        prepared.expires <= clock() ||
        prepared.input.revision !== input.revision
      )
        throw conflict("关联预览已失效，请刷新后重新预览");
      const result = await repository.updateConnections(
        async (connections) => {
          const current = await plan(connections, prepared.input);
          if (prepared.expires <= clock() || current.proof !== prepared.proof)
            throw conflict("目录或关联已变化，请重新预览确认");
          const projects = connections.projects
            .filter((p) => p.id !== current.public.candidate?.id)
            .map((p) =>
              p.id === current.merged.id
                ? { ...current.merged, relationVersion: input.token }
                : p,
            );
          for (const p of projects)
            p.identityConflict =
              !!p.repoKey &&
              projects.some(
                (other) => other.id !== p.id && other.repoKey === p.repoKey,
              );
          return { ...connections, projects };
        },
        { expectedRevision: input.revision },
      );
      previews.delete(input.token);
      return result;
    },
  };
}
