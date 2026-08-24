import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("../", import.meta.url);
const read = (relativePath) => fs.readFileSync(new URL(relativePath, root), "utf8");

const source = read("static/mode-vocab.js");
const choiceSet = source.match(/function choiceSet\(word, kind\) \{(.*?)\n  \}\n\n  function meaningChoicesAreSafe/s)?.[1];
assert.ok(choiceSet, "choiceSet must remain available for the waka-choice contract");
assert.doesNotMatch(choiceSet, /kind !== "meaning"/, "context choices must not bypass meaning-overlap guards");
assert.match(choiceSet, /kind === "context" && word\.exampleForm === "waka"/, "mora prioritization must be limited to waka context questions");
assert.match(choiceSet, /contextMoraCount/, "waka context choices must count headword mora");
assert.match(choiceSet, /preferredCandidates/, "waka context choices must have a preferred candidate group");
assert.match(choiceSet, /addCandidates\(preferredCandidates\)/, "preferred candidates must be added before fallback candidates");
assert.match(choiceSet, /addCandidates\(distinctCandidates\)/, "safe candidates must remain the fallback group");

const meaningFamilies = [
  /出家|僧|尼|入道|入寂|仏道/u,
  /死|亡|命終|身まか|世を去/u,
  /美しい|上品|優美|高貴|気品/u,
  /普通|ありきたり|平凡|特に何も/u,
  /恋人|愛人|妻|夫/u,
  /主人|主君|持ち主|所有者/u,
];
const smallKana = new Set(["ゃ", "ゅ", "ょ", "ぁ", "ぃ", "ぅ", "ぇ", "ぉ"]);
const contextMoraCount = (word) => [...word.headword.split("〜")[0]].filter((character) => !smallKana.has(character)).length;
const normalizeMeaning = (value) => value.replace(/[「」『』【】（）()、。・／〜～⇔\s]/g, "");
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
const sets = Object.entries(manifest.sets).map(([setId, { dataUrl }]) => ({
  setId,
  words: JSON.parse(read(dataUrl)).words,
}));
const allWords = sets.flatMap(({ words }) => words);
const wakaWords = allWords.filter((word) => word.exampleForm === "waka");
assert.ok(wakaWords.length >= 6, "the six phase1 waka words must remain in the data");

for (const { setId, words } of sets) {
  for (const word of words.filter((candidate) => candidate.exampleForm === "waka")) {
    const targetMora = contextMoraCount(word);
    const sameSetSafeCandidates = words.filter((candidate) =>
      candidate.id !== word.id &&
      Math.abs(contextMoraCount(candidate) - targetMora) <= 1 &&
      isSafePair(word, candidate)
    );
    assert.ok(sameSetSafeCandidates.length > 0, `${setId}/${word.id}: no same-set same-mora safe distractor exists for the priority check`);
  }
}

console.log(`OK: waka context-choice mora priority / ${wakaWords.length}語`);
