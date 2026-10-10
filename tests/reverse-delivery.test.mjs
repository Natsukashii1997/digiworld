// 派单173，真实HTTP和固定ZIP仅用合成隔离库，禁止宿主应用/外部网络。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { reverseV16Fixture } from "./reverse-v16-fixture.mjs";
import { parse, stringify } from "../src/serialization.js";
import { current, revise } from "../src/store.js";
import { digest } from "../server/repository.mjs";
import { buildSkillZip } from "../src/skill-package.js";
test("逆向Skill完整本机交付HTTP固定版本/全部图片/重复下载哈希一致；缺图拒整包；门禁仍守护", async () => {
  const app = await reverseV16Fixture();
  try {
    const session = await (
      await fetch(app.url + "/api/session", {
        headers: { "x-workbench-client": "1" },
      })
    ).json();
    const call = async (path, data, headers = {}) => {
      const r = await fetch(app.url + "/api" + path, {
        method: "POST",
        headers: {
          "x-workbench-token": session.token,
          "content-type": "application/json",
          ...headers,
        },
        body: stringify(data),
      });
      return { status: r.status, data: parse(await r.text()) };
    };
    const state = await app.repository.read(),
      a = state.assets[0],
      v = current(a),
      m = v.mediaManifest[0];
    assert.throws(
      () => buildSkillZip(v.files),
      /媒体|缺图/,
      "旧同步纯files入口明确拒绝缺图，而不是造残包",
    );
    assert.equal(
      (
        await call(
          "/reverse/media/read",
          { path: m.file, size: m.size, sha256: m.sha256, type: m.type },
          { "x-workbench-token": "INVALID" },
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await call(
          "/reverse/media/read",
          { path: m.file, size: m.size, sha256: m.sha256, type: m.type },
          { origin: "https://synthetic-outside.invalid" },
        )
      ).status,
      403,
    );
    const next = await call("/deliveries", { assetId: a.id, versionId: v.id });
    assert.equal(next.status, 200);
    const first = new Uint8Array(
        await (await fetch(next.data.url)).arrayBuffer(),
      ),
      zip = unzipSync(first);
    assert.equal(digest(first), next.data.zipHash);
    assert.equal(
      Object.keys(zip).length,
      v.files.length + v.mediaManifest.length,
    );
    for (const entry of v.mediaManifest) {
      assert.equal(zip[entry.path].length, entry.size);
      assert.equal(digest(zip[entry.path]), entry.sha256);
    }
    await app.repository.updateAssets(
      (xs) =>
        xs.map((x) =>
          x.id === a.id ? revise(x, { title: "修改后的合成版本" }) : x,
        ),
      { expectedRevision: state.revision },
    );
    await fs.unlink(join(app.repository.directory, m.file));
    const fixed = new Uint8Array(
      await (await fetch(next.data.url)).arrayBuffer(),
    );
    assert.equal(
      digest(fixed),
      next.data.zipHash,
      "旧链接固定已展开字节，不受新版本和实体删除影响",
    );
    const refused = await call("/deliveries", {
      assetId: a.id,
      versionId: current(
        (await app.repository.read()).assets.find((x) => x.id === a.id),
      ).id,
    });
    assert.notEqual(refused.status, 200);
    assert.match(refused.data.error, /媒体|不存在|不可/);
    assert.equal(
      (await app.repository.read()).reverseRecords.find((r) => r.id === "0408")
        .forge.versionId,
      v.id,
      "炼成指针仍绑定原版本",
    );
  } finally {
    await app.close();
  }
});
