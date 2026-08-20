const assert = require("node:assert/strict");
const fs = require("node:fs");

const js = fs.readFileSync("static/mode-vocab.js", "utf8");
const css = fs.readFileSync("static/styles.css", "utf8");

assert.match(js, /const VOCAB_GOAL_TOTAL = 600;/, "語彙目標は600語で定義する必要がある");

const start = js.indexOf("  function vocabGoalCard() {");
assert.ok(start !== -1, "vocabGoalCard() が見つからない");
const body = js.slice(start, js.indexOf("\n  function ", start + 1));

// 目標はアプリ全体の到達語数。現在セットだけを数えるとセットを切り替えるたび数字が戻ってしまう。
assert.match(body, /learnedMeaningEntries\(\)\.length/, "到達語数は全セット横断で数える必要がある");
assert.match(body, /Math\.min\(learnedMeaningEntries\(\)\.length, VOCAB_GOAL_TOTAL\)/, "到達語数は目標値でクランプする必要がある");
// 収録語数は目標に届いていないため、数え方と収録数を必ず添える
assert.ok(body.includes("このアプリの収録は現在"), "収録語数の注記が必要");
assert.ok(body.includes("文中問題まで進んだ語"), "何を数えているかの注記が必要");
assert.ok(body.includes('role: "progressbar"'), "バーは progressbar として読み上げ可能にする必要がある");
assert.ok(body.includes('"aria-valuetext"'), "aria-valuetext で内訳を読み上げる必要がある");
assert.ok(body.includes('"aria-hidden": "true"'), "装飾のハリネズミは支援技術から隠す必要がある");
// 0語・満了時にハリネズミがバー外へ出ない
assert.match(body, /clamp\(12px,/, "ハリネズミの位置は左右12pxで止める必要がある");

const renderHome = js.slice(js.indexOf("  function renderHome() {"));
assert.match(renderHome, /home\.appendChild\(vocabGoalCard\(\)\)/, "語彙目標カードはホーム直下へ追加する必要がある");
// 語彙目標カードは学習ブロックマップより前に置く
assert.ok(
  renderHome.indexOf("home.appendChild(vocabGoalCard())") < renderHome.indexOf("home.appendChild(learningBlockMap())"),
  "語彙目標カードは学習ブロックマップより前に置く必要がある",
);

for (const cls of [".vgHead", ".vgTrack", ".vgFill", ".vgHedgehog", ".vgTick"]) {
  assert.ok(css.includes(cls), `CSSに ${cls} の規則が必要`);
}
// ドット絵は2px刻み・12x7マス（58ドット）。崩れるとバー上でハリネズミに見えなくなる。
const shadow = css.match(/\.vgHedgehogSprite \{[\s\S]*?box-shadow:([\s\S]*?);/);
assert.ok(shadow, ".vgHedgehogSprite の box-shadow が見つからない");
assert.equal(shadow[1].split(",").length, 58, "ハリネズミのドットは58個である必要がある");

console.log("vocab goal UI contract: OK");
