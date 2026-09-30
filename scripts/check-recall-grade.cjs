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
  const { DAILY_QUOTA, countToday, recordStat, pickWords, pickMixed } = require(path.resolve(__dirname, "..", "static", "recall-grade.js"));
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

  // 間隔復習の期限が来ている語とランダムの語を半々にする（20問なら10問ずつ）。
  const due = (n) => Array.from({ length: n }, (_, i) => ({ key: `due${i}`, due: true, dueAt: 1000 + i }));
  const free = (n) => Array.from({ length: n }, (_, i) => ({ key: `free${i}`, due: false, dueAt: 0 }));
  const isDueKey = (key) => key.startsWith("due");
  const mixed = pickMixed([...due(15), ...free(15)], 20, now);
  assert.equal(mixed.length, 20);
  assert.equal(new Set(mixed).size, 20, "同じ語は重ならない");
  const dueFirst10 = Array.from({ length: 10 }, (_, i) => `due${i}`);
  assert.ok(dueFirst10.every((key) => mixed.includes(key)), "期限が古い10語は必ず入る");
  assert.ok(mixed.filter(isDueKey).length >= 10, "期限の語は10問以上");
  // 期限の語が少ないときは、ランダム側で埋めて合計を保つ。
  const few = pickMixed([...due(3), ...free(15)], 20, now);
  assert.equal(few.length, 18, "語が足りなければ全部（3+15）");
  const few2 = pickMixed([...due(3), ...free(30)], 20, now);
  assert.equal(few2.length, 20);
  assert.ok(["due0", "due1", "due2"].every((key) => few2.includes(key)), "期限の語は全部入る");
  // ランダムの語が足りないときは、残りの期限の語で埋める。
  assert.equal(pickMixed([...due(15), ...free(2)], 20, now).length, 17);
  assert.equal(pickMixed(due(15), 8, now).length, 8);
  // 問題数が奇数のときは期限の語を1問多くする。
  assert.equal(pickMixed([...due(10), ...free(10)], 7, now, () => 0).filter(isDueKey).length >= 4, true);
  // 今日出した期限の語は、他に期限の語があるうちは後回し。
  const todayDue = [
    { key: "d-today", due: true, dueAt: 1, stat: { lastAt: at(25, 9) } },
    { key: "d-old", due: true, dueAt: 5 },
    { key: "d-new", due: true, dueAt: 9 },
    { key: "f1", due: false }, { key: "f2", due: false }, { key: "f3", due: false },
  ];
  for (let i = 0; i < 100; i++) assert.ok(!pickMixed(todayDue, 4, now).includes("d-today"), "今日出した語は後回し");
  assert.deepEqual(pickMixed([], 20, now), []);
  console.log("OK: 思い出す問題の毎日のノルマ");
}
