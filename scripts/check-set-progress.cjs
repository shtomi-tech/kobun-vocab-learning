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

// aggregate 1. 8件すべて未着手
{
  const sources = Array.from({ length: 8 }, () => ({ set: { words: words(3) }, progress: { units: {}, finalCheck: {} } }));
  const result = KobunSetProgress.aggregate(sources);
  assert.deepEqual(result, { totalSets: 8, clearedSets: 0, inProgressSets: 0, reviewSets: 0 });
}

// aggregate 2. CLEARと要復習が混在
{
  const sources = [
    { set: { words: words(3) }, progress: { units: { w1: { learned: true }, w2: { learned: true }, w3: { learned: true } }, finalCheck: { cleared: true, bestScore: 3 } } },
    { set: { words: words(3) }, progress: { units: { w1: { learned: true, needsReview: true } }, finalCheck: {} } },
    { set: { words: words(3) }, progress: { units: {}, finalCheck: {} } },
  ];
  const result = KobunSetProgress.aggregate(sources);
  assert.deepEqual(result, { totalSets: 3, clearedSets: 1, inProgressSets: 0, reviewSets: 1 });
}

// aggregate 3. resumeだけある学習中
{
  const sources = [
    { set: { words: words(4) }, progress: { units: {}, finalCheck: {}, resume: { mode: "learn" } } },
    { set: { words: words(4) }, progress: { units: {}, finalCheck: {} } },
  ];
  const result = KobunSetProgress.aggregate(sources);
  assert.deepEqual(result, { totalSets: 2, clearedSets: 0, inProgressSets: 1, reviewSets: 0 });
}

// aggregate 4. set未ロードのsourceは未着手として扱う
{
  const sources = [
    { set: null, progress: null },
    { set: { words: words(3) }, progress: { units: { w1: { learned: true }, w2: { learned: true }, w3: { learned: true } }, finalCheck: { cleared: true } } },
  ];
  const result = KobunSetProgress.aggregate(sources);
  assert.deepEqual(result, { totalSets: 2, clearedSets: 1, inProgressSets: 0, reviewSets: 0 });
}

// summarizeBlocks 1. 12語・全未着手なら3ブロックすべてunlearned
{
  const set = { words: words(12) };
  const blocks = KobunSetProgress.summarizeBlocks(set, { units: {}, finalCheck: {} });
  assert.equal(blocks.length, 3);
  blocks.forEach((block, index) => {
    assert.equal(block.index, index);
    assert.equal(block.total, 4);
    assert.equal(block.key, "unlearned");
    assert.equal(block.isCurrent, false);
  });
}

// summarizeBlocks 2. resumeが第2ブロックのflashなら、前ブロックは意味確認済み・現在ブロックはcurrent・後続は未学習
{
  const set = { words: words(12) };
  const progress = { units: {}, finalCheck: {}, resume: { mode: "learn", batchIndex: 1, stage: "flash" } };
  const blocks = KobunSetProgress.summarizeBlocks(set, progress);
  assert.equal(blocks[0].key, "meaning-checked");
  assert.equal(blocks[1].key, "current");
  assert.equal(blocks[1].isCurrent, true);
  assert.equal(blocks[2].key, "unlearned");
}

// summarizeBlocks 3. resumeがcontext段階(最終ブロックindexのまま)なら全ブロックが意味確認済み
{
  const set = { words: words(12) };
  const progress = { units: {}, finalCheck: {}, resume: { mode: "learn", batchIndex: 2, stage: "context" } };
  const blocks = KobunSetProgress.summarizeBlocks(set, progress);
  blocks.forEach((block) => {
    assert.equal(block.key, "meaning-checked");
    assert.equal(block.isCurrent, false);
  });
}

// summarizeBlocks 4. needsReviewがあれば他条件より優先してreview表示
{
  const set = { words: words(4) };
  const progress = {
    units: { w1: { learned: true, solvedCorrect: true }, w2: { learned: true, needsReview: true } },
    finalCheck: {},
    resume: { mode: "learn", batchIndex: 0, stage: "flash" },
  };
  const blocks = KobunSetProgress.summarizeBlocks(set, progress);
  assert.equal(blocks[0].key, "review");
  assert.equal(blocks[0].reviewCount, 1);
}

// summarizeBlocks 5. 4語すべてsolvedCorrectなら完了
{
  const set = { words: words(4) };
  const progress = {
    units: Object.fromEntries(words(4).map((w) => [w.id, { learned: true, solvedCorrect: true }])),
    finalCheck: {},
  };
  const blocks = KobunSetProgress.summarizeBlocks(set, progress);
  assert.equal(blocks[0].key, "done");
  assert.equal(blocks[0].correctCount, 4);
}

// summarizeBlocks 6. 10語は4/4/2ブロックに分割される
{
  const set = { words: words(10) };
  const blocks = KobunSetProgress.summarizeBlocks(set, { units: {}, finalCheck: {} });
  assert.equal(blocks.length, 3);
  assert.deepEqual(blocks.map((b) => b.total), [4, 4, 2]);
}

// summarizeBlocks 7. 0語ならブロックなし
{
  const set = { words: words(0) };
  const blocks = KobunSetProgress.summarizeBlocks(set, { units: {}, finalCheck: {} });
  assert.deepEqual(blocks, []);
}

// summarizeBlocks 8. 範囲外のbatchIndexは無視して未学習扱いにする
{
  const set = { words: words(4) };
  const progress = { units: {}, finalCheck: {}, resume: { mode: "learn", batchIndex: 99, stage: "flash" } };
  const blocks = KobunSetProgress.summarizeBlocks(set, progress);
  assert.equal(blocks[0].key, "unlearned");
  assert.equal(blocks[0].isCurrent, false);
}

// summarizeBlocks 9. mode: learn以外のresumeはブロック位置判定に使わない
{
  const set = { words: words(4) };
  const progress = { units: {}, finalCheck: {}, resume: { mode: "final", batchIndex: 0, stage: "meaning" } };
  const blocks = KobunSetProgress.summarizeBlocks(set, progress);
  assert.equal(blocks[0].key, "unlearned");
  assert.equal(blocks[0].isCurrent, false);
}

console.log("OK: 学習セット状態の集計");
