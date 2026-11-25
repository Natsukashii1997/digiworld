// 资产卡标题加大的前后对比：对开发页 5191（代理本机 5178 真实数据）截 Prompt 页 1440 宽、2 倍清晰度。用法：node capture.mjs <输出.png>
import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await p.goto("http://127.0.0.1:5191/#assets");
await p.waitForSelector(".page-assets .ac2-body h3");
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(1200);
const cards = p.locator(".page-assets .ac2-body h3");
const a = await cards.nth(0).boundingBox(), c = await cards.nth(2).boundingBox();
await p.screenshot({ path: process.argv[2], clip: { x: a.x - 40, y: a.y - 300, width: (c.x + 360) - (a.x - 40), height: 560 } });
await b.close();
