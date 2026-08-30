import assert from "node:assert/strict";
import { read, allWords, hasThreeSafeCandidates } from "./lib/set-check.mjs";

// 文中四択も意味四択と同じ重複ガードを通ることを、実装の字面で確かめる。
const source = read("static/mode-vocab.js");
const choiceSet = source.match(/function choiceSet\(word, kind\) \{(.*?)\n  \}\n\n  function meaningChoicesAreSafe/s)?.[1];
assert.ok(choiceSet, "choiceSet must remain available for the context-choice contract");
assert.doesNotMatch(choiceSet, /kind !== "meaning"/, "context choices must not bypass meaning-overlap guards");
assert.match(source, /KobunMeaningGuard/, "mode-vocab.js must use the shared meaning guard");

for (const word of allWords()) {
  assert.ok(hasThreeSafeCandidates(word), `${word.id}: fewer than three mutually safe context distractors`);
}

console.log(`OK: context-choice overlap guards / ${allWords().length}語`);
