import { referencedDemoIds } from "./workflow-references.js";

export function retainedDemoIds(assets, skillCopies = [], activity = []) {
  const ids = referencedDemoIds(assets);
  for (const event of activity) ids.add(event.assetId);
  for (const copy of skillCopies) ids.add(copy.assetId);
  for (const asset of assets)
    if (!asset.demo && asset.origin?.kind === "derived")
      ids.add(asset.origin.assetId);
  const demoIds = new Set(
    assets.filter((asset) => asset.demo).map((asset) => asset.id),
  );
  return new Set([...ids].filter((id) => demoIds.has(id)));
}
