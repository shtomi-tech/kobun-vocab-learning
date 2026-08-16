const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const js = read("static/mode-vocab.js");
const css = read("static/styles.css");
const html = read("index.html");

// 1. setPicker() が番号バッジ・進捗表示・矢印を生成する
{
  const fnMatch = js.match(/function setPicker\(\) \{[\s\S]*?\n  \}\n/);
  assert.ok(fnMatch, "setPicker() must exist");
  const body = fnMatch[0];
  assert.ok(body.includes("setUnitNumber"), "setPicker must render a numbered badge (.setUnitNumber)");
  assert.ok(body.includes("setOptionProgress"), "setPicker must render a progress indicator (.setOptionProgress)");
  assert.ok(body.includes("setUnitArrow"), "setPicker must render an arrow (.setUnitArrow)");
  assert.ok(body.includes("aggregate("), "setPicker must use KobunSetProgress.aggregate() for the overall summary");
}

// 2. learningBlockMap() が存在し、ブロックカードに状態文言と4語がある
{
  const fnMatch = js.match(/function learningBlockMap\(\) \{[\s\S]*?\n  \}\n/);
  assert.ok(fnMatch, "learningBlockMap() must exist");
  const body = fnMatch[0];
  assert.ok(body.includes("summarizeBlocks("), "learningBlockMap must derive block state from KobunSetProgress.summarizeBlocks()");
  assert.ok(body.includes("blockCardState"), "block cards must show a state label (.blockCardState)");
  assert.ok(body.includes("blockCardWords"), "block cards must show the 4 headwords (.blockCardWords)");
  assert.ok(js.includes("home.appendChild(learningBlockMap())"), "renderHome must render the learning block map");
}

// 3. startLearn() が任意のブロックindexを受け取れる（既定はnullで従来ロジックを維持）
{
  assert.ok(/function startLearn\(batchIndexOverride = null\)/.test(js), "startLearn must accept an optional batchIndexOverride");
  assert.ok(/onclick: \(\) => primary\[1\]\(\)/.test(js), "primary CTA must not pass the click Event into startLearn as batchIndexOverride");
}

// 4. sticky現在地バーが存在する
{
  assert.ok(/function sessionProgressBar\(\) \{/.test(js), "sessionProgressBar() must exist");
  assert.ok(js.includes("panel.appendChild(sessionProgressBar())"), "renderSession must render the sticky progress bar");
  assert.ok(/\.sessionProgressBar\s*\{[^}]*position:\s*sticky/.test(css), "styles.css must position .sessionProgressBar as sticky");
}

// 5. renderDone() に次セット導線がある
{
  const fnMatch = js.match(/function renderDone\(panel\) \{[\s\S]*?\n  \}\n/);
  assert.ok(fnMatch, "renderDone() must exist");
  const body = fnMatch[0];
  assert.ok(body.includes("nextSetId(state.setId)"), "renderDone must look up the next set via nextSetId()");
  assert.ok(body.includes("switchSet(nextId)"), "renderDone must reuse switchSet() to advance to the next set");
  assert.ok(/function nextSetId\(currentSetId\) \{/.test(js), "nextSetId() must exist");
}

// 6. CSS: セット2列(641px以上)/1列(640px以下)、ブロックカード、sticky、reduced-motion
{
  assert.ok(/\.setList\s*\{[^}]*grid-template-columns:\s*repeat\(2/.test(css), "desktop .setList must be 2 columns");
  const mobileBlock = css.match(/@media \(max-width: 640px\) \{([\s\S]*?)\n\}/)?.[1] || "";
  assert.ok(/\.setList\s*\{[^}]*grid-template-columns:\s*1fr/.test(mobileBlock), "mobile .setList must collapse to 1 column");
  assert.ok(/\.blockGrid\s*\{[^}]*grid-template-columns:\s*1fr/.test(mobileBlock), "mobile .blockGrid must collapse to 1 column");
  assert.ok(css.includes(".blockCard {"), "styles.css must define .blockCard");
  assert.ok(/@media \(prefers-reduced-motion: reduce\)/.test(css), "reduced-motion rule must remain present");
}

// 7. index.html のキャッシュバージョンが揃っている
{
  const versions = [...html.matchAll(/(static\/[\w-]+\.(?:css|js))\?v=([\d.]+)/g)].map(([, file, version]) => ({ file, version }));
  const managed = versions.filter(({ file }) => ["static/styles.css", "static/set-progress.js", "static/mode-vocab.js"].includes(file));
  assert.equal(managed.length, 3, "styles.css / set-progress.js / mode-vocab.js must all carry a cache-busting version");
  const distinctVersions = new Set(managed.map(({ version }) => version));
  assert.equal(distinctVersions.size, 1, "styles.css / set-progress.js / mode-vocab.js must share the same release version");
}

console.log("OK: Unitカード・学習ブロックマップUI契約");
