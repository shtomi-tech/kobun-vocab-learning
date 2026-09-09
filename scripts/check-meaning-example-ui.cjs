const assert = require("node:assert/strict");
const fs = require("node:fs");

const read = (relativePath) => fs.readFileSync(relativePath, "utf8").replace(/\r\n/g, "\n");
const js = read("static/mode-vocab.js");
const css = read("static/styles.css");
const manifest = JSON.parse(read("data/manifest.json"));

assert.match(js, /const isMeaningExample = kind === "meaning";/, "すべての意味問題を傍線部形式にする必要がある");
assert.doesNotMatch(js, /SET20_WORD_PREFIX|isSet20Word/, "セット限定の判定を残してはいけない");
assert.doesNotMatch(js, /次の語の意味は？/, "旧形式の意味問題ラベルを残してはいけない");
assert.match(js, /傍線部の意味として最も適当なものを選べ/, "意味問題の設問文が必要");
assert.match(js, /出典：『\$\{word\.source\}』/, "意味問題の出題中に出典を表示する必要がある");
assert.ok((js.match(/exampleBody\(word, \{ underline: true \}\)/g) ?? []).length >= 2, "傍線部の問題面とフィードバックで対象語を描画する必要がある");
assert.match(js, /meaningExampleTranslation/, "意味問題の解答後に現代語訳を表示する必要がある");
assert.match(js, /\$\("\.askWord, \.meaningExample, \.cloze"\)/, "新形式でも問題面へフォーカスを戻す必要がある");
assert.match(css, /\.meaningTarget\s*\{[\s\S]*text-decoration-line:\s*underline/, "傍線はテキスト装飾で表示する必要がある");
assert.match(css, /\.questionSource\s*\{/, "出典表示のスタイルが必要");

// 解答時間はスケジューリングへ効くため、解答直後に何が測られたかを見せる。
assert.match(js, /function responseTimeNote\(\)/, "解答時間の表示関数が必要");
assert.match(js, /session\.mode !== "meaningReview"/, "解答時間の表示は意味だけ復習に限定する必要がある");
assert.match(js, /出題から \$\{\(elapsed \/ 1000\)\.toFixed\(1\)\} 秒で解答/, "解答時間を秒で表示する必要がある");
assert.match(js, /前回までの平均 \$\{\(average \/ 1000\)\.toFixed\(1\)\} 秒/, "前回までの平均を併記する必要がある");
assert.match(js, /session\.prevAvgMs = KobunSrs\.normalize\(progress\.items\[wordId\]\)\.avgMs;/,
  "平均は record が更新する前の値を控える必要がある（今回の値を混ぜない）");
assert.match(js, /session\.lastElapsedMs = null;/, "新しい問題では前の計測値を持ち越さない必要がある");
assert.ok(
  js.includes("responseTimeNote()"),
  "フィードバックへ解答時間の表示を差し込む必要がある",
);

const blank = "（　）";
const expectedUnderlineTargets = new Map([
  ["kv24-277", "本意なけれ"],
]);
let wordCount = 0;
for (const [setId, entry] of Object.entries(manifest.sets)) {
  const data = JSON.parse(read(entry.dataUrl));
  assert.equal(data.meta.id, setId);
  for (const word of data.words) {
    const blankIndex = word.cloze.indexOf(blank);
    assert.notEqual(blankIndex, -1, `${word.id}: cloze blank is required`);
    const prefix = word.cloze.slice(0, blankIndex);
    const suffix = word.cloze.slice(blankIndex + blank.length);
    assert.ok(word.example.startsWith(prefix), `${word.id}: cloze prefix must match example`);
    assert.ok(word.example.endsWith(suffix), `${word.id}: cloze suffix must match example`);
    const target = word.example.slice(prefix.length, word.example.length - suffix.length);
    assert.ok(target.length > 0, `${word.id}: underline target must not be empty`);
    if (expectedUnderlineTargets.has(word.id)) {
      assert.equal(target, expectedUnderlineTargets.get(word.id), `${word.id}: underline target must match the intended phrase`);
    }
    wordCount += 1;
  }
}
assert.equal(wordCount, 600, "全セットの収録語数を確認する必要がある");

console.log("meaning-example UI contract: OK / 600語");
