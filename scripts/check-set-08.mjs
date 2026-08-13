import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("../", import.meta.url);
const read = (relativePath) => fs.readFileSync(new URL(relativePath, root), "utf8");

const manifest = JSON.parse(read("data/manifest.json"));
assert.equal(manifest.sets["kobun-set-08"].dataUrl, "data/set-08.json");

const data = JSON.parse(read("data/set-08.json"));
assert.equal(data.meta.id, "kobun-set-08");
assert.equal(data.meta.count, 12);
assert.equal(data.meta.dataVersion, 1);
assert.deepEqual(
  data.words.map((word) => word.id),
  Array.from({ length: 12 }, (_, index) => `kv08-${String(index + 85).padStart(3, "0")}`),
);

const expectedForms = new Map([
  ["kv08-085", "やや"],
  ["kv08-086", "かつ消えかつ"],
  ["kv08-087", "はた"],
  ["kv08-088", "おはしけり"],
  ["kv08-089", "おはします"],
  ["kv08-090", "まさむ"],
  ["kv08-091", "ましましける"],
  ["kv08-092", "いませ"],
  ["kv08-093", "いますがる"],
  ["kv08-094", "賜はす"],
  ["kv08-095", "たうべ"],
  ["kv08-096", "のたまひて"],
]);
const normalize = (value) => value.replace(/\s/g, "");

for (const word of data.words) {
  for (const key of ["headword", "kanji", "example", "translation", "source", "cloze"]) {
    assert.ok(typeof word[key] === "string" && word[key].length > 0, `${word.id}: ${key} is required`);
  }
  assert.ok(word.meanings.length >= 1 && word.meanings.every((meaning) => typeof meaning === "string" && meaning.length > 0), `${word.id}: meanings are required`);
  assert.ok(word.notes?.length >= 1 && word.notes.every((note) => typeof note === "string" && note.length > 0), `${word.id}: notes are required`);
  assert.equal((word.cloze.match(/（　）/g) ?? []).length, 1, `${word.id}: cloze must have one blank`);
  assert.equal(normalize(word.cloze.replace("（　）", expectedForms.get(word.id))), normalize(word.example), `${word.id}: cloze does not restore the example`);
  assert.ok(!word.example.endsWith(`（${word.source}）`), `${word.id}: source is duplicated in example`);
}

const wordsById = new Map(data.words.map((word) => [word.id, word]));
assert.deepEqual(wordsById.get("kv08-085").meanings, ["だんだん。しだいに。"]);
assert.equal(wordsById.get("kv08-086").source, "方丈記");
assert.equal(wordsById.get("kv08-087").source, "平中物語");
assert.equal(wordsById.get("kv08-094").source, "竹取物語");
assert.deepEqual(wordsById.get("kv08-096").meanings, ["おっしゃる。"]);

const source = read("static/mode-vocab.js");
const familyBlock = source.match(/const meaningFamilies = \[(.*?)\n  \];/s)?.[1];
assert.ok(familyBlock, "meaningFamilies must remain a literal array");
const meaningFamilies = familyBlock
  .split(/\r?\n/)
  .map((line) => line.trim().replace(/,$/, ""))
  .filter((line) => line.startsWith("/"))
  .map((literal) => {
    const lastSlash = literal.lastIndexOf("/");
    return new RegExp(literal.slice(1, lastSlash), literal.slice(lastSlash + 1));
  });

const normalizeMeaning = (value) => value.replace(/[「」『』【】（）()、。・／〜～\s]/g, "");
const meaningParts = (value) => value.split(/[。／]/).map(normalizeMeaning).filter(Boolean);
const hasMeaningOverlap = (left, right) => left.meanings.some((meaning) =>
  right.meanings.some((candidate) => meaningParts(meaning).some((leftPart) =>
    meaningParts(candidate).some((rightPart) =>
      leftPart === rightPart || (Math.min(leftPart.length, rightPart.length) >= 4 &&
        (leftPart.includes(rightPart) || rightPart.includes(leftPart)))
    )
  ))
);
const hasMeaningFamilyOverlap = (left, right) => meaningFamilies.some((family) =>
  left.meanings.some((meaning) => family.test(meaning)) && right.meanings.some((meaning) => family.test(meaning))
);
const isSafePair = (left, right) => !hasMeaningOverlap(left, right) && !hasMeaningFamilyOverlap(left, right);

for (const ids of [
  ["kv08-088", "kv08-089", "kv08-090", "kv08-091", "kv08-092", "kv08-093"],
  ["kv08-094", "kv08-095"],
]) {
  for (let left = 0; left < ids.length; left += 1) {
    for (let right = left + 1; right < ids.length; right += 1) {
      assert.ok(hasMeaningFamilyOverlap(wordsById.get(ids[left]), wordsById.get(ids[right])), `${ids[left]}/${ids[right]}: family overlap is not configured`);
    }
  }
}

const allWords = fs.readdirSync(new URL("data/", root))
  .filter((fileName) => /^set-\d+\.json$/.test(fileName))
  .sort()
  .flatMap((fileName) => JSON.parse(read(`data/${fileName}`)).words);
const meaningText = (word) => word.meanings.join("／");
const safeCandidatesFor = (target) => allWords.filter((candidate) =>
  candidate.id !== target.id && meaningText(candidate) !== meaningText(target) && isSafePair(target, candidate)
);
const hasThreeSafeCandidates = (target) => {
  const candidates = safeCandidatesFor(target);
  for (let first = 0; first < candidates.length; first += 1) {
    for (let second = first + 1; second < candidates.length; second += 1) {
      if (!isSafePair(candidates[first], candidates[second])) continue;
      for (let third = second + 1; third < candidates.length; third += 1) {
        if (isSafePair(candidates[first], candidates[third]) && isSafePair(candidates[second], candidates[third])) return true;
      }
    }
  }
  return false;
};

for (const word of data.words) {
  assert.ok(hasThreeSafeCandidates(word), `${word.id}: fewer than three safe distractor words`);
}

console.log("OK: set-08 data, notes, cloze forms, and meaning-family guards");
