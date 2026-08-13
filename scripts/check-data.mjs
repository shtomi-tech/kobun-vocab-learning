import fs from "node:fs";

const manifest = JSON.parse(fs.readFileSync(new URL("../data/manifest.json", import.meta.url)));
if (!manifest.sets?.[manifest.defaultSetId]) throw new Error("defaultSetId is not registered");

const idsAcrossSets = new Set();

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
    if (!word.meanings.every((meaning) => typeof meaning === "string" && meaning.length > 0)) throw new Error(`${setId}: ${word.id} has an empty meaning`);
    if (word.notes && (!Array.isArray(word.notes) || !word.notes.length || !word.notes.every((note) => typeof note === "string" && note.length > 0))) throw new Error(`${setId}: ${word.id} has invalid notes`);
    if ((word.cloze.match(/（　）/g) ?? []).length !== 1) throw new Error(`${setId}: ${word.id} cloze must have exactly one blank`);
    if (word.example.endsWith(`（${word.source}）`)) throw new Error(`${setId}: ${word.id} source is duplicated in example`);
    if (ids.has(word.id)) throw new Error(`${setId}: duplicate id ${word.id}`);
    ids.add(word.id);
    if (idsAcrossSets.has(word.id)) throw new Error(`cross-set duplicate id ${word.id}`);
    idsAcrossSets.add(word.id);
  }
  console.log(`OK: ${setId} / ${data.words.length}語`);
}
