// 派单173切片A：六状态、实际媒体、评分/快照、JSON/HTML、伙伴/复制。仅合成隔离库。
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { reverseV16Fixture, fixtureRecipe } from "./reverse-v16-fixture.mjs";
import { axe, settle } from "./ui-v14-checks.mjs";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE ||
    "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const browser = await chromium.launch(),
  errors = [];
let app;
const button = (p, name) => p.getByRole("button", { name, exact: true });
async function open(width, options = {}) {
  app = await reverseV16Fixture(options);
  const c = await browser.newContext({
      viewport: { width, height: 1000 },
      timezoneId: "Asia/Shanghai",
    }),
    p = await c.newPage();
  p.setDefaultTimeout(10000);
  p.on("pageerror", (e) => errors.push(e.message));
  await p.addInitScript(() => {
    window.syntheticCopies = [];
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async (s) => {
          if (window.syntheticCopyFail) throw Error("合成失败");
          window.syntheticCopies.push(s);
        },
      },
    });
  });
  await p.route("**/*", (r) => {
    assert.equal(
      new URL(r.request().url()).origin,
      new URL(app.url).origin,
      "禁止任何外部请求",
    );
    return r.continue();
  });
  await p.goto(app.url + "/#references");
  await p.locator(".bench").waitFor();
  return p;
}
async function close(p) {
  await p.context().close();
  await app.close();
  app = null;
}
async function geometry(p, label) {
  await settle(p);
  assert.deepEqual(
    await p.evaluate(() => {
      const bad = [];
      if (document.documentElement.scrollWidth > innerWidth) bad.push("整页");
      for (const e of document.querySelectorAll("main,main *")) {
        if (
          e.closest("svg,.sr-only") ||
          !e.checkVisibility({ checkOpacity: true })
        )
          continue;
        const r = e.getBoundingClientRect(),
          s = getComputedStyle(e);
        if (!r.width && !r.height) continue;
        if (
          !e.closest(
            ".page-references.v16 .rail-list,.page-references.v16 .rail-filter",
          ) &&
          (r.left < -0.5 || r.right > innerWidth + 0.5)
        )
          bad.push(e.tagName + "." + e.className);
        if (
          ["hidden", "clip"].includes(s.overflowX) &&
          e.scrollWidth > e.clientWidth + 1
        )
          bad.push("横裁切:" + e.className);
        if (
          ["hidden", "clip"].includes(s.overflowY) &&
          e.scrollHeight > e.clientHeight + 1
        )
          bad.push("纵裁切:" + e.className);
      }
      return bad;
    }),
    [],
    label,
  );
  for (const e of await p
    .locator(
      "main button,main a,main input,main select,main textarea,main summary",
    )
    .all()) {
    if (!(await e.isVisible())) continue;
    const r = await e.evaluate((e) => {
      const box = (
        ["file", "checkbox", "radio"].includes(e.type) ? e.closest("label") : e
      )?.getBoundingClientRect();
      return box ? { width: box.width, height: box.height } : null;
    });
    assert.ok(
      r && r.width >= 44 && r.height >= 44,
      label +
        " " +
        (await e.getAttribute("aria-label")) +
        " " +
        JSON.stringify(r),
    );
  }
}
try {
  for (const width of [1440, 390, 320]) {
    const p = await open(width);
    for (const [title, id] of [
      ["SUMMER NOISE 音乐节海报", "0415"],
      ["Linear 更新日志页", "0414"],
      ["炉子 · 上下文接力", "0416"],
      ["产品发布帖的节奏", "0412"],
      ["野口勇展览海报", "0408"],
    ]) {
      await p
        .getByRole("radio", { name: "打开逆向记录 " + title, exact: true })
        .click();
      await p.getByRole("heading", { name: title, level: 2 }).waitFor();
      await p.waitForLoadState("networkidle");
      assert.equal(await p.locator(".bench [role=alert]").count(), 0);
      await geometry(p, width + " " + id);
      await axe(p, width + " " + id);
      if (id === "0414") {
        const rects = await p.locator(".await").evaluate((e) => {
          const a = e.querySelector("svg").getBoundingClientRect();
          const b = e.querySelector("span").getBoundingClientRect();
          return { iconBottom: a.bottom, textTop: b.top };
        });
        assert.ok(rects.iconBottom <= rects.textTop, "等待图标与文字不重叠");
      }
      if (width === 390 && (id === "0414" || id === "0412" || id === "0416")) {
        await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        const current = p.locator(".bench .reverse-step-slot > button");
        assert.equal(await current.count(), 1, "每一步只有一个真实主动作");
        const box = await current.evaluate(e => ({ position: getComputedStyle(e).position, top: e.getBoundingClientRect().top, bottom: e.getBoundingClientRect().bottom, height: e.getBoundingClientRect().height }));
        assert.equal(box.position, "fixed");
        assert.ok(box.top >= 0 && box.bottom <= 1000 && box.height >= 52, "滚动后当前动作仍位于安全区内");
        if (id === "0416") {
          await current.click();
          await p.getByRole("dialog").waitFor();
          await p.getByRole("button", { name: "关闭", exact: true }).click();
        }
      }
      if (id === "0414" || id === "0412") {
        const picker = p.locator(".re-launch .pick");
        assert.equal(
          await picker.getByRole("radio").first().getAttribute("aria-checked"),
          "true",
        );
        assert.match(
          await picker.getByRole("radio").first().innerText(),
          /机械邪龙兽/,
        );
        await picker.getByRole("radio").first().press("End");
        assert.equal(
          await picker.getByRole("radio").last().getAttribute("aria-checked"),
          "true",
        );
        await picker.getByRole("radio").last().press("Home");
        await p.locator(".re-launch .pack summary").click();
        const preview = await p.locator(".re-launch pre").innerText();
        await p.locator(".re-launch .go").click();
        assert.equal(
          await p.evaluate(() => window.syntheticCopies.at(-1)),
          preview,
          "预览与复制逐字相等",
        );
        if (id === "0414")
          assert.ok(
            !preview.includes("https://linear.app") &&
              !preview.includes("reverse-media/"),
            "只凭配方复刻包不夹原件",
          );
      }
    }
    if (width === 1440) {
      await p
        .getByRole("radio", {
          name: "打开逆向记录 SUMMER NOISE 音乐节海报",
          exact: true,
        })
        .click();
      const range = p.getByRole("slider", { name: "拖动对照手柄" });
      await range.press("ArrowRight");
      assert.equal(await range.inputValue(), "51");
      assert.equal(await p.locator(".pair.overlay").count(), 1);
      const sliderIcon = await p.locator(".slider svg").evaluate(e=>e.outerHTML);
      await p.emulateMedia({ reducedMotion: "reduce" });
      await p.locator(".pair.reduced").waitFor();
      assert.equal(await p.locator(".slider svg").evaluate(e=>e.outerHTML),sliderIcon,"减少动态效果撤下操作但保持装饰SVG字节稳定");
      assert.equal(await p.locator(".slider").isVisible(),false);
      assert.equal(await range.count(), 0);
      await p
        .locator(".compare-switch")
        .getByRole("button", { name: "复刻", exact: true })
        .click();
      assert.equal(
        await p.locator(".pair").getAttribute("data-side"),
        "replica",
      );
      await p.emulateMedia({ reducedMotion: "no-preference" });
      await p.getByRole("radio", { name: "构图 5 分" }).press("ArrowLeft");
      assert.equal(
        await p
          .getByRole("radio", { name: "构图 4 分" })
          .getAttribute("aria-checked"),
        "true",
      );
      await button(p, "确认：未达标").click();
      await p.getByText("复刻未达标，保留本次记录", { exact: true }).waitFor();
      assert.equal(
        (await app.repository.read()).reverseRecords[0].replicas.at(-1).total,
        85,
      );
      assert.equal(await p.locator(".forge2").count(), 0, "失败不能炼成");
    }
    if (width === 390) {
      await p.emulateMedia({ reducedMotion: "reduce" });
      await p.waitForFunction(() =>
        document.getAnimations().every((a) => a.playState !== "running"),
      );
      await geometry(p, "运行中reduce");
    }
    await close(p);
  }
  const p = await open(390, { empty: true });
  await geometry(p, "空态");
  await axe(p, "空态");
  await button(p, "投入参照物").click();
  const d = p.getByRole("dialog", { name: "投入参照物" });
  await d.getByLabel("标题", { exact: true }).fill("合成文字");
  await d
    .getByLabel("贴文字", { exact: true })
    .fill("原件正文。\ntoken: synthetic-private-value");
  await d.getByRole("button", { name: "投入参照物", exact: true }).click();
  await p.getByRole("heading", { name: "合成文字", level: 2 }).waitFor();
  await p.locator(".re-launch .pack summary").click();
  assert.ok(
    !(await p.locator(".re-launch pre").innerText()).includes(
      "synthetic-private-value",
    ),
  );
  await p.getByText("回收回复与产物", { exact: true }).click();
  await button(p, "贴回复 · 解析配方").click();
  const reply = p.getByRole("dialog");
  await reply.getByLabel("伙伴完整回复").fill("不是JSON");
  await button(reply, "解析并保存配方").click();
  await reply.getByRole("alert").waitFor();
  assert.equal(
    (await app.repository.read()).reverseRecords[0].recipeReply,
    "不是JSON",
    "首败原始回复保留",
  );
  await reply
    .getByLabel("伙伴完整回复")
    .fill(JSON.stringify({ recipe: fixtureRecipe("TXT") }));
  await button(reply, "解析并保存配方").click();
  await p.getByRole("heading", { name: /配方/, level: 2 }).waitFor();
  await button(p, "投入复刻产物").click();
  await p
    .getByRole("dialog")
    .getByLabel("实际正文或HTML代码块")
    .fill("真实合成复刻正文");
  await button(p.getByRole("dialog"), "保存产物").click();
  assert.equal(
    await button(p, "确认：未达标").isDisabled(),
    true,
    "未打完不得确认",
  );
  for (const name of ["结构", "语气", "手法"])
    await p.getByRole("radio", { name: name + " 5 分" }).click();
  await button(p, "确认：达标").click();
  await p.getByText("复刻已确认达标", { exact: true }).waitFor();
  await button(p, "标为已验证").click();
  await p.getByText("配方已标为已验证", { exact: true }).waitFor();
  assert.ok(
    (await app.repository.read()).reverseRecords[0].recipe.blocks.every(
      (b) => b.mark === "已验证",
    ),
  );
  assert.equal(await p.locator(".forge2").count(), 1, "标记晋升不破坏达标证据");
  await geometry(p, "确认达标");
  await axe(p, "确认达标");
  await close(p);
  // B真实IMG炼成；同一次revision产生完整版本和forge，旧资产页面结构沿用。
  {
    const p = await open(1440);
    await button(p, "确认：达标").click();
    await p.getByText("复刻已确认达标", { exact: true }).waitFor();
    const before = (await app.repository.read()).revision;
    await button(p, "炼成 Skill").click();
    await p
      .getByText("Skill 已炼成，固定版本已存到资产仓库", { exact: true })
      .waitFor();
    const s = await app.repository.read(),
      r = s.reverseRecords.find((x) => x.id === "0415"),
      a = s.assets.find((x) => x.id === r.forge.assetId);
    assert.equal(s.revision, before + 1, "Asset版本和forge同一次revision");
    assert.equal(a.versions[0].id, r.forge.versionId);
    assert.equal(a.versions[0].mediaManifest.length, 2);
    assert.ok(a.versions[0].files.some((f) => f.path === "SKILL.md"));
    assert.equal(
      await button(p, "炼成 Skill").count(),
      0,
      "已炼成不能重复生成",
    );
    await button(p, "查看 Skill").click();
    await p.locator(".page-assets").waitFor();
    await button(p, "复制本机安装口令").click();
    await p.getByText(/口令已复制 · 未验证安装/).waitFor();
    assert.ok(
      (await p.evaluate(() => window.syntheticCopies.at(-1))).includes(
        "/packages/",
      ),
    );
    await close(p);
  }
  {
    const p = await open(1440);
    await p.locator("summary").filter({ hasText: "保存参考与回收区" }).click();
    await button(p, "保存参考").click();
    const title = "长名称".repeat(70),
      note = "长笔记".repeat(300);
    const dialog = p.getByRole("dialog", { name: "保存参考", exact: true });
    await dialog.getByLabel("参考名称", { exact: true }).fill(title);
    await dialog
      .getByLabel(/^来源链接/)
      .fill("https://fixture.test/long");
    await dialog.getByLabel("值得学习的地方", { exact: true }).fill(note);
    await button(dialog, "保存参考").click();
    await p.getByText("参考资料已保存", { exact: true }).waitFor();
    const saved = (await app.repository.read()).references.find(
      (r) => r.title === title,
    );
    assert.equal(saved.note, note, "旧参考能力不被新参照120/500上限截断");
    await close(p);
  }
  // REA第一阶段：全部路径/素材均合成，不运行REA或访问目标网站。
  for (const width of [1440, 390, 320]) {
    const p = await open(width, { empty: true });
    const targetPath = app.directory + "/Fixture.app";
    await fs.mkdir(targetPath + "/Contents/Resources", { recursive: true });
    await fs.writeFile(targetPath + "/Contents/Resources/app.asar", "synthetic-asar");
    await button(p, "投入参照物").click();
    const d = p.getByRole("dialog", { name: "投入参照物" });
    await d.locator("select").first().selectOption("FN");
    assert.equal(await d.getByRole("radio", { name: "截图/文字", exact: true }).isChecked(), true);
    await d.getByRole("radio", { name: "本机软件（REA）", exact: true }).check();
    await d.getByLabel("本机绝对路径", { exact: true }).fill(app.directory + "/missing.app");
    await button(d, "检查路径").click();
    await d.getByRole("status").filter({ hasText: "目标不存在" }).waitFor();
    await d.getByLabel("本机绝对路径", { exact: true }).fill(targetPath);
    await button(d, "检查路径").click();
    await d.getByRole("status").filter({ hasText: "尚未运行REA" }).waitFor();
    await d.getByLabel("想弄懂的功能", { exact: true }).fill("切换页签时保留未提交输入");
    await d.getByLabel("标题", { exact: true }).fill("REA合成功能");
    assert.equal(await d.locator("form").evaluate(e => e.checkValidity()), false, "未授权不能提交");
    await d.getByLabel("我拥有或获准分析该软件", { exact: true }).check();
    await d.getByLabel("本机绝对路径", { exact: true }).focus();
    assert.notEqual(await d.getByLabel("本机绝对路径", { exact: true }).evaluate(e=>getComputedStyle(e).outlineStyle), "none");
    // Native text fields intentionally scroll their contents; check their outer hit boxes and value instead.
    assert.deepEqual(await d.evaluate(root => {
      const bad=[];
      if(document.documentElement.scrollWidth>innerWidth)bad.push("整页越界");
      for(const e of root.querySelectorAll("input,select,textarea,button")) {
        if(!e.checkVisibility())continue;
        const box=(["radio","checkbox","file"].includes(e.type)?e.closest("label"):e).getBoundingClientRect();
        if(box.left<0 || box.right>innerWidth || box.width<44 || box.height<44)bad.push(e.outerHTML.slice(0,80));
      }
      return bad;
    }), [], "REA录入外部几何与44px"+width);
    assert.equal(await d.getByLabel("本机绝对路径",{exact:true}).inputValue(),targetPath);
    await axe(p, "REA录入" + width);
    await fs.mkdir(new URL("../work/rea448", import.meta.url), { recursive: true });
    if (width !== 320) await p.screenshot({ path: fileURLToPath(new URL(`../work/rea448/rea-input-${width}.png`, import.meta.url)), fullPage: true });
    await button(d, "投入参照物").click();
    await p.getByRole("heading", { name: "REA合成功能", level: 2 }).waitFor();
    const picker=p.locator(".re-launch .pick"), radios=picker.getByRole("radio");
    for (const i of [2,3,4]) { assert.equal(await radios.nth(i).isDisabled(),true); assert.match(await radios.nth(i).innerText(),/无法访问本机 MCP/); }
    await radios.nth(0).focus();await p.keyboard.press("ArrowRight");assert.equal(await radios.nth(1).getAttribute("aria-checked"),"true");
    await p.keyboard.press("ArrowRight");assert.equal(await radios.nth(0).getAttribute("aria-checked"),"true");
    await p.locator(".re-launch .pack summary").click();
    const prompt=await p.locator(".re-launch pre").innerText();assert.match(prompt,/record-and-continue/);assert.match(prompt,/detail.*summary/);assert.match(prompt,/没有 REA 工具就停下/);
    await p.getByRole("button", {name:/把逆推任务交给/}).click();
    assert.equal(await p.evaluate(()=>window.syntheticCopies.at(-1)),prompt);
    await p.getByText("回收回复与产物", { exact: true }).click();
    await button(p,"贴回复 · 解析配方").click();
    const evidenceId="ev_"+"0123456789abcdef".repeat(4);
    const recipe=fixtureRecipe("FN");recipe.blocks[0].evidence=[evidenceId];recipe.blocks[1].evidence=["ev_"+"abcdef0123456789".repeat(4)];
    recipe.unknowns=[{id:"U-01",text:"未获得服务器实现证据，功能范围仅限当前界面"}];
    await p.getByRole("dialog").getByLabel("伙伴完整回复").fill(JSON.stringify({recipe}));
    await button(p.getByRole("dialog"),"解析并保存配方").click();
    await p.getByRole("heading",{name:"未知项（1）"}).waitFor();
    const evidence=p.getByRole("button",{name:"复制证据编号 "+evidenceId,exact:true});
    assert.equal(await evidence.innerText(),"证据 01234567");await evidence.click();
    assert.equal(await p.evaluate(()=>window.syntheticCopies.at(-1)),evidenceId);
    await p.locator(".re-launch details[open] summary").click();
    await geometry(p,"REA回贴"+width);await axe(p,"REA回贴"+width);
    if(width!==320) await p.screenshot({path:fileURLToPath(new URL(`../work/rea448/rea-recipe-${width}.png`,import.meta.url)),fullPage:true});
    await p.reload();await p.getByRole("heading",{name:"未知项（1）"}).waitFor();
    assert.equal((await app.repository.read()).reverseRecords[0].material.target.path,targetPath);
    if(width===1440){
      await p.getByText("回收回复与产物", {exact:true}).click();
      await button(p,"投入复刻产物").click();
      await p.getByRole("dialog").getByLabel("实际正文或HTML代码块").fill("按配方实现页签保留草稿；逐项合成验收通过");
      await button(p.getByRole("dialog"),"保存产物").click();
      for(const name of ["交互细节","文案"])await p.getByRole("radio",{name:name+" 5 分",exact:true}).click();
      for(const c of recipe.blocks.flatMap(b=>b.cases||[]))await p.getByLabel(c.id+" 验收结果",{exact:true}).selectOption("true");
      await button(p,"确认：达标").click();await p.getByText("复刻已确认达标",{exact:true}).waitFor();
      await button(p,"炼成 Skill").click();await p.getByText("Skill 已炼成，固定版本已存到资产仓库",{exact:true}).waitFor();
      const saved=await app.repository.read(), record=saved.reverseRecords[0], asset=saved.assets.find(a=>a.id===record.forge.assetId);
      assert.match(asset.versions[0].content,/取证方式：REA/);assert.match(asset.versions[0].content,/U-01/);
    }
    {
      await button(p,"投入参照物").click();const web=p.getByRole("dialog");await web.locator("select").first().selectOption("FN");await web.getByRole("radio",{name:"本机软件（REA）",exact:true}).check();
      await web.getByLabel("目标类型").selectOption("web");await web.getByLabel(/^网站网址/).fill("https://example.test/feature");
      const help=web.locator(".rea-web-help");assert.match(await help.innerText(),/CDP 端口 9222/);assert.match(await help.innerText(),/独立资料目录/);
      const debugCommand='open -na "Google Chrome" --args --remote-debugging-port=9222 --user-data-dir="$HOME/.rea-chrome"';
      await button(web,"复制 Chrome 调试命令").click();assert.equal(await p.evaluate(()=>window.syntheticCopies.at(-1)),debugCommand);assert.equal(await web.count(),1,"复制不提交表单");
      // 命令在三宽下保持完整可读。
      assert.deepEqual(await help.evaluate(root=>[...root.querySelectorAll("*")].filter(e=>e.checkVisibility()).filter(e=>{const r=e.getBoundingClientRect();return r.left<0||r.right>innerWidth||e.scrollWidth>e.clientWidth+1}).map(e=>e.tagName)),[],"网站提示不能横向截断");
      await axe(p,"REA网站录入"+width);

      await web.getByLabel("想弄懂的功能",{exact:true}).fill("只看已打开的功能");await web.getByLabel("标题",{exact:true}).fill("REA网站");await web.getByLabel("我拥有或获准分析该软件",{exact:true}).check();await button(web,"投入参照物").click();
      await p.getByRole("heading",{name:"REA网站",level:2}).waitFor();await p.locator(".re-launch .pack summary").click();const webTask=await p.locator(".re-launch pre").innerText();assert.match(webTask,/list_browser_targets/);assert.ok(webTask.includes(debugCommand));assert.ok(webTask.includes('"cdp_endpoint":"http://127.0.0.1:9222"'));
    }
    await close(p);
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS 173 A+B 六状态/3203901440/44px/axe/伙伴键盘/逐字复制/过滤/滑块/reduce/未打完/失败达标/真实IMG炼成/固定媒体ZIP",
  );
} finally {
  await browser.close();
  if (app) await app.close();
}
