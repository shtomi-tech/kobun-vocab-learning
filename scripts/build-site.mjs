// 公開用の静的ファイルを _site/ に集める。GitHub Pages（.github/workflows/pages.yml）と
// Cloudflare Workers（wrangler.jsonc の build.command）の両方がこの一覧を使う。
// static/config.json は scripts/write-config.mjs が先に書き出しておく。
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const out = "_site";
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "static/vendor/fsrs"), { recursive: true });
mkdirSync(join(out, "data"), { recursive: true });

const copy = (from, to = from) => cpSync(from, join(out, to));
copy("index.html");
copy(".nojekyll");
// サブディレクトリは拾わない。vendor は下で個別に写す（漏らすと本番だけ404になる）。
for (const name of readdirSync("static")) {
  if (/\.(js|css|svg)$/u.test(name)) copy(join("static", name));
}
if (!existsSync("static/config.json")) throw new Error("static/config.json is missing: run scripts/write-config.mjs first");
copy("static/config.json");
copy("static/vendor/fsrs/index.umd.js");
copy("static/vendor/fsrs/LICENSE");
for (const name of readdirSync("data")) {
  if (name.endsWith(".json")) copy(join("data", name));
}
console.log(`Wrote ${out}/`);
