import assert from "node:assert/strict";
import { checkSet, allPairs } from "./lib/set-check.mjs";

checkSet({
  setId: "kobun-set-08",
  firstNumber: 85,
  expectedForms: new Map([
    ["kv08-085", "やや"],
    ["kv08-086", "かつ"],
    ["kv08-087", "はた"],
    ["kv08-088", "おはし"],
    ["kv08-089", "おはします"],
    ["kv08-090", "まさ"],
    ["kv08-091", "ましまし"],
    ["kv08-092", "いませ"],
    ["kv08-093", "いますがる"],
    ["kv08-094", "賜はす"],
    ["kv08-095", "たうべ"],
    ["kv08-096", "のたまひ"],
  ]),
  expect(wordsById) {
    assert.deepEqual(wordsById.get("kv08-085").meanings, ["だんだん。しだいに。"]);
    assert.equal(wordsById.get("kv08-086").source, "方丈記");
    assert.equal(wordsById.get("kv08-087").source, "平中物語");
    assert.equal(wordsById.get("kv08-094").source, "竹取物語");
    assert.deepEqual(wordsById.get("kv08-096").meanings, ["おっしゃる。"]);
  },
  familyOverlapPairs: [
    ...allPairs(["kv08-088", "kv08-089", "kv08-090", "kv08-091", "kv08-092", "kv08-093"]),
    ...allPairs(["kv08-094", "kv08-095"]),
  ],
  summary: "OK: set-08 data, notes, cloze forms, and meaning-family guards",
});
