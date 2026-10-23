// 视觉稿预览服务：只读，只监听 127.0.0.1，只提供 docs/design/ 与 src/ 下的静态文件。
// /collection-media/ 转给 5178 正式服务（GET），让收藏封面同源显示——服务端带
// Cross-Origin-Resource-Policy: same-origin，直接打开 HTML 文件读不到封面。
// 用法：node docs/design/ui-v18/build/serve.mjs（默认端口 5186，可用 PORT 指定）
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../../../..");
const ALLOW = ["/docs/design/", "/src/"];
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml" };

export function serve(port = 0) {
  const server = http.createServer((req, res) => {
    if (req.method !== "GET") return res.writeHead(405).end();
    const url = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
    if (url.startsWith("/collection-media/")) {
      http
        .get({ host: "127.0.0.1", port: 5178, path: req.url }, (up) => {
          res.writeHead(up.statusCode, { "content-type": up.headers["content-type"] || "application/octet-stream" });
          up.pipe(res);
        })
        .on("error", () => res.writeHead(502).end());
      return;
    }
    const file = path.join(root, url);
    if (!ALLOW.some((p) => url.startsWith(p)) || !file.startsWith(root + path.sep)) return res.writeHead(403).end();
    fs.readFile(file, (err, buf) => {
      if (err) return res.writeHead(404).end();
      res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
      res.end(buf);
    });
  });
  return new Promise((ok) => server.listen(port, "127.0.0.1", () => ok(server)));
}

if (process.argv[1] === import.meta.filename) {
  const server = await serve(Number(process.env.PORT || 5186));
  console.log(`视觉稿预览：http://127.0.0.1:${server.address().port}/docs/design/ui-v18/资产仓库-B.html`);
}
