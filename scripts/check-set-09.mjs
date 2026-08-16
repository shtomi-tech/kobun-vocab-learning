import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("../", import.meta.url);
const read = (relativePath) => fs.readFileSync(new URL(relativePath, root), "utf8");

const manifest = JSON.parse(read("data/manifest.json"));
assert.equal(manifest.sets["kobun-set-09"].dataUrl, "data/set-09.json");

const data = JSON.parse(read("data/set-09.json"));
assert.equal(data.meta.id, "kobun-set-09");
assert.equal(data.meta.count, 12);
assert.equal(data.meta.dataVersion, 1);
assert.deepEqual(
  data.words.map((word) => word.id),
  Array.from({ length: 12 }, (_, index) => `kv09-${String(index + 97).padStart(3, "0")}`),
);

const expectedForms = new Map([
  ["kv09-097", "の給はす"],
  ["kv09-098", "仰せければ"],
  ["kv09-099", "おぼすらん"],
  ["kv09-100", "おぼしめさば"],
  ["kv09-101", "御覧じて"],
  ["kv09-102", "きこしめさず"],
  ["kv09-103", "あそばし"],
  ["kv09-104", "大殿籠もら"],
  ["kv09-105", "しろしめしながら"],
  ["kv09-106", "召さまし"],
  ["kv09-107", "まゐらす"],
  ["kv09-108", "申して"],
]);
const normalize = (value) => value.replace(/\s/g, "");

for (const word of data.words) {
  for (const key of ["headword", "kanji", "example", "translation", "source", "cloze"]) {
    assert.ok(typeof word[key] === "string" && word[key].length > 0, `${word.id}: ${key} is required`);
  }
  assert.ok(word.meanings.length >= 1 && word.meanings.every((meaning) => typeof meaning === "string" && meaning.length > 0), `${word.id}: meanings are required`);
  assert.ok(word.notes?.length >= 1 && word.notes.every((note) => typeof note === "string" && note.trim().length > 0), `${word.id}: notes are required`);
  assert.equal((word.cloze.match(/（　）/g) ?? []).length, 1, `${word.id}: cloze must have one blank`);
  assert.equal(normalize(word.cloze.replace("（　）", expectedForms.get(word.id))), normalize(word.example), `${word.id}: cloze does not restore the example`);
  assert.ok(!word.example.endsWith(`（${word.source}）`), `${word.id}: source is duplicated in example`);
}

const wordsById = new Map(data.words.map((word) => [word.id, word]));
assert.deepEqual(wordsById.get("kv09-097").meanings, ["おっしゃる。"]);
assert.equal(wordsById.get("kv09-101").example, "これを帝御覧じて、いとど帰り給はむ空もなく思さる。");
assert.equal(wordsById.get("kv09-101").translation, "これを帝が御覧になって、ますます帰ろうという気持ちもなくお思いになる。");
assert.deepEqual(wordsById.get("kv09-102").meanings, ["お聞きになる。", "召しあがる。"]);
assert.deepEqual(wordsById.get("kv09-105").meanings, ["知っていらっしゃる。", "お治めになる。"]);
assert.deepEqual(wordsById.get("kv09-106").meanings, ["お呼びになる。", "召しあがる。", "お召しになる。"]);
assert.deepEqual(wordsById.get("kv09-107").meanings, ["さしあげる。", "〜申しあげる。お〜する。"]);
assert.deepEqual(wordsById.get("kv09-108").meanings, ["申しあげる。", "〜申しあげる。お〜する。"]);

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

for (const [leftId, rightId] of [
  ["kv09-097", "kv09-098"],
  ["kv09-099", "kv09-100"],
  ["kv09-102", "kv09-106"],
  ["kv09-107", "kv09-108"],
]) {
  assert.ok(!isSafePair(wordsById.get(leftId), wordsById.get(rightId)), `${leftId}/${rightId}: near-identical meanings must not appear together`);
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

console.log("OK: set-09 data, notes, cloze forms, and meaning-choice guards");
