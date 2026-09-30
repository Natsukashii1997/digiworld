import { randomUUID } from "node:crypto";
import { failure } from "./repository.mjs";

function shape(input, required, optional = []) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some((k) => ![...required, ...optional].includes(k)) ||
    required.some((k) => !Object.hasOwn(input, k))
  )
    throw failure("目标请求字段无效");
  for (const key of [...required, ...optional]) {
    if (!Object.hasOwn(input, key)) continue;
    const value = input[key];
    if (key === "revision") {
      if (!Number.isSafeInteger(value) || value < 0)
        throw failure("缺少有效的主库版本，请刷新后重试");
    } else if (
      typeof value !== "string" ||
      !value.trim() ||
      value.length > 100 ||
      /[\x00-\x1f\x7f]/.test(value)
    )
      throw failure("目标名称或身份无效");
  }
}

export function createAgentTargets(repository, adapters, clock = Date.now) {
  const previews = new Map();
  async function inspect(agentId) {
    const [discovered, inventory] = await Promise.all([
      adapters.detectAgents(),
      adapters.inspectAgentInventory(agentId),
    ]);
    const agent = discovered.items.find((a) => a.id === agentId);
    const programs = await adapters.inspectAgentPrograms(
      agentId,
      agent?.programs || [],
    );
    const homes = inventory.homes.filter((h) => !h.source.includes("用户共享"));
    const errors = [
      ...(agent?.errors || []),
      ...inventory.errors.map((e) => `${e.path} · ${e.message}`),
      ...(inventory.truncated ? ["目录检查未完成，请刷新后重试"] : []),
      ...(!agent || agent.status === "unknown" ? ["程序入口检查未完成"] : []),
    ];
    return { programs, homes, errors };
  }
  return {
    async options(input) {
      shape(input, ["agentId"]);
      const { agentId } = input;
      if (!["codex", "hermes"].includes(agentId))
        throw failure("此 Agent 暂不支持管理目标");
      const result = await inspect(agentId);
      const state = await repository.read();
      const at = new Date(clock()).toISOString();
      for (const [key, p] of previews)
        if (p.expires <= clock()) previews.delete(key);
      if (previews.size >= 20) previews.delete(previews.keys().next().value);
      const token = randomUUID();
      previews.set(token, { ...result, agentId, expires: clock() + 300000 });
      const targets = (state?.connections?.agentTargets || [])
        .filter((t) => t.agentId === agentId)
        .map((t) => {
          const program = result.programs.find(
            (p) => p.path === t.program.path && p.kind === t.program.kind,
          );
          const home = result.homes.find(
            (h) => h.id === t.home.id && h.path === t.home.path,
          );
          const status = result.errors.length
            ? "unknown"
            : program?.status === "blocked" || home?.status === "blocked"
              ? "blocked"
              : !program || program.status === "missing"
                ? "program_missing"
                : !home || home.status === "missing"
                  ? "home_missing"
                  : "available";
          return { id: t.id, status };
        });
      return {
        ...result,
        token,
        at,
        expiresAt: new Date(clock() + 300000).toISOString(),
        revision: state?.revision,
        targets,
      };
    },
    async save(input) {
      shape(
        input,
        ["token", "label", "programId", "homeId", "revision"],
        ["id"],
      );
      const preview = previews.get(input.token);
      if (!preview || preview.expires <= clock())
        throw failure("目标选项已过期，请刷新后重新确认", 409);
      const program = preview.programs.find(
        (p) => p.id === input.programId && p.status === "present",
      );
      const home = preview.homes.find(
        (h) => h.id === input.homeId && h.status === "present",
      );
      if (preview.errors.length || !program || !home)
        throw failure("所选程序或目录不可用，请刷新后重新选择", 409);
      const current = await inspect(preview.agentId);
      if (
        current.errors.length ||
        !current.programs.some(
          (p) =>
            p.id === program.id &&
            p.path === program.path &&
            p.kind === program.kind &&
            p.identity === program.identity &&
            p.status === "present",
        ) ||
        !current.homes.some(
          (h) =>
            h.id === home.id &&
            h.path === home.path &&
            h.identity === home.identity &&
            h.status === "present",
        )
      )
        throw failure("程序或目录已变化，请刷新后重新确认", 409);
      return repository.updateConnections(
        (c) => {
          if (
            previews.get(input.token) !== preview ||
            preview.expires <= clock()
          )
            throw failure("目标选项已过期，请刷新后重新确认", 409);
          if (!c) throw failure("请先检测本机 Agent", 409);
          const targets = c.agentTargets || [];
          const old = input.id
            ? targets.find(
                (t) => t.id === input.id && t.agentId === preview.agentId,
              )
            : null;
          if (input.id && !old)
            throw failure("目标已不存在，请刷新后重试", 409);
          const duplicate = targets.find(
            (t) =>
              t.agentId === preview.agentId &&
              t.program.path === program.path &&
              t.program.kind === program.kind &&
              t.home.path === home.path &&
              t.id !== old?.id,
          );
          if (duplicate) {
            if (!input.id && duplicate.label === input.label.trim()) return c;
            throw failure(
              "该程序与目录已绑定为另一个目标，请编辑已有目标",
              409,
            );
          }
          const at = new Date(clock()).toISOString();
          const bindingChanged =
            !old ||
            old.program.path !== program.path ||
            old.program.kind !== program.kind ||
            old.home.id !== home.id ||
            old.home.path !== home.path;
          const bindingId = bindingChanged ? randomUUID() : old.bindingId;
          const target = {
            schema: 1,
            id: old?.id || `target-${randomUUID()}`,
            ...(bindingId === undefined ? {} : { bindingId }),
            agentId: preview.agentId,
            label: input.label.trim(),
            program: { path: program.path, kind: program.kind },
            home: { id: home.id, path: home.path, label: home.label },
            createdAt: old?.createdAt || at,
            updatedAt: at,
          };
          return {
            ...c,
            agentTargets: old
              ? targets.map((t) => (t.id === old.id ? target : t))
              : [...targets, target],
          };
        },
        { expectedRevision: input.revision },
      );
    },
    async remove(input) {
      shape(input, ["id", "revision"]);
      return repository.updateConnections(
        (c) => {
          if (!c?.agentTargets?.some((t) => t.id === input.id))
            throw failure("目标已不存在，请刷新后重试", 409);
          return {
            ...c,
            agentTargets: c.agentTargets.filter((t) => t.id !== input.id),
          };
        },
        { expectedRevision: input.revision },
      );
    },
  };
}
