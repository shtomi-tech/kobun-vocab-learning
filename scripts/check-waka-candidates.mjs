import assert from "node:assert/strict";

import { read, loadSets } from "./lib/data.mjs";
import { findCandidates, parseCorpusJsonl } from "./lib/waka-candidates.mjs";
import { selectExample } from "./lib/example-source.mjs";

const fixture = parseCorpusJsonl(read("scripts/fixtures/waka/hachidaishu.jsonl"));
const words = loadSets()
  .flatMap(({ data }) => data.words)
  .filter((word) => ["kv03-025", "kv26-306"].includes(word.id))
  .map(selectExample);
const results = findCandidates(words, fixture, { top: 3 });
const kokin = results.find((result) => result.wordId === "kv03-025");
const manyo = results.find((result) => result.wordId === "kv26-306");
assert.equal(kokin.candidates[0].collection, "古今和歌集");
assert.equal(kokin.candidates[0].poem, "797");
assert.ok(kokin.candidates[0].matchedVariants.includes("よのなか"));
assert.equal(manyo.candidates[0].collection, "万葉集");
assert.equal(manyo.candidates[0].poem, "605");
assert.ok(manyo.candidates[0].matchedVariants.includes("ことわり"));
assert.equal(kokin.candidates[0].likelyTanka, true);
console.log(`OK: waka candidate finder fixture / ${results.length}語`);
