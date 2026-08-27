import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("../", import.meta.url);
const read = (relativePath) => fs.readFileSync(new URL(relativePath, root), "utf8");

const source = read("static/mode-vocab.js");
const choiceSet = source.match(/function choiceSet\(word, kind\) \{(.*?)\n  \}\n\n  function meaningChoicesAreSafe/s)?.[1];
assert.ok(choiceSet, "choiceSet must remain available for the context-choice contract");
assert.doesNotMatch(choiceSet, /kind !== "meaning"/, "context choices must not bypass meaning-overlap guards");

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

const normalizeMeaning = (value) => value.replace(/[「」『』【】（）()、。・／〜～⇔①②③④⑤\s]/g, "");
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

const manifest = JSON.parse(read("data/manifest.json"));
const allWords = Object.values(manifest.sets).flatMap(({ dataUrl }) => JSON.parse(read(dataUrl)).words);
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

for (const word of allWords) {
  assert.ok(hasThreeSafeCandidates(word), `${word.id}: fewer than three mutually safe context distractors`);
}

console.log(`OK: context-choice overlap guards / ${allWords.length}語`);
