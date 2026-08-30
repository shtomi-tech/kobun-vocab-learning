import assert from "node:assert/strict";
import { checkSet } from "./lib/set-check.mjs";

checkSet({
  setId: "kobun-set-09",
  firstNumber: 97,
  expectedForms: new Map([
    ["kv09-097", "の給はす"],
    ["kv09-098", "仰せ"],
    ["kv09-099", "おぼす"],
    ["kv09-100", "おぼしめさ"],
    ["kv09-101", "御覧じ"],
    ["kv09-102", "きこしめさ"],
    ["kv09-103", "あそばし"],
    ["kv09-104", "大殿籠もら"],
    ["kv09-105", "しろしめし"],
    ["kv09-106", "召さ"],
    ["kv09-107", "まゐらす"],
    ["kv09-108", "申し"],
  ]),
  expect(wordsById) {
    assert.deepEqual(wordsById.get("kv09-097").meanings, ["おっしゃる。"]);
    assert.equal(wordsById.get("kv09-101").example, "これを帝御覧じて、いとど帰り給はむ空もなく思さる。");
    assert.equal(wordsById.get("kv09-101").translation, "これを帝が御覧になって、ますます帰ろうという気持ちもなくお思いになる。");
    assert.deepEqual(wordsById.get("kv09-102").meanings, ["お聞きになる。", "召しあがる。"]);
    assert.deepEqual(wordsById.get("kv09-105").meanings, ["知っていらっしゃる。", "お治めになる。"]);
    assert.deepEqual(wordsById.get("kv09-106").meanings, ["お呼びになる。", "召しあがる。", "お召しになる。"]);
    assert.deepEqual(wordsById.get("kv09-107").meanings, ["さしあげる。", "〜申しあげる。お〜する。"]);
    assert.deepEqual(wordsById.get("kv09-108").meanings, ["申しあげる。", "〜申しあげる。お〜する。"]);
  },
  unsafePairs: [
    ["kv09-097", "kv09-098"],
    ["kv09-099", "kv09-100"],
    ["kv09-102", "kv09-106"],
    ["kv09-107", "kv09-108"],
  ],
  summary: "OK: set-09 data, notes, cloze forms, and meaning-choice guards",
});
