import fs from "node:fs/promises";
import { constants } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { digest, failure } from "./repository.mjs";
import { readConfigFile, atomicReplaceConfig } from "./config-file.mjs";
import { createConfigJournal } from "./config-journal.mjs";
import {
  projectDirectory,
  assertDirectoryConfirmed,
} from "./project-context.mjs";

export const RULE_FILES = ["AGENTS.md", "CLAUDE.md"];
const LIMIT = 256 * 1024;
// 操作记录要存区块前后两段（各 ≤ 256 KiB），读取与写入共用 1 MiB 上限（D-R6）。
const RECORD_LIMIT = 1024 * 1024;
const recordTooLarge = (patch) =>
  Buffer.byteLength(JSON.stringify(patch)) + 4096 > RECORD_LIMIT;
const MARK = "guiji:rules:";
const END = "<!-- guiji:rules:end -->";
const BEGIN =
  /^<!-- guiji:rules:begin template=([A-Za-z0-9-]{1,100}) version=([A-Za-z0-9-]{1,100}) sha256=([a-f0-9]{64}) -->\r?\n/gm;
const END_LINE = /^<!-- guiji:rules:end -->\r?$/gm;
const identifier = (v) => typeof v === "string" && /^[A-Za-z0-9-]{1,100}$/.test(v);
const bytes = (text) => Buffer.byteLength(text);

// ---------- 托管区块：纯函数 ----------

function innerOf(body) {
  if (typeof body !== "string" || !body.trim())
    throw failure("规则模板正文为空，不能装入", 400);
  if (body.includes(MARK))
    throw failure("模板正文不能包含托管标记 guiji:rules:", 400);
  return body.endsWith("\n") ? body : body + "\n";
}

export function renderRuleBlock({ assetId, versionId, body }) {
  if (!identifier(assetId) || !identifier(versionId))
    throw failure("规则模板标识无效", 400);
  const inner = innerOf(body);
  return `<!-- guiji:rules:begin template=${assetId} version=${versionId} sha256=${digest(inner)} -->\n${inner}${END}`;
}

// 只认恰好一对完整标记；其余任何出现“guiji:rules:”的情况都拒绝，不猜。
export function parseRuleBlock(text) {
  const count = text.split(MARK).length - 1;
  if (!count) return null;
  const begins = [...text.matchAll(BEGIN)];
  const ends = [...text.matchAll(END_LINE)];
  if (
    count !== 2 ||
    begins.length !== 1 ||
    ends.length !== 1 ||
    ends[0].index < begins[0].index + begins[0][0].length
  )
    throw failure(
      "文件中的托管区块标记不完整、重复或格式不对，请手动检查后再操作",
      409,
    );
  const [line, assetId, versionId, sha256] = begins[0];
  const start = begins[0].index;
  const inner = text.slice(start + line.length, ends[0].index);
  return {
    assetId,
    versionId,
    sha256,
    inner,
    drift: digest(inner) !== sha256,
    start,
    end: ends[0].index + END.length,
  };
}

export function planRuleChange(text, template, { overwriteDrift = false } = {}) {
  const block = renderRuleBlock(template);
  const blockAfter = innerOf(template.body);
  let plan;
  if (text === null) {
    const after = block + "\n";
    plan = {
      action: "create",
      content: after,
      patch: { offset: 0, before: "", after },
      previous: null,
    };
  } else {
    const existing = parseRuleBlock(text);
    if (!existing) {
      const separator =
        text === "" || /(\r?\n){2}$/.test(text)
          ? ""
          : text.endsWith("\n")
            ? "\n"
            : "\n\n";
      const after = separator + block + "\n";
      plan = {
        action: "append",
        content: text + after,
        patch: { offset: bytes(text), before: "", after },
        previous: null,
      };
    } else {
      if (existing.assetId !== template.assetId)
        throw failure(
          "此文件已装入另一个规则模板；一个文件只能有一个托管区块",
          409,
        );
      const previous = {
        assetId: existing.assetId,
        versionId: existing.versionId,
        drift: existing.drift,
        inner: existing.inner,
      };
      if (existing.drift && !overwriteDrift)
        return { action: "drift", previous, blockAfter };
      if (!existing.drift && existing.versionId === template.versionId)
        return { action: "same", previous, blockAfter };
      const before = text.slice(existing.start, existing.end);
      plan = {
        action: "upgrade",
        content: text.slice(0, existing.start) + block + text.slice(existing.end),
        patch: {
          offset: bytes(text.slice(0, existing.start)),
          before,
          after: block,
        },
        previous,
      };
    }
  }
  if (bytes(plan.content) > LIMIT)
    throw failure("写入后文件将超过 256 KiB，未装入", 413);
  return { ...plan, blockAfter };
}

// ---------- 操作记录 ----------

const uuid =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const hash = /^[a-f0-9]{64}$/;
const ROW_KEYS = [
  "schema",
  "id",
  "kind",
  "restores",
  "projectId",
  "root",
  "file",
  "path",
  "assetId",
  "versionId",
  "previousAssetId",
  "previousVersionId",
  "action",
  "drift",
  "beforeHash",
  "afterHash",
  "mode",
  "uid",
  "gid",
  "patch",
  "at",
];
const rowInvalid = () =>
  failure("规则模板变更记录无效或不可访问，已停止变更；请保留本机记录。", 503);
const safeText = (v, max) =>
  typeof v === "string" && v.length <= max && !/[\x00-\x1f\x7f]/.test(v);
const optionalId = (v) => v === null || identifier(v);
const owner = (v) => Number.isSafeInteger(v) && v >= 0 && v <= 0xffffffff;

export function validateRuleOperation(r) {
  if (
    !r ||
    typeof r !== "object" ||
    Array.isArray(r) ||
    Object.keys(r).length !== ROW_KEYS.length ||
    !ROW_KEYS.every((k) => Object.hasOwn(r, k))
  )
    throw rowInvalid();
  const created = r.action === "create";
  const p = r.patch;
  if (
    r.schema !== 1 ||
    !uuid.test(r.id) ||
    !["apply", "restore"].includes(r.kind) ||
    (r.kind === "apply" ? r.restores !== null : !uuid.test(r.restores)) ||
    !["create", "append", "upgrade", "restore"].includes(r.action) ||
    (r.kind === "restore") !== (r.action === "restore") ||
    !safeText(r.projectId, 200) ||
    !r.projectId ||
    !safeText(r.root, 4096) ||
    !isAbsolute(r.root) ||
    !RULE_FILES.includes(r.file) ||
    !safeText(r.path, 4096) ||
    !isAbsolute(r.path) ||
    resolve(r.path) !== r.path ||
    !r.path.endsWith("/" + r.file) ||
    ![r.assetId, r.versionId, r.previousAssetId, r.previousVersionId].every(
      optionalId,
    ) ||
    (r.kind === "apply" && (!r.assetId || !r.versionId)) ||
    typeof r.drift !== "boolean" ||
    (created ? r.beforeHash !== null : !hash.test(r.beforeHash)) ||
    !hash.test(r.afterHash) ||
    r.beforeHash === r.afterHash ||
    (created
      ? r.mode !== null || r.uid !== null || r.gid !== null
      : !Number.isInteger(r.mode) ||
        r.mode < 0 ||
        r.mode > 0o777 ||
        !owner(r.uid) ||
        !owner(r.gid)) ||
    typeof r.at !== "string" ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(r.at) ||
    !p ||
    typeof p !== "object" ||
    Object.keys(p).length !== 3 ||
    !Number.isSafeInteger(p.offset) ||
    p.offset < 0 ||
    p.offset > LIMIT ||
    typeof p.before !== "string" ||
    typeof p.after !== "string" ||
    bytes(p.before) > LIMIT ||
    bytes(p.after) > LIMIT ||
    p.before === p.after
  )
    throw rowInvalid();
  return r;
}

// ---------- 服务 ----------

function shape(input, fields) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).length !== fields.length ||
    !fields.every((k) => Object.hasOwn(input, k))
  )
    throw failure("规则模板请求字段无效");
  for (const k of fields) {
    const v = input[k];
    const ok =
      k === "revision"
        ? Number.isSafeInteger(v) && v >= 0
        : k === "overwriteDrift"
          ? typeof v === "boolean"
          : k === "root"
            ? safeText(v, 4096) && isAbsolute(v)
            : safeText(v, 200) && v.length > 0;
    if (!ok) throw failure("规则模板参数无效");
  }
}
function textOf(buffer) {
  try {
    const text = new TextDecoder("utf-8", {
      fatal: true,
      ignoreBOM: true,
    }).decode(buffer);
    if (text.includes("\0")) throw new Error();
    return text;
  } catch {
    throw failure("目标文件不是 UTF-8 文本，未读取正文", 400);
  }
}
function fileFailure(error) {
  const status = error?.status;
  if (status === 404) return null;
  if (status === 413) return failure("目标文件超过 256 KiB，未装入", 413);
  if (status === 409) return failure("目标文件在读取期间变化，请重新预览", 409);
  if (status === 403 || status === 400)
    return failure(
      "目标文件须为本人所有、无链接及特殊权限的普通文件，路径中不能有链接",
      403,
    );
  return failure("无法安全读取目标文件", 503);
}
async function readTarget(path, filesystem) {
  try {
    return await readConfigFile(path, { filesystem });
  } catch (error) {
    const mapped = fileFailure(error);
    if (mapped) throw mapped;
    return null;
  }
}
function templateOf(state, assetId, versionId) {
  const asset = state.assets?.find((a) => a.id === assetId);
  const version = asset?.versions.find((v) => v.id === versionId);
  if (!asset || asset.type !== "Rule" || !version)
    throw failure("规则模板或其版本不存在", 404);
  return { assetId, versionId, body: version.content, title: version.title };
}
function splice(buffer, patch) {
  const before = Buffer.from(patch.before);
  if (!buffer.subarray(patch.offset, patch.offset + before.length).equals(before))
    throw failure("记录与文件内容不一致，不能撤回", 409);
  return Buffer.concat([
    buffer.subarray(0, patch.offset),
    Buffer.from(patch.after),
    buffer.subarray(patch.offset + before.length),
  ]);
}

async function createExclusive(path, content, verifyScope, filesystem) {
  await verifyScope();
  let handle,
    opened = false;
  try {
    handle = await filesystem.open(
      path,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o644,
    );
    opened = true;
    await handle.writeFile(content);
    await handle.sync();
  } catch (error) {
    if (!opened)
      throw failure(
        error?.code === "EEXIST"
          ? "目标文件已出现，未覆盖；请重新预览"
          : "无法新建目标文件，未写入",
        409,
      );
    throw Object.assign(failure("新建文件结果未知，请先核对", 503), {
      outcome: "unknown",
    });
  } finally {
    await handle?.close().catch(() => {});
  }
  const directory = await filesystem.open(
    dirname(path),
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
  await verifyScope();
  const result = await readConfigFile(path, { filesystem });
  if (result.hash !== digest(content))
    throw failure("新建文件回读不一致", 409);
  return result;
}

export function createRuleTemplates(
  repository,
  { clock = Date.now, filesystem = fs } = {},
) {
  const previews = new Map();
  const journal = createConfigJournal(repository.directory, {
    filesystem,
    folder: "rule-operations",
    validate: validateRuleOperation,
    label: "规则模板",
    readLimit: RECORD_LIMIT,
  });
  const at = () => new Date(clock()).toISOString();

  async function locate(state, { projectId, root, file }) {
    if (!RULE_FILES.includes(file))
      throw failure("只能装入项目根目录的 AGENTS.md 或 CLAUDE.md", 400);
    const project = state?.connections?.projects?.find((p) => p.id === projectId);
    if (!project || !project.localPaths.includes(root))
      throw failure("请选择已发现项目的本地目录", 404);
    assertDirectoryConfirmed(project, root);
    let directory;
    try {
      directory = await projectDirectory(state.connections.roots, root);
    } catch (error) {
      if (error.status) throw error;
      if (["ENOENT", "ENOTDIR"].includes(error.code))
        throw failure("项目目录不存在，请重新扫描", 404);
      if (["EACCES", "EPERM"].includes(error.code))
        throw failure("项目目录读取受阻", 403);
      throw failure("无法核验项目目录", 503);
    }
    assertDirectoryConfirmed(project, root, directory.identity);
    return { project, stamp: directory.stamp, path: join(directory.root, file) };
  }
  function scopeCheck(state, input, stamp, expires) {
    return async () => {
      if (expires <= clock()) throw failure("预览已过期，请重新预览", 409);
      const again = await locate(state, input);
      if (again.stamp !== stamp)
        throw failure("项目目录已变化，请重新预览", 409);
    };
  }
  function remember(value, state) {
    for (const [key, p] of previews)
      if (p.expires <= clock()) previews.delete(key);
    if (previews.size >= 20) previews.delete(previews.keys().next().value);
    const token = randomUUID(),
      expires = clock() + 300000;
    previews.set(token, { ...value, expires, revision: state.revision });
    return { token, expiresAt: new Date(expires).toISOString() };
  }
  function summary(row) {
    return {
      id: row.id,
      kind: row.kind,
      action: row.action,
      restores: row.restores,
      projectId: row.projectId,
      root: row.root,
      file: row.file,
      path: row.path,
      assetId: row.assetId,
      versionId: row.versionId,
      previousAssetId: row.previousAssetId,
      previousVersionId: row.previousVersionId,
      drift: row.drift,
      at: row.at,
      completedAt: row.completedAt || null,
    };
  }
  async function checkOperation(row) {
    try {
      const file = await readTarget(row.path, filesystem);
      const sameOwner =
        !file ||
        row.mode === null ||
        (file.mode === row.mode && file.uid === row.uid && file.gid === row.gid);
      const status = !file
        ? row.beforeHash === null
          ? "matches_before"
          : "changed"
        : !sameOwner
          ? "changed"
          : file.hash === row.afterHash
            ? "matches_after"
            : file.hash === row.beforeHash
              ? "matches_before"
              : "changed";
      return {
        ...summary(row),
        status,
        checkedAt: at(),
        message:
          status === "matches_after"
            ? "文件符合本次写入后的内容"
            : status === "matches_before"
              ? "文件符合写入前的内容；不会重放旧操作"
              : "文件之后有其他改动，不能覆盖或撤回",
      };
    } catch {
      return {
        ...summary(row),
        status: "unknown",
        checkedAt: at(),
        message: "无法核验目标文件，请检查访问范围；未自动重试",
      };
    }
  }
  // 撤回只在文件仍是本次写后字节时成立；再用模板重算一次正向变更，证明记录没有被改写。
  function reverse(row, state, file) {
    if (row.kind !== "apply")
      throw failure("只能撤回装入或升级操作", 409);
    if (row.action === "create")
      throw failure(
        "此文件由本次新建；工作台不删除文件，如需撤回请手动删除该文件",
        409,
      );
    if (
      !file ||
      file.hash !== row.afterHash ||
      file.mode !== row.mode ||
      file.uid !== row.uid ||
      file.gid !== row.gid
    )
      throw failure("文件在本次写入后已有其他改动，不能撤回", 409);
    const original = splice(file.bytes, {
      offset: row.patch.offset,
      before: row.patch.after,
      after: row.patch.before,
    });
    if (digest(original) !== row.beforeHash)
      throw failure("写入前内容校验不通过，未撤回", 409);
    let proof;
    try {
      proof = planRuleChange(
        textOf(original),
        templateOf(state, row.assetId, row.versionId),
        { overwriteDrift: row.drift },
      );
    } catch {
      throw failure("撤回记录无法复现，未撤回", 409);
    }
    if (
      !Buffer.from(proof.content ?? "").equals(file.bytes) ||
      JSON.stringify(proof.patch) !== JSON.stringify(row.patch)
    )
      throw failure("撤回记录无法复现，未撤回", 409);
    return textOf(original);
  }

  const api = {
    async preview(input) {
      shape(input, [
        "projectId",
        "root",
        "file",
        "assetId",
        "versionId",
        "overwriteDrift",
        "revision",
      ]);
      return repository.withSnapshot(
        { expectedRevision: input.revision },
        async (state) => {
          const template = templateOf(state, input.assetId, input.versionId);
          const place = await locate(state, input);
          const file = await readTarget(place.path, filesystem);
          const text = file ? textOf(file.bytes) : null;
          const plan = planRuleChange(text, template, {
            overwriteDrift: input.overwriteDrift,
          });
          const view = {
            action: plan.action,
            projectId: input.projectId,
            projectName: place.project.name,
            root: input.root,
            file: input.file,
            path: place.path,
            assetId: template.assetId,
            versionId: template.versionId,
            previous: plan.previous
              ? {
                  assetId: plan.previous.assetId,
                  versionId: plan.previous.versionId,
                  drift: plan.previous.drift,
                }
              : null,
            drift: !!plan.previous?.drift,
            blockBefore: plan.previous?.inner ?? "",
            blockAfter: plan.blockAfter,
            outsideBytes: text === null ? 0 : bytes(text) - bytes(plan.patch?.before ?? ""),
            revision: state.revision,
            at: at(),
          };
          if (!plan.content) return { ...view, token: null, expiresAt: null };
          if (recordTooLarge(plan.patch))
            throw failure(
              "托管区块前后内容过大，写入记录无法保存；请先缩小区块后再装入",
              413,
            );
          return {
            ...view,
            ...remember(
              {
                kind: "apply",
                restores: null,
                input: {
                  projectId: input.projectId,
                  root: input.root,
                  file: input.file,
                },
                overwriteDrift: input.overwriteDrift,
                template,
                path: place.path,
                stamp: place.stamp,
                file,
                action: plan.action,
                patch: plan.patch,
                afterHash: digest(Buffer.from(plan.content)),
                assetId: template.assetId,
                versionId: template.versionId,
                previousAssetId: plan.previous?.assetId ?? null,
                previousVersionId: plan.previous?.versionId ?? null,
                drift: !!plan.previous?.drift,
              },
              state,
            ),
          };
        },
      );
    },
    async revertPreview(input) {
      shape(input, ["id", "revision"]);
      if (!uuid.test(input.id)) throw failure("操作标识无效");
      return repository.withSnapshot(
        { expectedRevision: input.revision },
        async (state) => {
          const row = await journal.get(input.id);
          if (!row) throw failure("没有找到这次写入记录", 404);
          if (row.action === "create" || row.kind !== "apply")
            reverse(row, state, null);
          const place = await locate(state, row);
          if (place.path !== row.path)
            throw failure("项目目录已变化，不能撤回", 409);
          const file = await readTarget(place.path, filesystem);
          const content = reverse(row, state, file);
          return {
            action: "restore",
            projectId: row.projectId,
            file: row.file,
            path: row.path,
            assetId: row.previousAssetId,
            versionId: row.previousVersionId,
            previous: { assetId: row.assetId, versionId: row.versionId, drift: false },
            revision: state.revision,
            at: at(),
            ...remember(
              {
                kind: "restore",
                restores: row.id,
                input: { projectId: row.projectId, root: row.root, file: row.file },
                path: place.path,
                stamp: place.stamp,
                file,
                action: "restore",
                content,
                patch: {
                  offset: row.patch.offset,
                  before: row.patch.after,
                  after: row.patch.before,
                },
                afterHash: row.beforeHash,
                assetId: row.previousAssetId,
                versionId: row.previousVersionId,
                previousAssetId: row.assetId,
                previousVersionId: row.versionId,
                drift: false,
              },
              state,
            ),
          };
        },
      );
    },
    async apply(input) {
      shape(input, ["token", "revision"]);
      if (!uuid.test(input.token)) throw failure("预览令牌无效");
      return repository.withSnapshot({}, async (state) => {
        const existing = await journal.get(input.token);
        if (existing) return checkOperation(existing);
        const preview = previews.get(input.token);
        let current, content, row;
        try {
          if (!preview) throw failure("预览已过期，请重新预览", 409);
          if (preview.expires <= clock())
            throw failure("预览已过期，请重新预览", 409);
          if (
            input.revision !== state.revision ||
            preview.revision !== state.revision
          )
            throw failure("主库已变化，请重新预览", 409);
          const place = await locate(state, preview.input);
          if (place.stamp !== preview.stamp || place.path !== preview.path)
            throw failure("项目目录已变化，请重新预览", 409);
          current = await readTarget(place.path, filesystem);
          if (
            !!current !== !!preview.file ||
            (current &&
              (current.identity !== preview.file.identity ||
                current.hash !== preview.file.hash))
          )
            throw failure("目标文件已变化，请重新预览", 409);
          if (preview.kind === "restore") {
            const original = await journal.get(preview.restores);
            if (!original) throw failure("原写入记录不可用，不能撤回", 409);
            content = reverse(original, state, current);
          } else {
            const plan = planRuleChange(
              current ? textOf(current.bytes) : null,
              templateOf(state, preview.assetId, preview.versionId),
              { overwriteDrift: preview.overwriteDrift },
            );
            content = plan.content;
          }
          if (!content || digest(Buffer.from(content)) !== preview.afterHash)
            throw failure("写入内容已变化，请重新预览", 409);
          row = {
            schema: 1,
            id: input.token,
            kind: preview.kind,
            restores: preview.restores,
            projectId: preview.input.projectId,
            root: preview.input.root,
            file: preview.input.file,
            path: preview.path,
            assetId: preview.assetId,
            versionId: preview.versionId,
            previousAssetId: preview.previousAssetId,
            previousVersionId: preview.previousVersionId,
            action: preview.action,
            drift: preview.drift,
            beforeHash: current ? current.hash : null,
            afterHash: preview.afterHash,
            mode: current ? current.mode : null,
            uid: current ? current.uid : null,
            gid: current ? current.gid : null,
            patch: preview.patch,
            at: at(),
          };
          try {
            await journal.prepare(row);
          } catch (error) {
            if (error.status === 413) throw error;
            throw failure(
              "无法确认写入记录已保存；未开始写入，请先核对记录",
              error.status === 409 ? 409 : 503,
            );
          }
        } catch (error) {
          // 只有写入真正开始之前的失败才能声明“未开始”。
          const safe = [400, 403, 404, 409, 413, 503].includes(error?.status);
          throw Object.assign(
            failure(
              safe ? error.message : "写入前校验失败，未开始写入；请重新预览",
              safe ? error.status : 503,
            ),
            { operationNotStarted: true },
          );
        }
        previews.delete(input.token);
        const verifyScope = scopeCheck(
          state,
          preview.input,
          preview.stamp,
          preview.expires,
        );
        try {
          if (current)
            await atomicReplaceConfig(
              preview.path,
              current,
              Buffer.from(content),
              { filesystem, verifyScope },
            );
          else
            await createExclusive(
              preview.path,
              Buffer.from(content),
              verifyScope,
              filesystem,
            );
          await journal.complete(row.id, at());
        } catch {
          return {
            ...(await checkOperation(row)),
            completedAt: null,
            notice: "本次写入未确认完成；已保留操作记录，请先核对，不要重复提交",
          };
        }
        return checkOperation(await journal.get(row.id));
      });
    },
    // 核对经过主库串行队列：排在它前面的写入（含同一操作）结束后才读文件，
    // 不会在 rename 前给出“写入前”的结论（D-R5）。
    async check(input) {
      shape(input, ["id"]);
      if (!uuid.test(input.id)) throw failure("操作标识无效");
      return repository.withSnapshot({}, async () => {
        const row = await journal.get(input.id);
        if (!row) throw failure("没有找到这次写入记录", 404);
        return checkOperation(row);
      });
    },
    // 每个项目目录下的每个文件：当前版本只取最近一次“已完成”的写入（D-R4）；
    // 比它更新、却没有完成回执的写入单列为 pending，不冒充已装版本。不读取项目文件。
    async installs(input) {
      shape(input, []);
      const done = new Map(),
        open = new Map();
      for (const row of await journal.list()) {
        const key = `${row.projectId}\0${row.root}\0${row.file}`;
        const bucket = row.completedAt ? done : open;
        const stamp = row.completedAt || row.at;
        const current = bucket.get(key);
        if (!current || stamp > (current.completedAt || current.at)) bucket.set(key, row);
      }
      const items = [];
      for (const key of new Set([...done.keys(), ...open.keys()])) {
        const base = done.get(key),
          waiting = open.get(key);
        const pending =
          waiting && (!base || waiting.at >= base.at)
            ? {
                id: waiting.id,
                kind: waiting.kind,
                action: waiting.action,
                assetId: waiting.assetId,
                versionId: waiting.versionId,
                at: waiting.at,
              }
            : null;
        if (base?.assetId) items.push({ ...summary(base), pending });
        else if (pending) {
          const { projectId, root, file, path } = waiting;
          items.push({ projectId, root, file, path, id: null, assetId: null, versionId: null, completedAt: null, pending });
        }
      }
      return { items };
    },
  };
  return api;
}
