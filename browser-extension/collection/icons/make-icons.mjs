// 把同目录 icon.svg 渲染成插件图标 icon-16/32/48/128.png，manifest 的 icons 与 action.default_icon 引用它们。
// 用项目已有的 Playwright 出图，不加依赖。用法：node browser-extension/collection/icons/make-icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';

const DIR = import.meta.dirname;
const svg = fs.readFileSync(path.join(DIR, 'icon.svg'), 'utf8');

const browser = await chromium.launch();
for (const size of [16, 32, 48, 128]) {
  const page = await browser.newPage({viewport: {width: size, height: size}, deviceScaleFactor: 1});
  await page.setContent(`<style>html,body{margin:0;background:transparent}</style><img width="${size}" height="${size}" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}">`);
  await page.locator('img').evaluate(img => img.decode());
  await page.screenshot({path: path.join(DIR, `icon-${size}.png`), omitBackground: true});
  await page.close();
}
await browser.close();
console.log(`图标已生成：${DIR}`);
