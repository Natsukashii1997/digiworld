import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixture.mjs";
import { seed } from "../src/store.js";
import { page, resolveRoute } from "../src/pages.js";

test("银饰旧链接落到首页，接口关闭且新导出不含退役字段", async t => {
  const app = await fixture();
  t.after(() => app.close());
  await app.repository.write(seed(), { initialize: true });
  assert.equal(page("silver"), undefined);
  assert.equal(resolveRoute("silver").route, "home");
  const session = await fetch(`${app.url}/api/session`, { headers: { "x-workbench-client": "1" } });
  const { token } = await session.json();
  const headers = { "x-workbench-token": token };
  for (const path of ["/api/silver/status", "/api/silver/images/old.png"]) {
    const response = await fetch(`${app.url}${path}`, { headers });
    assert.equal(response.status, 404, path);
  }
  const write = await fetch(`${app.url}/api/silver/images`, {
    method: "POST", headers: { ...headers, "content-type": "application/json" }, body: "{}",
  });
  assert.equal(write.status, 404);
  const exported = await fetch(`${app.url}/api/backup`, { headers });
  assert.equal(exported.status, 200);
  assert.equal(Object.hasOwn((await exported.json()).state, "silver"), false);
});
