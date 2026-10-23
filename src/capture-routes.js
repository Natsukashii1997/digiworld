// 去向推导（阶段 2 主线串联）：一条捕获（随手记 note、收藏 collection、逆向记录 reverse）去了哪里，
// 全部从“去处”一侧的引用推出，条目本身不存去向，避免两处说法不一致：
// - 投递到项目：projectDesk 的收件；有带上它的「继续」留痕（不早于投递时间）即“已交代”。已交代 ≠ 已完成。
// - 孵成资产：资产首个版本的 hatchedFrom；逆向记录沿用已有的 savedSkill。资产已归档则不算。
// - 收入焚决：随手记的 refined；收藏看未删除卷条目的 source.collectionId。
// - 归档：随手记的 archivedAt；收藏库按条目 ID 存的 archived 表。
// 一条可以有多个去向；没有任何去向即“待孵化”。
const key = (kind, id) => `${kind}:${id}`;
const time = (value) => Date.parse(value) || 0;

// 某条收件最近一次被「继续」带走的留痕；没有则未交代。
export function relayOf(collabLog, projectId, item) {
  let found = null;
  for (const record of collabLog || [])
    if (record.kind === "start" && record.projectId === projectId && time(record.at) >= time(item.at) &&
      record.inbox?.some((ref) => ref.kind === item.kind && ref.id === item.id) &&
      (!found || time(record.at) >= time(found.at)))
      found = record;
  return found;
}

// 项目收件里还没交代的条目（「继续」口令只带这些）。
export const pendingInbox = (state, projectId) =>
  ((state.projectDesk || []).find((entry) => entry.projectId === projectId)?.inbox || [])
    .filter((item) => !relayOf(state.collabLog, projectId, item));

export function captureRouteIndex(state, { collectionArchived = {} } = {}) {
  const index = new Map();
  const add = (kind, id, route) => {
    if (!index.has(key(kind, id))) index.set(key(kind, id), []);
    index.get(key(kind, id)).push(route);
  };
  const projects = new Map((state.connections?.projects || []).map((p) => [p.id, p]));
  for (const entry of state.projectDesk || [])
    for (const item of entry.inbox) {
      const relay = relayOf(state.collabLog, entry.projectId, item);
      add(item.kind, item.id, {
        to: "project", projectId: entry.projectId, projectName: projects.get(entry.projectId)?.name || "", at: item.at,
        ...(relay ? { relayedAt: relay.at } : {}),
      });
    }
  const assets = new Map(state.assets.map((a) => [a.id, a]));
  for (const asset of state.assets) {
    const from = asset.versions[0]?.hatchedFrom;
    if (from && !asset.archived)
      add(from.kind, from.id, { to: "asset", assetId: asset.id, title: asset.versions.at(-1).title, at: asset.versions[0].at });
  }
  for (const record of state.reverseRecords || []) {
    const asset = record.savedSkill && !record.deletedAt && assets.get(record.savedSkill.assetId);
    if (asset && !asset.archived)
      add("reverse", record.id, { to: "asset", assetId: asset.id, title: asset.versions.at(-1).title, at: record.savedSkill.at });
  }
  for (const note of state.notes) {
    if (note.refined) add("note", note.id, { to: "scroll", scrollId: note.refined.scrollId, entryId: note.refined.entryId, at: note.refined.at });
    if (note.archivedAt) add("note", note.id, { to: "archive", at: note.archivedAt });
  }
  for (const scroll of state.scrolls || [])
    if (!scroll.deletedAt)
      for (const entry of scroll.entries)
        if (!entry.deletedAt && entry.source?.collectionId)
          add("collection", entry.source.collectionId, { to: "scroll", scrollId: scroll.id, entryId: entry.id, at: entry.createdAt });
  for (const [id, at] of Object.entries(collectionArchived)) add("collection", id, { to: "archive", at });
  for (const routes of index.values()) routes.sort((a, b) => time(a.at) - time(b.at));
  return {
    routes: (kind, id) => index.get(key(kind, id)) || [],
    pending: (kind, id) => !index.has(key(kind, id)),
  };
}
