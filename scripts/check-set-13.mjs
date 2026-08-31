import assert from "node:assert/strict";
import { checkSet } from "./lib/set-check.mjs";

checkSet({
  setId: "kobun-set-13",
  firstNumber: 145,
  expectedForms: new Map([
    ["kv13-145", "こなた"],
    ["kv13-146", "そなた"],
    ["kv13-147", "あなた"],
    ["kv13-148", "あした"],
    ["kv13-149", "つとめて"],
    ["kv13-150", "ひねもす"],
    ["kv13-151", "日一日"],
    ["kv13-152", "よもすがら"],
    ["kv13-153", "夜一夜"],
    ["kv13-154", "ついたち"],
    ["kv13-155", "つごもり"],
    ["kv13-156", "ひごろ"],
  ]),
  expect(wordsById) {
    assert.equal(wordsById.get("kv13-145").source, "枕草子（p.17）");
    assert.equal(wordsById.get("kv13-147").source, "更級日記（p.28）");
    assert.equal(wordsById.get("kv13-148").source, "徒然草（p.355）");
    assert.equal(wordsById.get("kv13-149").source, "枕草子（春はあけぼの・p.1）");
    assert.equal(wordsById.get("kv13-152").source, "更級日記（p.36）");
    assert.equal(wordsById.get("kv13-156").source, "更級日記（p.36）");
  },
  unsafePairs: [
    ["kv13-148", "kv13-149"],
    ["kv13-150", "kv13-151"],
    ["kv13-152", "kv13-153"],
  ],
  summary: "OK: set-13 data, notes, cloze forms, and meaning-choice guards",
});
