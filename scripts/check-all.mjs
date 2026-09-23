#!/usr/bin/env node
// 手元とCI（.github/workflows/pages.yml）で同じ検査一覧を実行する入口。
// 検査を追加したら、ここに1行足す。最初の失敗で止まる。
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

const syntaxChecks = [
  "static/mode-vocab.js",
  "static/example-source.js",
  "static/meaning-guard.js",
  "static/study-plan.js",
  "static/study-time.js",
  "static/example-parts.js",
  "static/choice-builder.js",
  "static/recall-grade.js",
  "static/waka-gallery.js",
];

const scripts = [
  "check-vocab-runtime.cjs",
  "check-data.mjs",
  "check-set-choices.mjs",
  "check-context-choices.mjs",
  "check-waka-data.mjs",
  "check-waka-choices.mjs",
  "check-effective-examples.mjs",
  "check-waka-candidates.mjs",
  "check-waka-display.mjs",
  "check-waka-grammar.mjs",
  "check-meaning-example-ui.cjs",
  "check-example-source.mjs",
  "check-srs.cjs",
  "check-recall-grade.cjs",
  "check-fsrs-vendor.cjs",
  "check-study-plan.cjs",
  "check-set-progress.cjs",
  "check-vocab-goal-ui.cjs",
  "check-set-03.mjs",
  "check-set-06.mjs",
  "check-set-07.mjs",
  "check-set-08.mjs",
  "check-set-09.mjs",
  "check-set-10.mjs",
  "check-set-11.mjs",
  "check-set-12.mjs",
  "check-set-13.mjs",
  "check-set-14.mjs",
  "check-set-15.mjs",
  "check-set-16.mjs",
];

const run = (label, args) => {
  const result = spawnSync(process.execPath, args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) {
    process.stdout.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    console.error(`\nFAIL: ${label}`);
    process.exit(1);
  }
  const last = (result.stdout ?? "").trim().split("\n").pop();
  console.log(`ok  ${label}${last ? `  — ${last}` : ""}`);
};

for (const file of syntaxChecks) run(`node --check ${file}`, ["--check", file]);
for (const script of scripts) run(script, [`scripts/${script}`]);
console.log(`\nOK: ${syntaxChecks.length + scripts.length} checks`);
