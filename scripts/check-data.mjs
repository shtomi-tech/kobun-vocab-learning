import fs from "node:fs";

const manifest = JSON.parse(fs.readFileSync(new URL("../data/manifest.json", import.meta.url)));
if (!manifest.sets?.[manifest.defaultSetId]) throw new Error("defaultSetId is not registered");

for (const [setId, entry] of Object.entries(manifest.sets)) {
  const data = JSON.parse(fs.readFileSync(new URL(`../${entry.dataUrl}`, import.meta.url)));
  if (data.meta.id !== setId) throw new Error(`${setId}: meta.id mismatch`);
  if (data.meta.count !== data.words.length) throw new Error(`${setId}: count mismatch`);
  if (!Number.isInteger(data.meta.dataVersion) || data.meta.dataVersion < 1) throw new Error(`${setId}: invalid dataVersion`);
  const ids = new Set();
  for (const word of data.words) {
    for (const key of ["id", "headword", "kanji", "meanings", "example", "translation", "source", "cloze"]) {
      if (!word[key] || (Array.isArray(word[key]) && !word[key].length)) throw new Error(`${setId}: ${word.id || "unknown"} missing ${key}`);
    }
    if (ids.has(word.id)) throw new Error(`${setId}: duplicate id ${word.id}`);
    ids.add(word.id);
  }
  console.log(`OK: ${setId} / ${data.words.length}語`);
}
