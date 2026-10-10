// 173：旧功能保留，测试通过新入口进入，不改变业务/安全断言。
export async function openLegacyInput(page) {
  await page
    .getByRole("button", { name: "逆向工程说明与设置", exact: true })
    .click();
  await page
    .getByRole("button", { name: "沿用旧文字候选流程", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "旧文字候选流程 · 投入素材" })
    .waitFor();
}
export async function openReferenceTools(page) {
  const details = page
    .locator(".rail details")
    .filter({ hasText: "保存参考与回收区" });
  if ((await details.getAttribute("open")) === null)
    await details.locator("summary").click();
}
