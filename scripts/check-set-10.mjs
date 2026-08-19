import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("../", import.meta.url);
const read = (relativePath) => fs.readFileSync(new URL(relativePath, root), "utf8");

const manifest = JSON.parse(read("data/manifest.json"));
assert.equal(manifest.sets["kobun-set-10"].dataUrl, "data/set-10.json");

const data = JSON.parse(read("data/set-10.json"));
assert.equal(data.meta.id, "kobun-set-10");
assert.equal(data.meta.count, 12);
assert.equal(data.meta.dataVersion, 1);
assert.deepEqual(
  data.words.map((word) => word.id),
  Array.from({ length: 12 }, (_, index) => `kv10-${String(index + 109).padStart(3, "0")}`),
);

const expectedForms = new Map([
  ["kv10-109", "聞こゆれ"],
  ["kv10-110", "きこえさす"],
  ["kv10-111", "奏し"],
  ["kv10-112", "啓し"],
  ["kv10-113", "賜り"],
  ["kv10-114", "うけたまはら"],
  ["kv10-115", "まうで"],
  ["kv10-116", "罷ら"],
  ["kv10-117", "まかで"],
  ["kv10-118", "つかうまつる"],
  ["kv10-119", "たまふる"],
  ["kv10-120", "たてまつり"],
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
assert.deepEqual(wordsById.get("kv10-109").meanings, ["申しあげる。", "〜申しあげる。お〜する。"]);
assert.deepEqual(wordsById.get("kv10-110").meanings, ["申しあげる。", "〜申しあげる。お〜する。"]);
assert.deepEqual(wordsById.get("kv10-111").meanings, ["（天皇に）申しあげる。"]);
assert.deepEqual(wordsById.get("kv10-112").meanings, ["（中宮または東宮に）申しあげる。"]);
assert.deepEqual(wordsById.get("kv10-113").meanings, ["いただく。"]);
assert.deepEqual(wordsById.get("kv10-114").meanings, ["いただく。お受けする。", "お聞きする。"]);
assert.deepEqual(wordsById.get("kv10-115").meanings, ["参上する。"]);
assert.deepEqual(wordsById.get("kv10-116").meanings, ["退出する。", "おいとまする。"]);
assert.deepEqual(wordsById.get("kv10-117").meanings, ["退出する。", "おいとまする。"]);
assert.deepEqual(wordsById.get("kv10-118").meanings, ["お仕えする。", "いたす。"]);
assert.deepEqual(wordsById.get("kv10-119").meanings, ["お与えになる。くださる。", "〜なさる。お〜になる。", "〜ております。"]);
assert.deepEqual(wordsById.get("kv10-120").meanings, ["さしあげる。", "お〜する。〜申しあげる。", "召しあがる。", "お召しになる。", "お乗りになる。"]);

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

const humbleSpeechIds = ["kv10-109", "kv10-110", "kv10-111", "kv10-112"];
for (let left = 0; left < humbleSpeechIds.length; left += 1) {
  for (let right = left + 1; right < humbleSpeechIds.length; right += 1) {
    assert.ok(hasMeaningFamilyOverlap(wordsById.get(humbleSpeechIds[left]), wordsById.get(humbleSpeechIds[right])), `${humbleSpeechIds[left]}/${humbleSpeechIds[right]}: humble-speech family overlap is not configured`);
  }
}

for (const [leftId, rightId] of [
  ["kv10-113", "kv10-114"],
  ["kv10-116", "kv10-117"],
  ["kv10-119", "kv10-120"],
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

console.log("OK: set-10 data, notes, cloze forms, and meaning-choice guards");
