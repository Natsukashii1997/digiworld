// 打包 kit-entry 并输出 kit.json（只渲染组件，不访问任何数据或服务）。
import { build } from "esbuild";
import { writeFile, readdir, copyFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const root = "/Users/nat/Documents/ChatGPT/个人/work/personal-ai-workbench";
const dir = join(root, "docs/design/ui-v15/build");
await build({ absWorkingDir: root, entryPoints: [join(dir, "kit-entry.jsx")], bundle: true, platform: "node", format: "esm", outfile: join(dir, "kit.bundle.mjs"), packages: "external", logLevel: "warning", jsx: "automatic", loader: { ".js": "jsx" } });
const { kit } = await import(pathToFileURL(join(dir, "kit.bundle.mjs")));
const k = kit();
await writeFile(join(dir, "kit.json"), JSON.stringify(k));
const css = (await readdir(join(root, "dist/assets"))).find((f) => f.endsWith(".css"));
await copyFile(join(root, "dist/assets", css), join(dir, "app.css"));
const fails = JSON.stringify(k).match(/渲染失败[^-]*/g) || [];
console.log("kit ok", Object.keys(k).length, "sprites", Object.keys(k.sprites).length, "fails", fails.slice(0, 5));
