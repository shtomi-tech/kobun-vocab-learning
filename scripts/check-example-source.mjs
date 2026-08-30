import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const read = (relativePath) => fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const source = read("static/example-source.js");
const api = vm.runInNewContext(`${source}\nKobunExampleSource`, { window: {} });
const mode = read("static/mode-vocab.js");
const manifest = JSON.parse(read("data/manifest.json"));

assert.deepEqual([...api.priority], ["attached", "waka", "prose", "generated"]);
assert.match(mode, /KobunExampleSource\.select\(word\)/, "読み込み時に例文ソースの優先選択を適用する必要がある");

const candidate = (sourceType, value, exampleForm = "prose") => ({
  sourceType,
  example: value,
  translation: `${value}の訳`,
  source: sourceType === "generated" ? "学習用作例" : `${value}の出典`,
  cloze: "（　）",
  exampleForm,
  ...(exampleForm === "waka" ? {
    waka: {
      phrases: ["あ", "い", "う", "え", "お"],
      reading: ["あいうえお", "あいうえおか", "あいうえお", "あいうえおか", "あいうえおかき"],
      author: "作者",
      ref: { collection: `${value}の出典`, book: "巻一・部立", number: 1 },
    },
  } : {}),
});

const base = {
  id: "fixture-001",
  headword: "語",
  kanji: "語",
  meanings: ["意味"],
  notes: ["補足"],
  ...candidate("generated", "legacy"),
};

const attachedFirst = api.select({
  ...base,
  examples: [
    candidate("generated", "generated"),
    candidate("prose", "prose"),
    candidate("waka", "あいうえお", "waka"),
    candidate("attached", "attached"),
  ],
});
assert.equal(attachedFirst.example, "attached");

const wakaFallback = api.select({
  ...base,
  examples: [candidate("generated", "generated"), candidate("prose", "prose"), candidate("waka", "あいうえお", "waka")],
});
assert.equal(wakaFallback.example, "あいうえお");

const proseFallback = api.select({ ...base, examples: [candidate("generated", "generated"), candidate("prose", "prose")] });
assert.equal(proseFallback.example, "prose");

const generatedFallback = api.select({ ...base, examples: [candidate("generated", "generated")] });
assert.equal(generatedFallback.example, "generated");

const invalidAttached = api.select({
  ...base,
  examples: [{ ...candidate("attached", "invalid"), exampleForm: "invalid" }, candidate("prose", "prose")],
});
assert.equal(invalidAttached.example, "prose");

let candidateCount = 0;
for (const [setId, entry] of Object.entries(manifest.sets)) {
  const data = JSON.parse(read(entry.dataUrl));
  for (const word of data.words) {
    if (word.examples === undefined) continue;
    assert.ok(Array.isArray(word.examples), `${setId}: ${word.id}.examples must be an array`);
    for (const candidateValue of word.examples) {
      assert.ok(candidateValue && typeof candidateValue === "object" && !Array.isArray(candidateValue), `${setId}: ${word.id} has an invalid example candidate`);
      assert.ok(["attached", "waka", "prose", "generated"].includes(candidateValue.sourceType), `${setId}: ${word.id} candidate sourceType is invalid`);
      assert.ok(api.isUsable(candidateValue), `${setId}: ${word.id} has an unusable example candidate`);
      candidateCount += 1;
    }
  }
}

console.log(`example source priority contract: OK / ${candidateCount}候補`);
