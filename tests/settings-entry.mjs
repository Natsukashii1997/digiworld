// 设置 v19（3-1 一行一控件）：旧的五个分类改成自检行 + 抽屉。旧分类名 → 打开对应抽屉的入口。
const entries = {
  数据与备份: (p) => p.getByRole("button", { name: "导入备份", exact: true }),
  资产交付目标: (p) => p.locator("[data-line=deliver]").getByRole("button", { name: "添加目标", exact: true }),
  项目设置: (p) => p.locator("[data-line=scan]").getByRole("button", { name: "调整", exact: true }),
  "知识与 MCP": (p) => p.locator("[data-line=knowledge]").getByRole("button", { name: "管理", exact: true }),
};
export async function openSettingsDrawer(p, name) {
  await entries[name](p).click();
  await p.getByRole("dialog").first().waitFor();
}
// 模型 / 常驻服务：开关先打开授权预览抽屉，底部「管理凭据… / 查看服务状态…」进二级面板。
// 授权抽屉读历史期间会忽略点击（现版行为），读完再点。
const more = { model: ["管理凭据…", "配置模型连接"], daemon: ["查看服务状态…", "配置常驻服务"] };
export const capabilitySwitch = (p, cap) => p.locator(`[data-line=${cap}]`).getByRole("switch");
export async function openCapabilityMore(p, cap) {
  const [button, title] = more[cap];
  await capabilitySwitch(p, cap).click();
  const target = p.getByRole("dialog", { name: title, exact: true });
  for (let i = 0; i < 50 && !(await target.count()); i++) {
    await p.getByRole("button", { name: button, exact: true }).click();
    await p.waitForTimeout(100);
  }
  await target.waitFor();
  return target;
}
