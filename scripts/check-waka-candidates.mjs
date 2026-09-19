import assert from "node:assert/strict";

import { read } from "./lib/data.mjs";
import { corpusSummary, findCandidates, parseCorpusJsonl } from "./lib/waka-candidates.mjs";

const fixture = parseCorpusJsonl(read("scripts/fixtures/waka/hachidaishu.jsonl"));
const words = [
  { id: "fixture-yononaka", headword: "よ・よのなか", kanji: "世・世の中", exampleForm: "prose" },
  { id: "fixture-kiyoshi", headword: "きよし", kanji: "清し", exampleForm: "prose" },
  { id: "fixture-hito", headword: "ひと", kanji: "人", exampleForm: "prose" },
];
const results = findCandidates(words, fixture, { top: 3 });
const kokin = results.find((result) => result.wordId === "fixture-yononaka");
const kiyoshi = results.find((result) => result.wordId === "fixture-kiyoshi");
const shinkokin = results.find((result) => result.wordId === "fixture-hito");
const summary = corpusSummary(fixture);
assert.equal(summary.records, 7);
assert.equal(summary.poems, 3);
assert.deepEqual(summary.anthologies, ["Kokinshu", "Shinkokinshu"]);
assert.ok(!fixture.some((record) => record.anthology === "Manyoshu"));
assert.equal(kokin.candidates[0].collection, "古今和歌集");
assert.equal(kokin.candidates[0].poem, 797);
assert.ok(kokin.candidates[0].matchedVariants.includes("よのなか"));
assert.equal(kiyoshi.candidates[0].surface, "きよき");
assert.equal(kiyoshi.candidates[0].matches[0].field, "lemma_reading");
assert.equal(kiyoshi.candidates[0].matches[0].exact, true);
assert.equal(shinkokin.candidates[0].collection, "新古今和歌集");
assert.equal(shinkokin.candidates[0].poem, 1);
assert.throws(
  () => parseCorpusJsonl('{"Anthology":"Kokinshu","Poem":"1","Surface":"年"}'),
  /Hachidaishu schema mismatch/,
);
console.log(`OK: waka candidate finder fixture / ${results.length}語`);
