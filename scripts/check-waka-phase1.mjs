import assert from "node:assert/strict";
import fs from "node:fs";

const manifest = JSON.parse(fs.readFileSync(new URL("../data/manifest.json", import.meta.url)));
const expectedIds = new Set(["kv03-026", "kv04-043", "kv07-073", "kv08-090", "kv09-106", "kv10-116"]);

const words = [];
for (const entry of Object.values(manifest.sets)) {
  const data = JSON.parse(fs.readFileSync(new URL(`../${entry.dataUrl}`, import.meta.url)));
  words.push(...data.words);
}
const wordsById = new Map(words.map((word) => [word.id, word]));

const wakaWords = words.filter((word) => word.exampleForm === "waka");
assert.equal(wakaWords.length, expectedIds.size, "phase 1 must formalize exactly six waka entries");
assert.deepEqual(wakaWords.map((word) => word.id).sort(), [...expectedIds].sort(), "phase 1 waka IDs mismatch");
for (const id of expectedIds) {
  const word = wordsById.get(id);
  assert.ok(word, `${id}: word is missing`);
  assert.equal(word.exampleForm, "waka", `${id}: exampleForm must be waka`);
}

console.log(`OK: waka phase1 data / ${expectedIds.size}首`);
