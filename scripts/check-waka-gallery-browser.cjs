const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
let playwright;
try { playwright = require("playwright"); } catch {
  playwright = require(path.join(process.env.USERPROFILE, ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright"));
}
const poems = JSON.parse(fs.readFileSync("data/waka-gallery.json", "utf8")).poems;
const baselineCount = JSON.parse(fs.readFileSync("data/waka-grammar.json", "utf8")).poems.length;
const root = process.env.WAKA_QA_URL || "http://127.0.0.1:8063/";
(async () => {
  const browser = await playwright.chromium.launch({ headless: true });
  try {
    for (const width of [1280, 320]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
      const page = await context.newPage(); const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("console", message => { if (message.type() === "error" && !message.text().includes("net::ERR")) errors.push(message.text()); });
      await page.goto(root);
      await page.getByRole("tab", { name: /^和歌/ }).click();
      await page.getByRole("button", { name: "和歌一覧を見る", exact: true }).click();
      await page.locator(".wgCount").waitFor();
      assert.equal(await page.locator(".wgCount").innerText(), `${baselineCount + poems.length}首`);
      await page.locator(".wgButton--toggle").click();
      for (const poem of poems) {
        await page.locator(".wgFilters").getByRole("button", { name: new RegExp(`^${poem.collection}`) }).click();
        const card = page.locator(".wgGrid button").filter({ hasText: poem.phrases[0] });
        assert.equal(await card.count(), 1, poem.id);
        await card.focus(); await page.keyboard.press("Enter");
        const dialog = page.locator(".wgDialog");
        await dialog.waitFor({ state: "visible" });
        assert.equal(await dialog.locator(".wgTranslation").innerText(), poem.translation);
        assert.ok((await dialog.innerText()).includes(poem.refText));
        assert.ok((await dialog.innerText()).includes(poem.note));
        assert.deepEqual(await dialog.locator(".wgKuYomi").allTextContents(), poem.reading);
        assert.equal(await dialog.getByRole("heading", { name: "この歌で学ぶ語", exact: true }).count(), 0);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: page overflow`);
        assert.ok(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth), `${width}: dialog overflow`);
        await page.keyboard.press("Escape");
        assert.ok(await card.evaluate(node => node === document.activeElement), "focus returns to card");
      }
      assert.deepEqual(errors, []);
      await page.reload();
      await page.getByRole("tab", { name: /^和歌/ }).click();
      await page.getByRole("button", { name: "和歌一覧を見る", exact: true }).click();
      assert.equal(await page.locator(".wgCount").innerText(), `${baselineCount + poems.length}首`);
      await context.close();
      console.log(`OK: ${width}px all ${poems.length} additional poems, collection filters, reading, translation, keyboard, reload, no overflow/errors`);
    }
    const context = await browser.newContext(); const page = await context.newPage();
    await page.route("**/data/waka-gallery.json", route => route.fulfill({ status: 404, body: "missing" }));
    await page.goto(root);
    await page.getByRole("tab", { name: /^和歌/ }).click();
    await page.getByRole("button", { name: "和歌一覧を見る", exact: true }).click();
    assert.equal(await page.locator(".wgCount").innerText(), `${baselineCount}首`);
    await context.close();
    console.log("OK: missing optional data preserves existing gallery");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

