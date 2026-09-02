const assert = require("node:assert/strict");
const fs = require("node:fs");

const read = (relativePath) => fs.readFileSync(relativePath, "utf8").replace(/\r\n/g, "\n");
const js = read("static/mode-vocab.js");
const css = read("static/styles.css");

assert.match(js, /const VOCAB_GOAL_TOTAL = 600;/, "語彙目標は600語で定義する必要がある");

const start = js.indexOf("  function vocabGoalCard() {");
assert.ok(start !== -1, "vocabGoalCard() が見つからない");
const body = js.slice(start, js.indexOf("\n  function ", start + 1));

// 目標はアプリ全体の到達語数。現在セットだけを数えるとセットを切り替えるたび数字が戻ってしまう。
assert.match(body, /learnedMeaningEntries\(\)\.length/, "到達語数は全セット横断で数える必要がある");
assert.match(body, /Math\.min\(learnedMeaningEntries\(\)\.length, VOCAB_GOAL_TOTAL\)/, "到達語数は目標値でクランプする必要がある");
// 収録語数の注記はカード上に表示しない
assert.ok(!body.includes("このアプリの収録は現在"), "収録語数の注記を表示してはいけない");
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

/* ---- 学習目標パネル（語彙目標カード先頭。常時表示は「今日 n / m語」1本） ---- */

// パネルは語彙目標カードの先頭の子、到達予想は .vgMessage の直後。
assert.match(body, /"aria-labelledby": "vocabGoalTitle" \},\n\s*studyPlanPanel\(\),/, "学習目標パネルは語彙目標カードの先頭に置く必要がある");
assert.match(body, /el\("p", \{ class: "vgMessage" \}, message\),\n\s*vocabForecastDetails\(learned\),/, "到達予想は励ましメッセージの直後に置く必要がある");

const spStart = js.indexOf("  function studyPlanPanel() {");
assert.ok(spStart !== -1, "studyPlanPanel() が見つからない");
const spBody = js.slice(spStart, js.indexOf("\n  function ", spStart + 1));

assert.ok(spBody.includes('el("p", { class: "label" }, "学習目標")'), "見出しラベルは「学習目標」");
assert.ok(spBody.includes('"新規に学んだ語の進捗"'), "パネル見出しは「新規に学んだ語の進捗」");
assert.ok(spBody.includes('"学習目標を設定"'), "設定トグルの文言が必要");
assert.ok(spBody.includes('"aria-expanded": "false"'), "設定トグルは開閉状態を aria-expanded で伝える");
assert.ok(spBody.includes('"aria-controls": settingsId'), "設定トグルは対象フォームを aria-controls で指す");
assert.ok(spBody.includes('"1日の単語目標"'), "設定項目は〈1日の単語目標〉");
assert.ok(spBody.includes('type: "number"') && spBody.includes('max: String(STUDY_PLAN_DAILY_MAX)'), "1日の目標は number 入力・上限は定数");
assert.ok(spBody.includes("✓ 今日の目標達成"), "達成時の文言が必要");
assert.ok(spBody.includes("`あと${num(summary.dailyRemaining)}語`"), "未達時は残り語数を表示する");
assert.ok(spBody.includes('`${num(summary.answeredToday)} / ${num(plan.dailyWordGoal)}語`'), "常時表示は「今日 n / m語」");
assert.ok(!spBody.includes("週") , "週次・週開始曜日の要素は持ち込まない");

const sppStart = js.indexOf("  function studyPlanProgress(");
const sppBody = js.slice(sppStart, js.indexOf("\n  function ", sppStart + 1));
assert.ok(sppBody.includes('role: "progressbar"') && sppBody.includes('"aria-valuetext": valueText'), "今日の進捗バーは progressbar として読み上げる");

/* ---- 到達予想（このペースで学べる語。既定は折りたたみ、注記文は置かない） ---- */

const vfStart = js.indexOf("  function vocabForecastDetails(learned) {");
assert.ok(vfStart !== -1, "vocabForecastDetails() が見つからない");
const vfBody = js.slice(vfStart, js.indexOf("\n  function ", vfStart + 1));

assert.ok(vfBody.includes('el("details", { class: "vocabForecast" })'), "到達予想は details（既定は折りたたみ）");
assert.ok(vfBody.includes('"このペースで学べる語"'), "summary の見出しが必要");
assert.ok(vfBody.includes("`このペースなら${num(VOCAB_GOAL_TOTAL)}語まであと${num(goalForecast.remainingVocabulary)}語`"), "残り語数のリードが必要");
assert.ok(vfBody.includes("`1日${num(goalForecast.dailyVocabulary)}語で、") && vfBody.includes('toLocaleDateString("ja-JP"'), "到達予想日を1日◯語つきで表示する");
assert.ok(vfBody.includes("あと${num(goalForecast.daysToGoal)}日"), "残り日数を表示する");
for (const label of ["1週間後", "1か月後", "3か月後", "半年後", "1年後"]) {
  assert.ok(vfBody.includes(`"${label}"`), `期間ラベル ${label} が必要`);
}
assert.ok(vfBody.includes("`+${num(vocabulary)}語`"), "期間別は +◯語 で表示する（語句ではなく語）");
assert.ok(!/語句/.test(vfBody), "到達予想では「語句」を使わない");
assert.ok(!vfBody.includes("理論上の学習量") && !vfBody.includes("収録"), "到達予想に注記文は置かない");

for (const cls of [".studyPlanPanel", ".studyPlanProgress", ".studyPlanProgressFill", ".studyPlanSettings", ".vocabForecast", ".vocabForecastGrid", ".vocabForecastRow"]) {
  assert.ok(css.includes(cls), `CSSに ${cls} の規則が必要`);
}
assert.match(css, /\.studyPlanSettings\.hide \{ display: none; \}/, "設定フォームは .hide で非表示にする");

console.log("vocab goal UI contract: OK / 学習目標パネル・到達予想を含む");
