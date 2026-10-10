import fs from "node:fs/promises";
import {guardCapabilityFilesystem} from "./guarded-capability-filesystem.mjs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { digest, failure } from "./repository.mjs";
import { inspectConfigDocument, planConfigChange } from "./config-document.mjs";
import { readConfigFile, atomicReplaceConfig } from "./config-file.mjs";
import { createConfigJournal } from "./config-journal.mjs";

const signature = (t) =>
  digest(
    JSON.stringify([
      t.agentId,
      t.program.path,
      t.program.kind,
      t.home.id,
      t.home.path,
      t.bindingId || null,
    ]),
  );
function shape(input, fields) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).length !== fields.length ||
    !fields.every((k) => Object.hasOwn(input, k))
  )
    throw failure("配置请求字段无效");
  for (const k of fields) {
    const v = input[k];
    if (
      k === "value"
        ? typeof v !== "boolean"
        : k === "revision"
          ? !Number.isSafeInteger(v) || v < 0
          : typeof v !== "string" ||
            !v ||
            v.length > 100 ||
            /[\x00-\x1f\x7f]/.test(v)
    )
      throw failure("配置参数无效");
  }
}
function targetOf(state, id, expected) {
  const target = state?.connections?.agentTargets?.find((t) => t.id === id);
  if (!target) throw failure("管理目标已不存在", 409);
  if (
    !["codex", "hermes"].includes(target.agentId) ||
    target.program.kind !== "CLI"
  )
    throw failure("此目标暂不支持终端配置管理", 400);
  if (expected && signature(target) !== expected)
    throw failure("目标绑定已变化，请重新读取配置", 409);
  return target;
}
function textOf(bytes) {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      bytes,
    );
  } catch {
    throw failure("配置不是有效UTF-8，未读取正文", 400);
  }
}

export function createAgentConfig(
  repository,
  adapters,
  { clock = Date.now, filesystem = fs, settings } = {},
) {
  settings ||= {get:async()=>({enabled:false,generation:'initial',options:{}}),assertEnabled:async()=>{throw failure('Agent写入默认关闭，请先在设置授权',409);}};
  async function authorization(expected){const gate=await settings.assertEnabled('agent');if(gate.generation!==expected)throw failure('Agent写入授权代次已变化，请重新预览',409);}
  const previews = new Map();
  const journal = createConfigJournal(repository.directory, { filesystem });
  const at = () => new Date(clock()).toISOString();
  async function scope(target, expected) {
    let inventory;
    try {
      inventory = await adapters.inspectAgentInventory(target.agentId);
    } catch {
      throw failure("目标目录检查未完成，不能读取配置", 409);
    }
    if (inventory.errors.length || inventory.truncated)
      throw failure("目标目录检查未完成，不能读取配置", 409);
    const home = inventory.homes.find(
      (h) =>
        h.id === target.home.id &&
        h.path === target.home.path &&
        !h.source.includes("用户共享"),
    );
    if (
      !home ||
      home.status !== "present" ||
      home.errors.length ||
      !home.identity
    )
      throw failure("目标Home不可用", 409);
    const homeSignature = digest(home.identity);
    if (expected && homeSignature !== expected)
      throw failure("目标目录身份已变化，请重新读取配置", 409);
    return {
      homeSignature,
      path: join(
        home.path,
        target.agentId === "codex" ? "config.toml" : "config.yaml",
      ),
    };
  }
  async function source(state, id, expected) {
    const target = targetOf(state, id, expected?.targetSignature);
    const place = await scope(target, expected?.homeSignature);
    const file = await readConfigFile(place.path, { filesystem });
    await scope(target, place.homeSignature);
    return { target, ...place, file, text: textOf(file.bytes) };
  }
  function remember(value, state) {
    for (const [key, p] of previews)
      if (p.expires <= clock()) previews.delete(key);
    if (previews.size >= 20) previews.delete(previews.keys().next().value);
    const token = randomUUID(),
      expires = clock() + 300000;
    previews.set(token, { ...value, expires, revision: state.revision });
    return {
      token,
      operationId: token,
      targetId: value.target.id,
      label: value.target.label,
      agentId: value.target.agentId,
      path: value.path,
      key: value.key,
      beforeValue: value.beforeValue,
      afterValue: value.afterValue,
      kind: value.kind,
      restores: value.restores,
      at: at(),
      expiresAt: new Date(expires).toISOString(),
      revision: state.revision,
      adoption: "unverified",
    };
  }
  function summary(row) {
    return {
      id: row.id,
      targetId: row.targetId,
      agentId: row.agentId,
      key: row.key,
      kind: row.kind,
      restores: row.restores,
      beforeValue: row.beforeValue,
      afterValue: row.afterValue,
      at: row.at,
      completedAt: row.completedAt || null,
      adoption: "unverified",
    };
  }
  async function checkOperation(row, state) {
    try {
      const value = await source(state, row.targetId, row);
      const status =
        value.file.mode !== row.mode ||
        value.file.uid !== row.uid ||
        value.file.gid !== row.gid
          ? "changed"
          : value.file.hash === row.afterHash
            ? "matches_after"
            : value.file.hash === row.beforeHash
              ? "matches_before"
              : "changed";
      return {
        ...summary(row),
        status,
        checkedAt: at(),
        path: value.path,
        message:
          status === "matches_after"
            ? "当前文件符合修改后内容；运行采用未验证"
            : status === "matches_before"
              ? "当前文件符合修改前内容；不会重放旧操作"
              : "文件已有其他变动，不能覆盖或恢复旧版本",
      };
    } catch {
      return {
        ...summary(row),
        status: "unknown",
        checkedAt: at(),
        message: "无法核验当前目标或文件，请检查目标与访问范围；未自动重试",
      };
    }
  }
  function reverse(row, value) {
    if (!row) throw failure("原配置操作记录不可用，不能恢复", 409);
    if (
      row.kind !== "apply" ||
      value.file.hash !== row.afterHash ||
      value.file.mode !== row.mode ||
      value.file.uid !== row.uid ||
      value.file.gid !== row.gid
    )
      throw failure("文件与原操作结果不一致，不能恢复；请重新读取配置", 409);
    const p = row.patch,
      after = Buffer.from(p.after),
      bytes = value.file.bytes;
    if (!bytes.subarray(p.offset, p.offset + after.length).equals(after))
      throw failure("恢复记录与文件不一致", 409);
    const original = Buffer.concat([
      bytes.subarray(0, p.offset),
      Buffer.from(p.before),
      bytes.subarray(p.offset + after.length),
    ]);
    if (digest(original) !== row.beforeHash)
      throw failure("原始内容校验不通过，未恢复", 409);
    // A disk record cannot authorize an arbitrary offset. Reproduce the original
    // declared operation through the format adapter before allowing its inverse.
    const proof = planConfigChange(
      row.agentId,
      textOf(original),
      row.key,
      row.afterValue,
    );
    if (
      !Buffer.from(proof.content).equals(bytes) ||
      JSON.stringify(proof.patch) !== JSON.stringify(p)
    )
      throw failure("恢复记录不对应受支持字段，未恢复", 409);
    return {
      content: textOf(original),
      patch: { offset: p.offset, before: p.after, after: p.before },
    };
  }
  const api = {
    async inspect(input) {
      shape(input, ["targetId"]);
      return repository.withSnapshot({}, async (state) => {
        const value = await source(state, input.targetId);
        const view = inspectConfigDocument(value.target.agentId, value.text);
        return {
          ...view,
          targetId: input.targetId,
          path: value.path,
          at: at(),
          revision: state.revision,
          adoption: "unverified",
          scope: "Home",
        };
      });
    },
    async preview(input) {
      shape(input, ["targetId", "key", "value", "revision"]);
      return repository.withSnapshot(
        { expectedRevision: input.revision },
        async (state) => {
          const value = await source(state, input.targetId);
          const change = planConfigChange(
            value.target.agentId,
            value.text,
            input.key,
            input.value,
          );
          return remember(
            {
              ...value,
              authorizationGeneration:(await settings.get('agent')).generation,
              key: input.key,
              patch: change.patch,
              beforeValue: change.before,
              afterValue: change.after,
              afterHash: digest(Buffer.from(change.content)),
              kind: "apply",
              restores: null,
              targetSignature: signature(value.target),
            },
            state,
          );
        },
      );
    },
    async apply(input) {
      shape(input, ["token", "revision"]);
      return repository.withSnapshot({}, async (state) => {
        const existing = await journal.get(input.token);
        if (existing) return checkOperation(existing, state);
        const preview = previews.get(input.token);
        if (!preview) throw failure("配置预览已过期，请重新预览", 409);
        let current, change, row;
        const writeGuard=async()=>{
          await authorization(preview.authorizationGeneration);
          if(preview.expires<=clock()||preview.revision!==state.revision)throw failure("配置预览已过期或主库已变化",409);
          await scope(preview.target,preview.homeSignature);
          await authorization(preview.authorizationGeneration);
          if(preview.expires<=clock())throw failure("配置预览已过期",409);
        };
        try {
          if (preview.expires <= clock())
            throw failure("配置预览已过期，请重新预览", 409);
          if (
            input.revision !== state.revision ||
            preview.revision !== state.revision
          )
            throw failure("主库已变化，请重新读取并预览", 409);
          await authorization(preview.authorizationGeneration);
          current = await source(state, preview.target.id, preview);
          if (
            current.file.identity !== preview.file.identity ||
            current.file.hash !== preview.file.hash
          )
            throw failure("配置文件已变化，请重新预览", 409);
          const original =
            preview.kind === "restore"
              ? await journal.get(preview.restores)
              : null;
          change =
            preview.kind === "restore"
              ? reverse(original, current)
              : planConfigChange(
                  current.target.agentId,
                  current.text,
                  preview.key,
                  preview.afterValue,
                );
          if (digest(Buffer.from(change.content)) !== preview.afterHash)
            throw failure("配置差异已变化，请重新预览", 409);
          row = {
            schema: 1,
            id: input.token,
            kind: preview.kind,
            restores: preview.restores,
            targetId: current.target.id,
            agentId: current.target.agentId,
            key: preview.key,
            beforeValue: preview.beforeValue,
            afterValue: preview.afterValue,
            targetSignature: preview.targetSignature,
            homeSignature: preview.homeSignature,
            beforeHash: current.file.hash,
            afterHash: preview.afterHash,
            mode: current.file.mode,
            uid: current.file.uid,
            gid: current.file.gid,
            patch: preview.patch,
            at: at(),
          };
          if (preview.expires <= clock())
            throw failure("配置预览已过期，请重新预览", 409);
          try {
            await journal.prepare(row,{guard:writeGuard});
          } catch (error) {
            throw failure(
              "无法确认配置操作记录已保存；未启动配置写入，请先核对记录",
              error.status === 409 ? 409 : 503,
            );
          }
        } catch (error) {
          // A server-issued preview and an initially absent row authorize this
          // assertion only before atomicReplaceConfig has been called.
          // Existing-record reads and every path after atomicReplaceConfig stay
          // outside it: an unavailable result is not evidence of no write.
          const safe = [400, 403, 404, 409, 413, 503].includes(error?.status);
          throw Object.assign(
            failure(
              safe
                ? error.message
                : "配置执行前校验失败，未开始写入；请重新读取配置",
              safe ? error.status : 503,
            ),
            { operationNotStarted: true },
          );
        }
        previews.delete(input.token);
        try {
          await atomicReplaceConfig(
            current.path,
            current.file,
            Buffer.from(change.content),
            {
              filesystem:guardCapabilityFilesystem(filesystem,writeGuard),
              verifyScope: async () => {
                await authorization(preview.authorizationGeneration);
                if (preview.expires <= clock())
                  throw failure("配置预览已过期，请重新预览", 409);
                await scope(current.target, current.homeSignature);
                await authorization(preview.authorizationGeneration);
                if (preview.expires <= clock())
                  throw failure("配置预览已过期，请重新预览", 409);
              },
            },
          );
          await journal.complete(row.id, at(),{guard:writeGuard});
        } catch {
          const result = await checkOperation(row, state);
          return {
            ...result,
            completedAt: null,
            newlyStarted: true,
            notice:
              "本次执行未确认完成；已保留操作记录，请先核对，不要重复提交",
          };
        }
        return { ...await checkOperation(await journal.get(row.id), state), newlyStarted: true };
      });
    },
    async check(input) {
      shape(input, ["id"]);
      const row = await journal.get(input.id);
      if (!row) throw failure("没有找到此配置操作", 404);
      return repository.withSnapshot({}, (state) => checkOperation(row, state));
    },
    async history(input) {
      shape(input, ["targetId"]);
      const rows = await journal.list();
      return {
        items: rows
          .filter((r) => r.targetId === input.targetId)
          .map((r) => ({ ...summary(r), status: "unchecked" })),
      };
    },
    async restorePreview(input) {
      shape(input, ["id", "revision"]);
      return repository.withSnapshot(
        { expectedRevision: input.revision },
        async (state) => {
          const row = await journal.get(input.id);
          if (!row) throw failure("没有找到原配置操作", 404);
          const value = await source(state, row.targetId, row);
          const change = reverse(row, value);
          return remember(
            {
              ...value,
              authorizationGeneration:(await settings.get('agent')).generation,
              key: row.key,
              patch: change.patch,
              beforeValue: row.afterValue,
              afterValue: row.beforeValue,
              afterHash: row.beforeHash,
              kind: "restore",
              restores: row.id,
              targetSignature: signature(value.target),
            },
            state,
          );
        },
      );
    },
  };
  return api;
}
