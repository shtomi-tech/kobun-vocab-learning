import assert from "node:assert/strict";
import { checkSet } from "./lib/set-check.mjs";

checkSet({
  setId: "kobun-set-14",
  firstNumber: 157,
  expectedForms: new Map([
    ["kv14-157", "月ごろ"],
    ["kv14-158", "年ごろ"],
    ["kv14-159", "来し方"],
    ["kv14-160", "ゆくすゑ"],
    ["kv14-161", "あだなる"],
    ["kv14-162", "あだあだし"],
    ["kv14-163", "まめなる"],
    ["kv14-164", "まめまめし"],
    ["kv14-165", "まめやかに"],
    ["kv14-166", "貴なる"],
    ["kv14-167", "あてはかなり"],
    ["kv14-168", "ただなる"],
  ]),
  expect(wordsById) {
    assert.equal(wordsById.get("kv14-158").source, "更級日記（新註・p.14）");
    assert.equal(wordsById.get("kv14-161").source, "徒然草（p.395）");
    assert.equal(wordsById.get("kv14-163").source, "竹取物語（燕の子安貝・p.40）");
    assert.equal(wordsById.get("kv14-166").source, "竹取物語（つまどひ・p.3）");
    assert.equal(wordsById.get("kv14-163").example, "まめなる男ども二十人ばかり遣して、あななひにあげすゑられたり。");
    assert.equal(wordsById.get("kv14-166").example, "世界の男、貴なるも賤しきも、「いかでこのかぐや姫を得てしかな、見てしかな」と、音に聞きめでて惑ふ。");
  },
  unsafePairs: [
    ["kv14-161", "kv14-162"],
    ["kv14-163", "kv14-164"],
    ["kv14-163", "kv14-165"],
    ["kv14-164", "kv14-165"],
    ["kv14-166", "kv14-167"],
  ],
  summary: "OK: set-14 data, notes, cloze forms, and meaning-choice guards",
});
