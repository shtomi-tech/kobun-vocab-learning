import assert from "node:assert/strict";
import { checkSet } from "./lib/set-check.mjs";

checkSet({
  setId: "kobun-set-09",
  firstNumber: 97,
  expectedForms: new Map([
    ["kv09-097", "のたまはす"],
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
    assert.equal(wordsById.get("kv09-097").example, "「御狩の行幸し給はむやうにて見てむや。」とのたまはす。");
    assert.equal(wordsById.get("kv09-097").source, "竹取物語（御狩の行幸）");
    assert.equal(wordsById.get("kv09-097").cloze, "「御狩の行幸し給はむやうにて見てむや。」と（　）。");
    assert.equal(wordsById.get("kv09-098").example, "法皇、「あれはいかに是へ。」と仰せければ、");
    assert.equal(wordsById.get("kv09-098").source, "平家物語（巻第八）");
    assert.equal(wordsById.get("kv09-098").cloze, "法皇、「あれはいかに是へ。」と（　）ければ、");
    assert.equal(wordsById.get("kv09-099").source, "竹取物語（天の羽衣）");
    assert.equal(wordsById.get("kv09-100").source, "竹取物語（燕の子安貝）");
    assert.equal(wordsById.get("kv09-101").example, "これを御門御覧じて、いとど還り給はむそらもなく思さる。");
    assert.equal(wordsById.get("kv09-101").translation, "これを帝が御覧になって、ますますお帰りになる気持ちもなくお思いになる。");
    assert.equal(wordsById.get("kv09-101").source, "竹取物語（御狩の行幸）");
    assert.deepEqual(wordsById.get("kv09-102").meanings, ["お聞きになる。", "召しあがる。"]);
    assert.deepEqual(wordsById.get("kv09-105").meanings, ["知っていらっしゃる。", "お治めになる。"]);
    assert.deepEqual(wordsById.get("kv09-106").meanings, ["お呼びになる。", "召しあがる。", "お召しになる。"]);
    assert.deepEqual(wordsById.get("kv09-107").meanings, ["さしあげる。", "〜申しあげる。お〜する。"]);
    assert.deepEqual(wordsById.get("kv09-108").meanings, ["申しあげる。", "〜申しあげる。お〜する。"]);
    assert.equal(wordsById.get("kv09-107").source, "竹取物語（かぐや姫の昇天）");
    assert.equal(wordsById.get("kv09-108").source, "竹取物語（かぐや姫の昇天）");
  },
  unsafePairs: [
    ["kv09-097", "kv09-098"],
    ["kv09-099", "kv09-100"],
    ["kv09-102", "kv09-106"],
    ["kv09-107", "kv09-108"],
  ],
  summary: "OK: set-09 data, notes, cloze forms, and meaning-choice guards",
});
