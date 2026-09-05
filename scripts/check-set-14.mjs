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
    assert.equal(wordsById.get("kv14-157").source, "源氏物語（若紫）");
    assert.equal(wordsById.get("kv14-158").source, "更級日記");
    assert.equal(wordsById.get("kv14-161").source, "徒然草");
    assert.equal(wordsById.get("kv14-160").source, "源氏物語（葵）");
    assert.equal(wordsById.get("kv14-162").source, "源氏物語（末摘花）");
    assert.equal(wordsById.get("kv14-163").source, "竹取物語（燕の子安貝）");
    assert.equal(wordsById.get("kv14-164").source, "源氏物語（帚木）");
    assert.equal(wordsById.get("kv14-165").source, "源氏物語（若紫）");
    assert.equal(wordsById.get("kv14-166").source, "竹取物語（つまどひ）");
    assert.equal(wordsById.get("kv14-167").source, "源氏物語（若紫）");
    assert.equal(wordsById.get("kv14-168").source, "源氏物語（若紫）");
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
