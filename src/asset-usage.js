export const usageTime = (record) => record.usedAt || record.at;

export function usageByAsset(assets, activity = []) {
  const groups = new Map();
  for (const record of activity) {
    if (!groups.has(record.assetId)) groups.set(record.assetId, []);
    groups.get(record.assetId).push(record);
  }
  return new Map(
    assets.map((asset) => [
      asset.id,
      usageOf(asset, groups.get(asset.id) || []),
    ]),
  );
}

// Copy evidence and personal feedback are distinct from Agent adoption.
export function usageOf(asset, activity = []) {
  const records = activity.filter((r) => r.assetId === asset.id);
  const uses = records.filter((r) => r.kind === "use");
  const versionId = asset.versions.at(-1).id;
  const currentUses = uses.filter((r) => r.versionId === versionId);
  const latest = (items) =>
    items.reduce((a, b) => (!a || b.at >= a.at ? b : a), null);
  const feedback = latest(
    records.filter((r) => r.kind === "feedback" && r.versionId === versionId),
  );
  const verified =
    feedback?.rating === "good" &&
    currentUses.some((r) => r.id === feedback.useId);
  return {
    count: uses.length,
    lastAt: uses.reduce(
      (at, use) => (usageTime(use) > at ? usageTime(use) : at),
      "",
    ),
    currentUses,
    feedback,
    stage: verified ? 3 : currentUses.length ? 2 : 1,
    evidence: !currentUses.length
      ? "当前版本尚无使用证据"
      : feedback?.rating === "improve"
        ? "当前版本需改进 · 本人反馈"
        : verified
          ? "当前版本好用 · 本人反馈"
          : "已成功复制 · 未验证实际效果",
  };
}
