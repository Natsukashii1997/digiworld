// 探针 5：最小对照。一个 await 永不 resolve 的 Promise 的测试，node:test 是立即报
// "Promise resolution is still pending but the event loop has already resolved" 还是挂起？
// 参数 MODE=plain（无任何句柄）/ MODE=server（开过又关掉一个 HTTP 服务并 fetch 过一次）
import test from "node:test";
import { createServer } from "node:http";
test("never resolves", async () => {
  if (process.env.MODE === "server") {
    const server = createServer((q, s) => s.end("ok"));
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const url = `http://127.0.0.1:${server.address().port}/`;
    await (await fetch(url)).text();
    await new Promise((r) => server.close(r));
  }
  await new Promise(() => {});
});
