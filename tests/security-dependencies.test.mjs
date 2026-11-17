import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, writeFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "vite";
const require = createRequire(import.meta.url);
const { SourceMapConsumer } = require("source-map-js");
const basic = { version: 3, sources: ["fixture.js"], names: [], mappings: "AAAA" };

test("安全审计：索引 source map 拒绝超大及嵌套累加偏移，合法映射仍可读", () => {
  const indexed = (line, map = basic) => ({ version: 3, sections: [{ offset: { line, column: 0 }, map }] });
  assert.throws(() => new SourceMapConsumer(indexed(10000001)), /offset/i);
  assert.throws(() => new SourceMapConsumer(indexed(6000000, indexed(6000000))), /offset/i);
  const consumer = new SourceMapConsumer(indexed(2));
  const mappings = [];
  consumer.eachMapping(mapping => mappings.push([mapping.source, mapping.generatedLine, mapping.generatedColumn]));
  assert.deepEqual(mappings, [["fixture.js", 3, 0]]);
});

test("安全审计：Vite 导入根内同名文件不能授权读取根外绝对路径", async () => {
  const folder = await realpath(await mkdtemp(join(tmpdir(), "digiworld-vite-security-")));
  const root = join(folder, "project"), outside = join(folder, "outside.js");
  const rootRelative = outside.slice(1);
  let server;
  try {
    await mkdir(join(root, rootRelative, ".."), { recursive: true });
    await writeFile(outside, 'export default "SYNTHETIC_PRIVATE_MARKER";');
    await writeFile(join(root, rootRelative), 'export default "PUBLIC_FIXTURE";');
    await writeFile(join(root, "entry.js"), `import value from ${JSON.stringify("./" + rootRelative)}; console.log(value);`);
    server = await createServer({ configFile: false, root, logLevel: "silent", server: {
      host: "127.0.0.1", port: 0, fs: { strict: true, allow: [root] }, watch: null,
    } });
    await server.listen();
    const url = `http://127.0.0.1:${server.httpServer.address().port}`;
    assert.equal((await fetch(url + "/entry.js")).status, 200);
    const result = await fetch(url + "/@fs" + outside);
    const text = await result.text();
    assert.equal(result.status, 403);
    assert.ok(!text.includes("SYNTHETIC_PRIVATE_MARKER"));
  } finally {
    await server?.close();
    await rm(folder, { recursive: true, force: true });
  }
});
