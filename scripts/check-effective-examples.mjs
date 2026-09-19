import assert from "node:assert/strict";

import { loadSets } from "./lib/data.mjs";
import { validateExample } from "./lib/example-validation.mjs";
import { exampleSource, selectExample } from "./lib/example-source.mjs";

let wakaCount = 0;
let proseCount = 0;
for (const { setId, data } of loadSets()) {
  for (const word of data.words) {
    const effective = selectExample(word);
    assert.ok(["waka", "prose"].includes(effective.exampleForm), `${setId}: ${word.id} effective exampleForm must be waka or prose`);
    validateExample(setId, effective);
    const sourceType = exampleSource.sourceTypeOf(effective);
    assert.ok(sourceType, `${setId}: ${word.id} effective example source type is missing`);
    if (effective.exampleForm === "waka") {
      assert.equal(sourceType, "waka", `${setId}: ${word.id} effective waka must have waka source type`);
      assert.ok(effective.waka && effective.waka.phrases.length === 5, `${setId}: ${word.id} effective waka needs five phrases`);
      assert.equal(effective.waka.phrases.join(""), effective.example, `${setId}: ${word.id} effective waka must reconstruct example`);
      wakaCount += 1;
    } else {
      assert.ok(!effective.waka, `${setId}: ${word.id} effective prose must not retain waka data`);
      proseCount += 1;
    }
  }
}

console.log(`OK: effective examples / waka ${wakaCount}語, prose ${proseCount}語`);
