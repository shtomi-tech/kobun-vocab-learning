// 意味を書く演習（static/written-drill.js）の段階・再出題・一致判定と、ホームのタブの契約を検証する。
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const drill = require(path.resolve(__dirname, "..", "static", "written-drill.js"));
const { nextStep, reaskIndex, localMatch, sizeChoices, preferredSize, summarize } = drill;

// 段階: 見出し語だけ → 例文ヒント → 答えを確認
assert.deepEqual(nextStep("word", false, "correct"), { next: "result", outcome: "learned" }, "見出し語だけで正解＝覚えた");
assert.deepEqual(nextStep("word", false, "wrong"), { next: "example" }, "見出し語だけで誤答＝例文ヒントへ");
assert.deepEqual(nextStep("word", false, "partial"), { next: "example" }, "一部だけも例文ヒントへ");
assert.deepEqual(nextStep("example", false, "correct"), { next: "result", outcome: "shaky" }, "例文で正解＝あやふや");
assert.deepEqual(nextStep("example", false, "wrong"), { next: "answer", outcome: "notLearned" }, "例文でも誤答＝答えを確認");
assert.deepEqual(nextStep("word", false, "wrong", { exampleShown: true }), { next: "answer", outcome: "notLearned" }, "最初から例文を出した語は例文の段階を飛ばす");
assert.deepEqual(nextStep("word", true, "correct"), { next: "result", reaskResult: "correct" }, "再出題で正解");
assert.deepEqual(nextStep("word", true, "partial"), { next: "answer", reaskResult: "wrong" }, "再出題は1回きり");

// 再出題の位置: 未習得は3問あと（回の長さで頭打ち）、あやふやは最後、覚えた語は差し込まない
assert.equal(reaskIndex("notLearned", 0, 10), 4);
assert.equal(reaskIndex("notLearned", 8, 10), 10);
assert.equal(reaskIndex("shaky", 2, 10), 10);
assert.equal(reaskIndex("learned", 2, 10), -1);

// 表記ゆれ程度の一致は Jev に送らず正解
const meanings = ["出歩く。歩く。移動する。", "「動詞＋ありく」の形で、あちこちで〜する。"];
for (const answer of ["出歩く", "移動すること", " 歩く。"]) assert.equal(localMatch(answer, meanings), true, answer);
for (const answer of ["", "走る", "あちこち"]) assert.equal(localMatch(answer, meanings), false, answer);

// 1回の語数
assert.deepEqual(sizeChoices(30), [5, 10, 20]);
assert.deepEqual(sizeChoices(7), [5, 7]);
assert.deepEqual(sizeChoices(3), [3]);
assert.deepEqual(sizeChoices(0), []);
assert.equal(preferredSize([5, 10, 20], "20"), 20);
assert.equal(preferredSize([5, 7], "20"), 7, "保存した語数が無ければ最大の選択肢");
assert.equal(preferredSize([5, 10, 20], null), 10, "既定は10語");

assert.deepEqual(summarize([
  { outcome: "learned" }, { outcome: "shaky", reaskResult: "correct" }, { outcome: "notLearned", reaskResult: "wrong" },
]), { learned: 1, shaky: 1, notLearned: 1, reasked: 2, reaskCorrect: 1 });

console.log("OK: 意味を書く演習の段階・再出題・一致判定");

// ホームのタブと書く演習の組み込み（文字列の契約）
const js = fs.readFileSync(path.resolve(__dirname, "..", "static", "mode-vocab.js"), "utf8").replace(/\r\n/g, "\n");
const css = fs.readFileSync(path.resolve(__dirname, "..", "static", "styles.css"), "utf8");
const html = fs.readFileSync(path.resolve(__dirname, "..", "index.html"), "utf8");
const renderHome = js.slice(js.indexOf("  function renderHome() {"), js.indexOf("  /* ---- ホームのタブ"));
const order = ['tabStart("today")', 'tabStart("review")', "home.appendChild(meaningMission())", 'tabStart("write")', "home.appendChild(writtenMission())", 'tabStart("sets")', "home.appendChild(learningBlockMap())", "arrangeHomeTabs(home, marks"];
order.reduce((prev, needle) => {
  const at = renderHome.indexOf(needle);
  assert.ok(at > prev, `renderHome の並び: ${needle}`);
  return at;
}, -1);
for (const label of ['"今日"', '"復習"', '"書く"', '"セット"']) assert.ok(js.includes(`label: ${label}`), `タブ ${label}`);
assert.match(js, /role: "tablist"/);
assert.match(js, /"aria-selected"/);
assert.match(js, /if \(session\.mode === "writtenDrill"\) return;/, "書く演習は途中保存しない（別の学習の途中保存を消さない）");
assert.match(js, /kind: "written"/, "書く演習は履歴にだけ残す");
assert.ok(!js.includes("recallMission") && !js.includes("startRecallReview"), "選択肢なしで思い出す（毎日のノルマ）は廃止済み");
for (const cls of [".homeTabs", ".homeTab", ".homeTabPanel[hidden]", ".writtenSteps", ".writtenSizeChoice", ".writtenResult"]) {
  assert.ok(css.includes(cls), `CSSに ${cls} の規則が必要`);
}
assert.ok(html.indexOf("static/written-drill.js") > 0 && html.indexOf("static/written-drill.js") < html.indexOf("static/mode-vocab.js"), "written-drill.js は mode-vocab.js より前に読み込む");

console.log("OK: ホームのタブと書く演習の組み込み");
