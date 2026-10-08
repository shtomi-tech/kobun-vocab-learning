// 書いた答えの採点まわり（static/recall-grade.js）: Jev 自動採点の採否と「答えなし」の判定を検証する。
const assert = require("node:assert/strict");
const path = require("node:path");

const { decideAiGrade, isNoAnswer, AI_AUTO_THRESHOLD } = require(path.resolve(__dirname, "..", "static", "recall-grade.js"));
assert.deepEqual(decideAiGrade({ grade: "correct", confidence: AI_AUTO_THRESHOLD }), { auto: true, selfGrade: "correct" });
assert.deepEqual(decideAiGrade({ grade: "wrong", confidence: AI_AUTO_THRESHOLD - 0.01 }), { auto: false, selfGrade: "wrong" });
for (const bad of [null, {}, { grade: "easy", confidence: 1 }, { grade: "correct", confidence: "x" }]) {
  assert.equal(decideAiGrade(bad).auto, false, `想定外は自動採点しない: ${JSON.stringify(bad)}`);
}
for (const text of ["わからない", "分からん", "？", "…", "知らない。", "  ? ? "]) assert.equal(isNoAnswer(text), true, text);
for (const text of ["出歩く", "わからせる", "不明瞭だ", "知らないふりをする"]) assert.equal(isNoAnswer(text), false, text);
console.log("OK: 書いた答えの自動採点の採否と答えなしの判定");
