import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("../", import.meta.url);
const read = (relativePath) => fs.readFileSync(new URL(relativePath, root), "utf8");

const manifest = JSON.parse(read("data/manifest.json"));
assert.equal(manifest.sets["kobun-set-07"].dataUrl, "data/set-07.json");

const data = JSON.parse(read("data/set-07.json"));
assert.equal(data.meta.id, "kobun-set-07");
assert.equal(data.meta.count, 12);
assert.equal(data.meta.dataVersion, 1);
assert.deepEqual(
  data.words.map((word) => word.id),
  Array.from({ length: 12 }, (_, index) => `kv07-${String(index + 73).padStart(3, "0")}`),
);

for (const word of data.words) {
  assert.equal((word.cloze.match(/（　）/g) ?? []).length, 1, `${word.id}: cloze must have one blank`);
  assert.ok(word.meanings.length >= 1 && word.meanings.every((meaning) => typeof meaning === "string" && meaning.length > 0), `${word.id}: meanings are required`);
  assert.ok(word.example && word.translation && word.source, `${word.id}: example fields are required`);
  assert.ok(!word.example.endsWith(`（${word.source}）`), `${word.id}: source is duplicated in example`);
}

const wordsById = new Map(data.words.map((word) => [word.id, word]));

const word78 = wordsById.get("kv07-078");
assert.equal(word78.example, "あなかしこあだにな。");
assert.equal(word78.translation, "けっしていいかげんにするな。");
assert.equal(word78.source, "源氏物語");

const word79 = wordsById.get("kv07-079");
assert.equal(word79.example, "ゆめゆめ人に語るべからず。");
assert.equal(word79.translation, "けっして人に語るな。");
assert.equal(word79.source, "宇治拾遺物語");

const word83 = wordsById.get("kv07-083");
assert.deepEqual(word83.meanings, ["やはり。依然として。", "それでもやはり。なんと言ってもやはり。"]);

const word73 = wordsById.get("kv07-073");
assert.equal(word73.example, "世の中にたえて桜のなかりせば春の心はのどけからまし");
assert.equal(word73.translation, "この世の中にまったく桜がなかったならば、春を過ごす人の心はどれほどのどかであったことだろう。");
assert.equal(word73.source, "古今和歌集");
assert.equal(word73.cloze, "世の中に（　）桜のなかりせば春の心はのどけからまし");

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
  hasMeaningFamilyOverlap(wordsById.get(leftId) ?? allWordsById.get(leftId), wordsById.get(rightId) ?? allWordsById.get(rightId));

const allWords = fs.readdirSync(new URL("data/", root))
  .filter((fileName) => /^set-\d+\.json$/.test(fileName))
  .sort()
  .flatMap((fileName) => JSON.parse(read(`data/${fileName}`)).words);
const allWordsById = new Map(allWords.map((word) => [word.id, word]));

const strongNegationIds = ["kv06-072", "kv07-073", "kv07-074", "kv07-075", "kv07-076"];
for (let leftIndex = 0; leftIndex < strongNegationIds.length; leftIndex += 1) {
  for (let rightIndex = leftIndex + 1; rightIndex < strongNegationIds.length; rightIndex += 1) {
    const leftId = strongNegationIds[leftIndex];
    const rightId = strongNegationIds[rightIndex];
    assert.ok(overlapsByMeaningFamily(leftId, rightId), `${leftId}/${rightId}: family overlap is not configured`);
  }
}

const prohibitionIds = ["kv07-078", "kv07-079", "kv07-080"];
for (let leftIndex = 0; leftIndex < prohibitionIds.length; leftIndex += 1) {
  for (let rightIndex = leftIndex + 1; rightIndex < prohibitionIds.length; rightIndex += 1) {
    const leftId = prohibitionIds[leftIndex];
    const rightId = prohibitionIds[rightIndex];
    assert.ok(overlapsByMeaningFamily(leftId, rightId), `${leftId}/${rightId}: family overlap is not configured`);
  }
}

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

console.log("OK: set-07 data and meaning-family guards");
