import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 开发页面用 5179，API 转给已运行的本机服务（默认 5178，可用 WORKBENCH_API_PORT 指向隔离实例）。
const api = `http://127.0.0.1:${Number(process.env.WORKBENCH_API_PORT || 5178)}`;
const proxy = {
  target: api,
  changeOrigin: true,
  configure(server) {
    // 只把开发页面自身的 Origin 换成服务地址；其他来源原样转发，仍由服务拒绝。
    server.on("proxyReq", (proxyRequest, request) => {
      const own = `http://127.0.0.1:${request.socket.localPort}`;
      if (request.headers.origin === own) proxyRequest.setHeader("origin", api);
    });
  },
};
export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5179,
    strictPort: true,
    proxy: { "/api": proxy, "/packages": proxy, "/collection-media": proxy },
  },
});
