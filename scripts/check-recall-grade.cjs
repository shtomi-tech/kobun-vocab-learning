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
