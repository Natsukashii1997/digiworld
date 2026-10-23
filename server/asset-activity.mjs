import { failure } from "./repository.mjs";
import { equivalent } from "./schema.mjs";

export function createAssetActivity(repository, deliveries, clock = Date.now) {
  return {
    async query(id) {
      if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(id))
        throw failure("记录 ID 无效");
      // Absence must be read after prior queued writes have settled. A plain
      // read can race an in-flight commit and incorrectly authorize recovery.
      return repository.withSnapshot({}, (state) => ({
        record: state.assetActivity?.find((r) => r.id === id) || null,
        state,
      }));
    },
    async append(input) {
      if (!input || typeof input !== "object" || Array.isArray(input))
        throw failure("记录请求无效");
      const { expectedRevision, ...payload } = input;
      // Only server time/schema may enter immutable records.
      if ("at" in payload || "schema" in payload)
        throw failure("记录时间由服务端生成");
      const state = await repository.updateActivity(
        async (records, stored) => {
          const old = records.find((r) => r.id === payload.id);
          if (old) {
            const { at, schema, ...identity } = old;
            if (!equivalent(identity, payload))
              throw failure("记录 ID 已被不同操作使用", 409);
            return records;
          }
          const asset = stored.assets.find((a) => a.id === payload.assetId);
          if (!asset || asset.archived)
            throw failure("资产不存在或已归档", 409);
          if (payload.action === "copy-skill" || (payload.action === "copy-design" && payload.deliveryId)) {
            const links = await deliveries.list(asset.id);
            if (
              !links.some(
                (r) =>
                  r.id === payload.deliveryId &&
                  r.versionId === payload.versionId,
              )
            )
              throw failure("安装口令链接已失效或不匹配", 410);
          }
          return [
            ...records,
            { schema: 1, ...payload, at: new Date(clock()).toISOString() },
          ];
        },
        { expectedRevision },
      );
      return {
        state,
        record: state.assetActivity.find((r) => r.id === payload.id),
      };
    },
  };
}
