import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("../", import.meta.url);
const read = (relativePath) => fs.readFileSync(new URL(relativePath, root), "utf8");

const manifest = JSON.parse(read("data/manifest.json"));
assert.equal(manifest.sets["kobun-set-11"].dataUrl, "data/set-11.json");

const data = JSON.parse(read("data/set-11.json"));
assert.equal(data.meta.id, "kobun-set-11");
assert.equal(data.meta.count, 12);
assert.equal(data.meta.dataVersion, 1);
assert.deepEqual(
  data.words.map((word) => word.id),
  Array.from({ length: 12 }, (_, index) => `kv11-${String(index + 121).padStart(3, "0")}`),
);

const expectedForms = new Map([
  ["kv11-121", "まゐれる"],
  ["kv11-122", "侍り"],
  ["kv11-123", "候ひ"],
  ["kv11-124", "上"],
  ["kv11-125", "君"],
  ["kv11-126", "おほやけ"],
  ["kv11-127", "内裏"],
  ["kv11-128", "宮"],
  ["kv11-129", "院"],
  ["kv11-130", "殿"],
  ["kv11-131", "御前"],
  ["kv11-132", "北の方"],
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
assert.deepEqual(wordsById.get("kv11-121").meanings, ["さしあげる。", "参上する。", "召しあがる。"]);
assert.deepEqual(wordsById.get("kv11-122").meanings, ["あります。います。", "〜です。〜ます。〜ございます。", "お仕えする。お控えする。"]);
assert.deepEqual(wordsById.get("kv11-123").meanings, ["あります。います。", "〜です。〜ます。〜ございます。", "お仕えする。お控えする。"]);
assert.deepEqual(wordsById.get("kv11-124").meanings, ["天皇。", "奥様。", "将軍。", "上（⇔下）。"]);
assert.deepEqual(wordsById.get("kv11-125").meanings, ["天皇。", "主君。", "高貴な人。", "あなた。"]);
assert.deepEqual(wordsById.get("kv11-126").meanings, ["天皇。", "朝廷。"]);
assert.deepEqual(wordsById.get("kv11-127").meanings, ["天皇。", "宮中。内裏。", "内側。"]);
assert.deepEqual(wordsById.get("kv11-128").meanings, ["皇族。", "皇族の邸。", "神社。"]);
assert.deepEqual(wordsById.get("kv11-129").meanings, ["上皇。法皇。", "上皇などの貴人の邸。"]);
assert.deepEqual(wordsById.get("kv11-130").meanings, ["身分の高い男性貴族。", "身分の高い男性貴族の邸。"]);
assert.deepEqual(wordsById.get("kv11-131").meanings, ["身分の高いお方。", "身分の高いお方の前。"]);
assert.deepEqual(wordsById.get("kv11-132").meanings, ["正妻。夫人。", "北の方角。"]);

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

const normalizeMeaning = (value) => value.replace(/[「」『』【】（）()、。・／〜～⇔\\s]/g, "");
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
  ["kv11-122", "kv11-123"],
  ["kv11-124", "kv11-125"],
  ["kv11-124", "kv11-126"],
  ["kv11-124", "kv11-127"],
  ["kv11-125", "kv11-126"],
  ["kv11-126", "kv11-127"],
  ["kv11-128", "kv11-129"],
]) {
  assert.ok(!isSafePair(wordsById.get(leftId), wordsById.get(rightId)), `${leftId}/${rightId}: near meanings must not appear together`);
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

console.log("OK: set-11 data, notes, cloze forms, and meaning-choice guards");
