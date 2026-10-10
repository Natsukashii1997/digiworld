// v16等价入口迁移；只选角/切标签，不读取目录，不掩盖检测结果。
import assert from "node:assert/strict";
export async function selectAgentTab(page, agentId = "codex", tab = "档案") {
  const roster = page.getByRole("radiogroup", {
    name: "接力目标",
    exact: true,
  });
  await roster.waitFor();
  const radio = roster.locator(`[role="radio"][data-agent="${agentId}"]`);
  if (["claude-code", "codex", "hermes", "openclaw"].includes(agentId))
    await radio.waitFor();
  if (!(await radio.count()))
    await page.getByRole("button", { name: "更多伙伴", exact: true }).click();
  await radio.click();
  assert.equal(await radio.getAttribute("aria-checked"), "true");
  const chosen = page
    .getByRole("tablist", { name: "档案", exact: true })
    .getByRole("tab", { name: new RegExp(`^${tab}`) });
  await chosen.click();
  assert.equal(await chosen.getAttribute("aria-selected"), "true");
  return page.getByRole("tabpanel");
}
export async function agentInventoryEntry(page, id = "codex", name = "Codex") {
  await selectAgentTab(page, id, "配置");
  const card = page.locator(`.agent-discovery-card[data-agent="${id}"]`);
  await card.waitFor();
  return card;
}
export async function openAgentInventory(page, id = "codex", name = "Codex") {
  const e = await agentInventoryEntry(page, id, name);
  await e.click();
  return page.getByRole("dialog", { name, exact: true });
}
export async function agentContentCard(page, id = "codex", name = "Codex") {
  await selectAgentTab(page, id, "内容");
  const c = page.locator(`.agent-contents-card[data-agent="${id}"]`);
  await c.waitFor();
  return c;
}
export async function openManualRelay(page) {
  await page.getByRole("button", { name: "这页怎么用", exact: true }).click();
  await page
    .getByRole("dialog", { name: "智能体群 · 这页怎么用", exact: true })
    .getByRole("button", { name: "手动写一段 / 从项目来源生成", exact: true })
    .click();
}
