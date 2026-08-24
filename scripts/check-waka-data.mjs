import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("../", import.meta.url);
const read = (relativePath) => fs.readFileSync(new URL(relativePath, root), "utf8");

const manifest = JSON.parse(read("data/manifest.json"));
const words = Object.values(manifest.sets).flatMap(({ dataUrl }) => JSON.parse(read(dataUrl)).words);
const wakaWords = words.filter((word) => word.exampleForm === "waka");
const wakaIds = new Set(wakaWords.map((word) => word.id));
const wakaFieldIds = new Set(words.filter((word) => word.waka !== undefined).map((word) => word.id));

assert.equal(wakaWords.length, wakaIds.size, "waka IDs must be unique");
assert.deepEqual([...wakaFieldIds].sort(), [...wakaIds].sort(), "data-side waka fields must match exampleForm=waka IDs");
for (const word of words) {
  if (word.waka !== undefined) assert.equal(word.exampleForm, "waka", `${word.id}: waka requires exampleForm=waka`);
  if (word.exampleForm === "waka") {
    assert.ok(word.waka && Array.isArray(word.waka.phrases), `${word.id}: waka data is required`);
  }
}

console.log(`OK: waka data / ${wakaWords.length}語`);
