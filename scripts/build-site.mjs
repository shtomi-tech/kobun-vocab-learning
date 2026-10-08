#!/usr/bin/env node
// 試験版（next → Cloudflare Workers Builds）のビルド入口。
// 設定生成 → 検査 → _site への配信物コピーを行い、wrangler.jsonc が _site を静的アセットとして出す。
// 配信物は .github/workflows/pages.yml と同じ。片方だけ直すと本番と試験版で中身がずれる。
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

// Supabase の値は Cloudflare のビルド変数から来る。空のまま出すと同期が黙って止まるので、ここで落とす。
for (const name of ["SUPABASE_URL", "SUPABASE_ANON_KEY"]) {
  if (!process.env[name]) {
    console.error(`ビルド変数 ${name} が未設定です（Workers Builds の Build variables に登録）`);
    process.exit(1);
  }
}

for (const script of ["scripts/write-config.mjs", "scripts/check-all.mjs"]) {
  const result = spawnSync(process.execPath, [join(root, script)], { cwd: root, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const out = join(root, "_site");
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "static/vendor/fsrs"), { recursive: true });
mkdirSync(join(out, "data"), { recursive: true });

const copy = (rel) => cpSync(join(root, rel), join(out, rel));
const copyMatching = (dir, pattern) => {
  for (const name of readdirSync(join(root, dir))) {
    if (pattern.test(name)) copy(`${dir}/${name}`);
  }
};

copy("index.html");
copyMatching("static", /\.(js|css|svg)$/);
copy("static/config.json");
// static 直下だけを拾うので、vendor は明示する。消すと試験版だけ404になる。
copy("static/vendor/fsrs/index.umd.js");
copy("static/vendor/fsrs/LICENSE");
copyMatching("data", /\.json$/);

console.log("Wrote _site");
