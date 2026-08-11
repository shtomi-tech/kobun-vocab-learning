import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("../", import.meta.url);
const read = (relativePath) => fs.readFileSync(new URL(relativePath, root), "utf8");

const manifest = JSON.parse(read("data/manifest.json"));
assert.equal(manifest.sets["kobun-set-06"].dataUrl, "data/set-06.json");

const data = JSON.parse(read("data/set-06.json"));
assert.equal(data.meta.id, "kobun-set-06");
assert.equal(data.meta.count, 12);
assert.equal(data.meta.dataVersion, 1);
assert.deepEqual(
  data.words.map((word) => word.id),
  Array.from({ length: 12 }, (_, index) => `kv06-${String(index + 61).padStart(3, "0")}`),
);

for (const word of data.words) {
  assert.equal((word.cloze.match(/（　）/g) ?? []).length, 1, `${word.id}: cloze must have one blank`);
  assert.ok(word.meanings.length >= 1, `${word.id}: meanings are required`);
  assert.ok(word.example && word.translation && word.source, `${word.id}: example fields are required`);
  assert.ok(!word.example.endsWith(`（${word.source}）`), `${word.id}: source is duplicated in example`);
}

const wordsById = new Map(data.words.map((word) => [word.id, word]));
const word69 = wordsById.get("kv06-069");
assert.equal(word69.example, "かの女君ゆめのごとありしに、ただならずなりにけり。");
assert.equal(word69.translation, "その女君は、夢のような一夜を過ごしたところ、妊娠した。");
assert.equal(word69.cloze, "かの女君ゆめのごとありしに、（　）なりにけり。");
assert.equal(word69.source, "宇津保物語");

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

const normalizeMeaning = (value) => value.replace(/[「」『』【】（）()、。・／\s]/g, "");
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
  left.meanings.some((meaning) => family.test(meaning)) &&
  right.meanings.some((meaning) => family.test(meaning))
);
const isSafePair = (left, right) => !hasMeaningOverlap(left, right) && !hasMeaningFamilyOverlap(left, right);
const overlapsByMeaningFamily = (leftId, rightId) =>
  hasMeaningFamilyOverlap(wordsById.get(leftId), wordsById.get(rightId));

const nearMeaningIds = ["kv06-063", "kv06-064", "kv06-068", "kv06-069"];
for (let leftIndex = 0; leftIndex < nearMeaningIds.length; leftIndex += 1) {
  for (let rightIndex = leftIndex + 1; rightIndex < nearMeaningIds.length; rightIndex += 1) {
    const leftId = nearMeaningIds[leftIndex];
    const rightId = nearMeaningIds[rightIndex];
    assert.ok(overlapsByMeaningFamily(leftId, rightId), `${leftId}/${rightId}: family overlap is not configured`);
  }
}

for (const [leftId, rightId] of [
  ["kv06-066", "kv06-067"],
  ["kv06-071", "kv06-072"],
]) {
  assert.ok(overlapsByMeaningFamily(leftId, rightId), `${leftId}/${rightId}: family overlap is not configured`);
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

console.log("OK: set-06 data and meaning-family guards");
