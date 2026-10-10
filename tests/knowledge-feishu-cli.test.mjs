import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, chmod, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runFeishuCli, runFeishuWhoami, feishuPrincipalIdentity } from "../server/knowledge-feishu.mjs";

test("CLI 只用固定 codex/user，兼容节点两种成功输出并核验应用用户", async () => {
  const directory = await mkdtemp(join(tmpdir(), "guiji-fake-lark-"));
  const previousPath = process.env.PATH, previousReply = process.env.FEISHU_SYNTHETIC_JSON;
  const previousArgs = process.env.FEISHU_SYNTHETIC_ARGS;
  const executable = join(directory, "lark-cli");
  const argsFile = join(directory, "args.txt");
  try {
    await writeFile(executable, "#!/bin/sh\nprintf '%s\\n' \"$@\" > \"$FEISHU_SYNTHETIC_ARGS\"\nprintf '%s' \"$FEISHU_SYNTHETIC_JSON\"\n");
    await chmod(executable, 0o700);
    process.env.PATH = directory;
    process.env.FEISHU_SYNTHETIC_ARGS = argsFile;
    const node = { space_id:"7160145948494381236", node_token:"wikcnSynthetic", obj_token:"docxSynthetic",
      obj_type:"docx", node_type:"origin", parent_node_token:"", has_child:false };
    process.env.FEISHU_SYNTHETIC_JSON = JSON.stringify(node);
    assert.deepEqual(await runFeishuCli(["wiki", "+node-get", "--node-token", node.node_token]), node);
    assert.deepEqual((await readFile(argsFile, "utf8")).trim().split("\n"),
      ["--profile", "codex", "wiki", "+node-get", "--node-token", node.node_token, "--as", "user"]);
    process.env.FEISHU_SYNTHETIC_JSON = JSON.stringify({ ok:true, identity:"user", data:node });
    assert.deepEqual(await runFeishuCli(["wiki", "+node-get", "--node-token", node.node_token]), node);
    process.env.FEISHU_SYNTHETIC_JSON = JSON.stringify({ ok:true, identity:"bot", data:node });
    await assert.rejects(runFeishuCli(["wiki", "+node-get", "--node-token", node.node_token]),
      (error) => error.code === "FEISHU_WRONG_IDENTITY");
    process.env.FEISHU_SYNTHETIC_JSON = JSON.stringify({ profile:"codex", appId:"cli_aacf58ab61b85beb",
      identity:"user", available:true, onBehalfOf:{ openId:"ou_synthetic_cli" } });
    assert.equal(await runFeishuWhoami(), feishuPrincipalIdentity("cli_aacf58ab61b85beb", "ou_synthetic_cli"));
    assert.deepEqual((await readFile(argsFile, "utf8")).trim().split("\n"),
      ["--profile", "codex", "whoami", "--as", "user"]);
  } finally {
    process.env.PATH = previousPath;
    if (previousReply === undefined) delete process.env.FEISHU_SYNTHETIC_JSON;
    else process.env.FEISHU_SYNTHETIC_JSON = previousReply;
    if (previousArgs === undefined) delete process.env.FEISHU_SYNTHETIC_ARGS;
    else process.env.FEISHU_SYNTHETIC_ARGS = previousArgs;
    await rm(directory, { recursive:true, force:true });
  }
});
