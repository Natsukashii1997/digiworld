import { request } from "./api.js";

// 网络中断时只回读，不重放删除；主库已完成删除则按实际结果收敛。
export async function removeAssetFromWarehouse(assetId, revision, adoptState) {
  try {
    const result = await request("/assets/delete", { assetId, expectedRevision: revision });
    adoptState(result.state);
    return result;
  } catch (error) {
    try {
      const fresh = await request("/workspace");
      adoptState(fresh);
      if (fresh.assets?.some(asset => asset.id === assetId && asset.archived))
        return { deleted: true, blockers: [], state: fresh, recovered: true };
    } catch { /* 保留原始操作结果未知，不重试写入。 */ }
    if (error.status && error.status < 500 && !error.unknownResult) throw error;
    throw new Error("删除结果未确认，请刷新后核对资产是否仍在仓库");
  }
}
