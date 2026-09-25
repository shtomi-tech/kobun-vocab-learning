// 思い出して書く復習の評価表（static/recall-grade.js）を検証する。
const assert = require("node:assert/strict");
const path = require("node:path");

const { gradeRecall } = require(path.resolve(__dirname, "..", "static", "recall-grade.js"));

const cases = [
  [{ confidence: "blank", selfGrade: null, hintUsed: false }, "again", true, false, "思い出せない"],
  [{ confidence: "blank", selfGrade: null, hintUsed: true }, "again", true, false, "思い出せない（ヒントあり）"],
  [{ confidence: "sure", selfGrade: "wrong", hintUsed: false }, "again", true, true, "自信あり→違った"],
  [{ confidence: "maybe", selfGrade: "wrong", hintUsed: false }, "again", true, false, "たぶん→違った"],
  [{ confidence: "sure", selfGrade: "partial", hintUsed: false }, "hard", false, false, "自信あり→一部だけ"],
  [{ confidence: "maybe", selfGrade: "partial", hintUsed: true }, "hard", false, false, "たぶん→一部だけ"],
  [{ confidence: "maybe", selfGrade: "correct", hintUsed: false }, "hard", false, false, "たぶん→合っていた"],
  [{ confidence: "sure", selfGrade: "correct", hintUsed: true }, "hard", false, false, "自信あり→合っていた（ヒントあり）"],
  [{ confidence: "sure", selfGrade: "correct", hintUsed: false }, "good", false, false, "自信あり→合っていた"],
];
for (const [input, rating, toWrongReview, confidentMiss, label] of cases) {
  assert.deepEqual(gradeRecall(input), { rating, toWrongReview, confidentMiss }, label);
}

// 想定外の値は Again
for (const input of [undefined, {}, { confidence: "x", selfGrade: "correct" }, { confidence: "sure", selfGrade: "easy" }, { confidence: "sure", selfGrade: null }]) {
  assert.equal(gradeRecall(input).rating, "again", `想定外の値は again: ${JSON.stringify(input)}`);
}

console.log("OK: 思い出して書く復習の評価表");

// Jev 自動採点の採否と「答えなし」
{
  const { decideAiGrade, isNoAnswer, AI_AUTO_THRESHOLD } = require(path.resolve(__dirname, "..", "static", "recall-grade.js"));
  assert.deepEqual(decideAiGrade({ grade: "correct", confidence: AI_AUTO_THRESHOLD }), { auto: true, selfGrade: "correct" });
  assert.deepEqual(decideAiGrade({ grade: "wrong", confidence: AI_AUTO_THRESHOLD - 0.01 }), { auto: false, selfGrade: "wrong" });
  for (const bad of [null, {}, { grade: "easy", confidence: 1 }, { grade: "correct", confidence: "x" }]) {
    assert.equal(decideAiGrade(bad).auto, false, `想定外は自動採点しない: ${JSON.stringify(bad)}`);
  }
  for (const text of ["わからない", "分からん", "？", "…", "知らない。", "  ? ? "]) assert.equal(isNoAnswer(text), true, text);
  for (const text of ["出歩く", "わからせる", "不明瞭だ", "知らないふりをする"]) assert.equal(isNoAnswer(text), false, text);
  console.log("OK: 思い出して書く復習の評価表と自動採点の採否");
}

// 毎日のノルマ（間隔復習とは独立）: 今日の回答数・語ごとの記録・出題順
{
  const { DAILY_QUOTA, countToday, recordStat, pickWords } = require(path.resolve(__dirname, "..", "static", "recall-grade.js"));
  assert.equal(DAILY_QUOTA, 20);
  const now = new Date(2026, 8, 25, 21, 0);
  const at = (d, h) => new Date(2026, 8, d, h).toISOString();
  const histories = [
    [{ kind: "recall", at: at(25, 8) }, { kind: "meaning", at: at(25, 8) }, { kind: "recall", at: at(24, 23) }],
    [{ kind: "recall", at: at(25, 0) }, { kind: "recall", at: at(26, 0) }],
    undefined,
  ];
  assert.equal(countToday(histories, now), 2, "今日の recall だけを全セット分数える");

  let stat = recordStat(undefined, { rating: "again", confidentMiss: true }, now);
  assert.deepEqual(stat, { count: 1, missCount: 1, confidentMissCount: 1, lastAt: now.toISOString(), lastRating: "again" });
  stat = recordStat(stat, { rating: "good", confidentMiss: false }, now);
  assert.equal(stat.count, 2);
  assert.equal(stat.missCount, 1);
  assert.equal(stat.lastRating, "good");

  const entries = [
    { key: "good-old", stat: { lastRating: "good", lastAt: at(1, 9) } },
    { key: "again-today", stat: { lastRating: "again", lastAt: at(25, 9) } },
    { key: "hard", stat: { lastRating: "hard", lastAt: at(20, 9) } },
    { key: "new", stat: undefined },
    { key: "again", stat: { lastRating: "again", lastAt: at(10, 9) } },
  ];
  // 乱数を固定すると、今日出していない語は元の並びのまま、今日出した語が最後になる。
  assert.deepEqual(pickWords(entries, 10, now, () => 0), ["good-old", "hard", "new", "again", "again-today"], "前回の評価では並べず、今日出した語は最後");
  assert.deepEqual(pickWords(entries, 2, now, () => 0), ["good-old", "hard"], "問題数で切る");
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(pickWords(entries, 1, now)[0]);
  assert.ok(!seen.has("again-today"), "今日出した語は、まだ出していない語があるうちは出さない");
  assert.equal(seen.size, 4, "今日出していない語はどれも先頭に来うる（ランダム）");
  console.log("OK: 思い出す問題の毎日のノルマ");
}
