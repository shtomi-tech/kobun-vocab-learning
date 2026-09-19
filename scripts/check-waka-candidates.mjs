import assert from "node:assert/strict";

import { read } from "./lib/data.mjs";
import { corpusSummary, findCandidates, parseCorpusJsonl } from "./lib/waka-candidates.mjs";

const fixture = parseCorpusJsonl(read("scripts/fixtures/waka/hachidaishu.jsonl"));
const publicFixture = parseCorpusJsonl(read("scripts/fixtures/waka/hachidaishu-public.jsonl"));
const words = [
  { id: "fixture-yononaka", headword: "よ・よのなか", kanji: "世・世の中", exampleForm: "prose" },
  { id: "fixture-kiyoshi", headword: "きよし", kanji: "清し", exampleForm: "prose" },
  { id: "fixture-hito", headword: "ひと", kanji: "人", exampleForm: "prose" },
];
const results = findCandidates(words, fixture, { top: 3 });
const publicResults = findCandidates(words, publicFixture, { top: 3 });
const kokin = results.find((result) => result.wordId === "fixture-yononaka");
const kiyoshi = results.find((result) => result.wordId === "fixture-kiyoshi");
const shinkokin = results.find((result) => result.wordId === "fixture-hito");
const publicKiyoshi = publicResults.find((result) => result.wordId === "fixture-kiyoshi");
const publicShinkokin = publicResults.find((result) => result.wordId === "fixture-hito");
const summary = corpusSummary(fixture);
const publicSummary = corpusSummary(publicFixture);
assert.equal(summary.records, 7);
assert.equal(summary.poems, 3);
assert.deepEqual(summary.anthologies, ["Kokinshu", "Shinkokinshu"]);
assert.ok(!fixture.some((record) => record.anthology === "Manyoshu"));
assert.equal(publicFixture[0].anthology, "Kokinshu");
assert.equal(publicFixture[0].poem, 797);
assert.equal(publicFixture[0].surface, "世の中");
assert.equal("POS" in publicFixture[0], false);
assert.equal(publicSummary.records, 3);
assert.equal(publicSummary.poems, 3);
assert.equal(kokin.candidates[0].collection, "古今和歌集");
assert.equal(kokin.candidates[0].poem, 797);
assert.ok(kokin.candidates[0].matchedVariants.includes("よのなか"));
assert.equal(kiyoshi.candidates[0].surface, "きよき");
assert.equal(kiyoshi.candidates[0].matches[0].field, "lemma_reading");
assert.equal(kiyoshi.candidates[0].matches[0].exact, true);
assert.equal(shinkokin.candidates[0].collection, "新古今和歌集");
assert.equal(shinkokin.candidates[0].poem, 1);
assert.equal(publicKiyoshi.candidates[0].matches[0].field, "lemma_reading");
assert.equal(publicKiyoshi.candidates[0].matches[0].exact, true);
assert.equal(publicKiyoshi.candidates[0].surface, "きよき");
assert.equal(publicShinkokin.candidates[0].collection, "新古今和歌集");
assert.equal(publicShinkokin.candidates[0].poem, 1);
assert.throws(
  () => parseCorpusJsonl('{"Foo":"bar"}'),
  /Hachidaishu schema mismatch/,
);
assert.throws(
  () => parseCorpusJsonl('{"Anthology":"Kokinshu","Poem":"1","Surface":"年"}'),
  /Hachidaishu schema mismatch/,
);
console.log(`OK: waka candidate finder fixture / ${results.length}語`);
