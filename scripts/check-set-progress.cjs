const assert = require("node:assert/strict");
const KobunSetProgress = require("../static/set-progress.js");

function words(n) {
  return Array.from({ length: n }, (_, i) => ({ id: `w${i + 1}` }));
}

// 1. 空のunitsは未着手、learnedCount: 0
{
  const set = { words: words(4) };
  const progress = { units: {}, finalCheck: {} };
  const summary = KobunSetProgress.summarize(set, progress);
  assert.equal(summary.key, "untouched");
  assert.equal(summary.label, "未着手");
  assert.equal(summary.learnedCount, 0);
  assert.equal(summary.detail, "まだ学習していません");
}

// 2. 一部の語だけlearned: trueなら学習中、残語数を返す
{
  const set = { words: words(4) };
  const progress = { units: { w1: { learned: true }, w2: { learned: true } }, finalCheck: {} };
  const summary = KobunSetProgress.summarize(set, progress);
  assert.equal(summary.key, "in-progress");
  assert.equal(summary.learnedCount, 2);
  assert.equal(summary.detail, "残り2語");
}

// 3. resumeのみ存在しても学習中で続きあり
{
  const set = { words: words(4) };
  const progress = { units: {}, finalCheck: {}, resume: { mode: "learn" } };
  const summary = KobunSetProgress.summarize(set, progress);
  assert.equal(summary.key, "in-progress");
  assert.equal(summary.hasResume, true);
  assert.equal(summary.detail, "続きあり");
}

// 4. needsReview: trueがあれば、resumeや一部学習より要復習を優先し件数を返す
{
  const set = { words: words(4) };
  const progress = {
    units: { w1: { learned: true, needsReview: true }, w2: { learned: true } },
    finalCheck: {},
    resume: { mode: "learn" },
  };
  const summary = KobunSetProgress.summarize(set, progress);
  assert.equal(summary.key, "review");
  assert.equal(summary.reviewCount, 1);
  assert.equal(summary.detail, "要復習 1語");
}

// 5. 全語learned: trueかつ未CLEARなら最終チェック待ち
{
  const set = { words: words(3) };
  const progress = {
    units: { w1: { learned: true }, w2: { learned: true }, w3: { learned: true } },
    finalCheck: {},
  };
  const summary = KobunSetProgress.summarize(set, progress);
  assert.equal(summary.key, "final-pending");
  assert.equal(summary.detail, "最終チェック未CLEAR");
}

// 5b. 最終チェック受験済み(未CLEAR)ならBEST N / Mを表示する
{
  const set = { words: words(3) };
  const progress = {
    units: { w1: { learned: true }, w2: { learned: true }, w3: { learned: true } },
    finalCheck: { lastTriedAt: "2026-08-01T00:00:00.000Z", bestScore: 2 },
  };
  const summary = KobunSetProgress.summarize(set, progress);
  assert.equal(summary.key, "final-pending");
  assert.equal(summary.detail, "BEST 2 / 3");
}

// 6. finalCheck.cleared: trueなら他状態より CLEAR ✓ を優先する
{
  const set = { words: words(3) };
  const progress = {
    units: { w1: { learned: true, needsReview: true }, w2: { learned: true }, w3: { learned: true } },
    finalCheck: { cleared: true, bestScore: 3 },
    resume: { mode: "learn" },
  };
  const summary = KobunSetProgress.summarize(set, progress);
  assert.equal(summary.key, "cleared");
  assert.equal(summary.label, "CLEAR ✓");
  assert.equal(summary.detail, "BEST 3 / 3");
}

// 7. bestScoreがない場合も数値0を返す
{
  const set = { words: words(3) };
  const progress = {
    units: { w1: { learned: true }, w2: { learned: true }, w3: { learned: true } },
    finalCheck: { cleared: true },
  };
  const summary = KobunSetProgress.summarize(set, progress);
  assert.equal(summary.bestScore, 0);
  assert.equal(typeof summary.bestScore, "number");
}

// 8. unitsやfinalCheck自体が欠けた古い保存データでも例外にならない
{
  const set = { words: words(3) };
  assert.doesNotThrow(() => KobunSetProgress.summarize(set, {}));
  assert.doesNotThrow(() => KobunSetProgress.summarize(set, undefined));
  const summary = KobunSetProgress.summarize(set, {});
  assert.equal(summary.key, "untouched");
  assert.equal(summary.learnedCount, 0);
  assert.equal(summary.bestScore, 0);
}

// 境界: 全語learned: trueでも1語needsReview: trueなら最終チェック待ちではなく要復習になる
{
  const set = { words: words(3) };
  const progress = {
    units: {
      w1: { learned: true },
      w2: { learned: true },
      w3: { learned: true, needsReview: true },
    },
    finalCheck: {},
  };
  const summary = KobunSetProgress.summarize(set, progress);
  assert.equal(summary.key, "review");
  assert.equal(summary.detail, "要復習 1語");
}

console.log("OK: 学習セット状態の集計");
