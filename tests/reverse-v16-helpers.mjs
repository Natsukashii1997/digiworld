// 173：旧功能保留，测试通过新入口进入，不改变业务/安全断言。
export async function openReferenceTools(page) {
  // #28 起逆向页改为孵蛋 3C，参考与回收在页尾折叠区
  const details = page.locator("details.rh-more").filter({ has: page.locator("summary", { hasText: "参考与回收" }) });
  if ((await details.getAttribute("open")) === null)
    await details.locator("summary").click();
}
