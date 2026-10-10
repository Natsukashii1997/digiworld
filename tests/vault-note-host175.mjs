// 候选：根代理认领后放到隔离副本 tests/vault-note-host175.mjs。
// 本文件未运行；不新增产品入口，不新增服务，不改变 CSP，完全复用真实组件。
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { build } from 'esbuild';

const HOST_ID = 'synthetic-vault-note-host175';
const HOST_LABEL = '合成组件宿主：随手记 Vault 对话框';
let bundlePromise;

const source = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { VaultWriteEntry } from './src/VaultWriteUI.jsx';

let mounted;
window.__syntheticVaultNote175 = {
  mount(noteId) {
    if (mounted?.element.isConnected && mounted.noteId === noteId) return;
    if (mounted) {
      mounted.root.unmount();
      mounted.element.remove();
    }
    const element = document.createElement('section');
    element.id = '${HOST_ID}';
    element.setAttribute('aria-label', '${HOST_LABEL}');
    element.style.margin = 'var(--s-4)';
    document.body.append(element);
    const root = createRoot(element);
    // 不复制对话框逻辑/错误/请求函数，使用真实 Entry 及其内部 Dialog。
    // 不套 StrictMode，匹配生产构建的 effect 语义。
    root.render(React.createElement(VaultWriteEntry, { noteId }));
    mounted = { root, element, noteId };
  },
  dispose() {
    if (!mounted) return;
    mounted.root.unmount();
    mounted.element.remove();
    mounted = null;
  }
};
`;

async function bundle() {
  if (!bundlePromise) {
    const projectRoot = resolve(import.meta.dirname, '..');
    bundlePromise = build({
      absWorkingDir: projectRoot,
      stdin: {
        contents: source,
        resolveDir: projectRoot,
        sourcefile: 'synthetic-vault-note-host175.jsx',
        loader: 'jsx',
      },
      outfile: 'test-results/synthetic-vault-note-host175/host.js',
      bundle: true,
      platform: 'browser',
      format: 'iife',
      jsx: 'automatic',
      define: { 'process.env.NODE_ENV': '"production"' },
      write: false,
      sourcemap: false,
      minify: false,
      logLevel: 'silent',
    }).then(({ outputFiles }) => {
      const js = outputFiles.find(file => file.path.endsWith('/host.js'));
      const css = outputFiles.find(file => file.path.endsWith('/host.css'));
      assert.ok(js, '真实 VaultWriteEntry 浏览器 bundle 必须存在');
      assert.ok(css, '真实组件 CSS 必须存在，不得以测试样式替换组件样式');
      assert.equal(outputFiles.length, 2, '只允许内存 JS/CSS 两个输出；新增资源须显式处理');
      return { js: js.text, css: css.text };
    });
  }
  return bundlePromise;
}

export async function installNoteVaultHost175(page, appUrl) {
  const app = new URL(appUrl);
  assert.equal(app.protocol, 'http:');
  assert.equal(app.hostname, '127.0.0.1');
  assert.ok(app.port && app.port !== '5178', '宿主只允许本次临时 fixture 端口');
  const origin = app.origin;
  const jsUrl = new URL('/__synthetic-vault-note175/host.js', origin).href;
  const cssUrl = new URL('/__synthetic-vault-note175/host.css', origin).href;
  const compiled = await bundle();
  const serveJs = route => route.fulfill({ contentType: 'text/javascript', body: compiled.js });
  const serveCss = route => route.fulfill({ contentType: 'text/css', body: compiled.css });
  await page.route(jsUrl, serveJs);
  await page.route(cssUrl, serveCss);

  return {
    async mount(noteId) {
      assert.match(noteId, /^[a-zA-Z0-9_-]{1,100}$/);
      const current = new URL(page.url());
      assert.equal(current.origin, origin, '只在本次 fixture 精确 origin 挂载');
      assert.equal(current.hash, '#notes', '产品 notes 页已完成取消入口断言后才挂测试宿主');
      const loaded = await page.evaluate(() => !!window.__syntheticVaultNote175);
      if (!loaded) {
        // 保留产品 script-src 'self'，不使用 inline，也不 bypassCSP。
        await page.addStyleTag({ url: cssUrl });
        await page.addScriptTag({ url: jsUrl });
      }
      await page.evaluate(id => window.__syntheticVaultNote175.mount(id), noteId);
      const host = page.locator('#' + HOST_ID);
      const entry = host.getByRole('button', { name: '写入 Obsidian：' + noteId, exact: true });
      await entry.waitFor();
      assert.equal(await host.count(), 1, '只有一个测试宿主');
      assert.equal(await entry.count(), 1, '只有一个真实 Note Entry');
      return entry;
    },
    async dispose() {
      if (!page.isClosed()) {
        await page.evaluate(() => window.__syntheticVaultNote175?.dispose());
        await page.unroute(jsUrl, serveJs);
        await page.unroute(cssUrl, serveCss);
      }
    },
  };
}
