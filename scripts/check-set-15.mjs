import assert from "node:assert/strict";
import { checkSet } from "./lib/set-check.mjs";

checkSet({
  setId: "kobun-set-15",
  firstNumber: 169,
  expectedForms: new Map([
    ["kv15-169", "ひがこと"],
    ["kv15-170", "ひがおぼえ"],
    ["kv15-171", "ひがひがし"],
    ["kv15-172", "をこなら"],
    ["kv15-173", "をこがまし"],
    ["kv15-174", "殊なる"],
    ["kv15-175", "こと心"],
    ["kv15-176", "そらなり"],
    ["kv15-177", "虚言"],
    ["kv15-178", "一日"],
    ["kv15-179", "物憂く"],
    ["kv15-180", "生"],
  ]),
  expect(wordsById) {
    assert.equal(wordsById.get("kv15-170").source, "枕草子（清涼殿の丑寅のすみの・p.21）");
    assert.equal(wordsById.get("kv15-175").source, "伊勢物語（第二十三段・p.25）");
    assert.equal(wordsById.get("kv15-175").example, "男、こと心ありてかかる前栽の中にかくれゐて、かの河内へいぬるがほにて、見れば、この女、いとようけさうじで、うちながめて、…");
    assert.equal(wordsById.get("kv15-175").cloze, "男、（　）ありてかかる前栽の中にかくれゐて、かの河内へいぬるがほにて、見れば、この女、いとようけさうじで、うちながめて、…");
  },
  unsafePairs: [
    ["kv15-172", "kv15-173"],
  ],
  summary: "OK: set-15 data, notes, cloze forms, and meaning-choice guards",
});
