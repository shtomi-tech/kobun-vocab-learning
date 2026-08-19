import fs from "node:fs";

const manifest = JSON.parse(fs.readFileSync(new URL("../data/manifest.json", import.meta.url)));
if (!manifest.sets?.[manifest.defaultSetId]) throw new Error("defaultSetId is not registered");

const idsAcrossSets = new Set();
const clozeBlank = "（　）";
const attachedSuffixes = [
  "させて", "ながら", "たまへ", "たまふ", "給へ", "給ふ",
  "けり", "ける", "らん", "らむ", "まし", "べき", "けれ",
  "て", "ば", "む", "ん", "ず",
];
const headwordOwnedSuffixesById = new Map([
  ["kv02-019", "ば"], // よばふ: よば は語の一部で、後続の「ひて」が見えている。
  ["kv03-032", "む"], // よをそむく: よをそむ は語の一部で、後続の「きぬ」が見えている。
  ["kv08-091", "まし"], // まします: 連用形ましましの語尾で、助動詞「まし」ではない。
]);

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
    if (!Array.isArray(word.notes) || !word.notes.length || !word.notes.every((note) => typeof note === "string" && note.trim().length > 0)) throw new Error(`${setId}: ${word.id} missing valid notes`);
    if ((word.cloze.match(/（　）/g) ?? []).length !== 1) throw new Error(`${setId}: ${word.id} cloze must have exactly one blank`);
    const blankIndex = word.cloze.indexOf(clozeBlank);
    const prefix = word.cloze.slice(0, blankIndex);
    const suffix = word.cloze.slice(blankIndex + clozeBlank.length);
    if (!word.example.startsWith(prefix) || !word.example.endsWith(suffix) || prefix.length + suffix.length >= word.example.length) {
      throw new Error(`${setId}: ${word.id} cloze must replace one contiguous span of example`);
    }
    const removed = word.example.slice(prefix.length, word.example.length - suffix.length);
    const attachedSuffix = attachedSuffixes.find((candidate) => removed.endsWith(candidate));
    const headwordForms = [word.headword, word.kanji].flatMap((form) => {
      const withoutParentheticalNote = form.replace(/[（）()]/g, "");
      return [form, form.split("〜")[0], withoutParentheticalNote, withoutParentheticalNote.split("〜")[0]];
    });
    const headwordOwnsSuffix = headwordForms.includes(removed) || headwordOwnedSuffixesById.get(word.id) === attachedSuffix;
    if (attachedSuffix && !headwordOwnsSuffix) {
      throw new Error(`${setId}: ${word.id} cloze blank includes attached suffix ${attachedSuffix}`);
    }
    if (word.example.endsWith(`（${word.source}）`)) throw new Error(`${setId}: ${word.id} source is duplicated in example`);
    if (ids.has(word.id)) throw new Error(`${setId}: duplicate id ${word.id}`);
    ids.add(word.id);
    if (idsAcrossSets.has(word.id)) throw new Error(`cross-set duplicate id ${word.id}`);
    idsAcrossSets.add(word.id);
  }
  console.log(`OK: ${setId} / ${data.words.length}語`);
}
