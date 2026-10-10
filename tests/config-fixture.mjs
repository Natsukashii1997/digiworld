import {authorizeCapability} from './capability-fixture.mjs';
import { writeFile, chmod } from "node:fs/promises";
import { join } from "node:path";
import { copyFixture } from "./copy-fixture.mjs";

export const configText =
  '# 中文与私有字段\nmodel = "PRIVATE_CONFIG_SENTINEL"\n[tui]\nanimations = true # 保留注释\n';
export async function configFixture() {
  const app = await copyFixture({ staticRoot: process.env.GUIJI_TEST_DIST });
  await authorizeCapability(app,'agent');
  const configPath = join(app.home, "config.toml");
  await writeFile(configPath, configText);
  await chmod(configPath, 0o600);
  return { ...app, configPath };
}
