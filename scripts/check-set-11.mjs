import assert from "node:assert/strict";
import { checkSet } from "./lib/set-check.mjs";

checkSet({
  setId: "kobun-set-11",
  firstNumber: 121,
  expectedForms: new Map([
    ["kv11-121", "まゐれ"],
    ["kv11-122", "侍り"],
    ["kv11-123", "候ひ"],
    ["kv11-124", "上"],
    ["kv11-125", "君"],
    ["kv11-126", "おほやけ"],
    ["kv11-127", "内裏"],
    ["kv11-128", "宮"],
    ["kv11-129", "院"],
    ["kv11-130", "殿"],
    ["kv11-131", "御前"],
    ["kv11-132", "北の方"],
  ]),
  expect(wordsById) {
    assert.deepEqual(wordsById.get("kv11-121").meanings, ["さしあげる。", "参上する。", "召しあがる。"]);
    assert.deepEqual(wordsById.get("kv11-122").meanings, ["あります。います。", "〜です。〜ます。〜ございます。", "お仕えする。お控えする。"]);
    assert.deepEqual(wordsById.get("kv11-123").meanings, ["あります。います。", "〜です。〜ます。〜ございます。", "お仕えする。お控えする。"]);
    assert.deepEqual(wordsById.get("kv11-124").meanings, ["天皇。", "奥様。", "将軍。", "上（⇔下）。"]);
    assert.deepEqual(wordsById.get("kv11-125").meanings, ["天皇。", "主君。", "高貴な人。", "あなた。"]);
    assert.deepEqual(wordsById.get("kv11-126").meanings, ["天皇。", "朝廷。"]);
    assert.deepEqual(wordsById.get("kv11-127").meanings, ["天皇。", "宮中。内裏。", "内側。"]);
    assert.deepEqual(wordsById.get("kv11-128").meanings, ["皇族。", "皇族の邸。", "神社。"]);
    assert.deepEqual(wordsById.get("kv11-129").meanings, ["上皇。法皇。", "上皇などの貴人の邸。"]);
    assert.deepEqual(wordsById.get("kv11-130").meanings, ["身分の高い男性貴族。", "身分の高い男性貴族の邸。"]);
    assert.deepEqual(wordsById.get("kv11-131").meanings, ["身分の高いお方。", "身分の高いお方の前。"]);
    assert.deepEqual(wordsById.get("kv11-132").meanings, ["正妻。夫人。", "北の方角。"]);
  },
  unsafePairs: [
    ["kv11-122", "kv11-123"],
    ["kv11-124", "kv11-125"],
    ["kv11-124", "kv11-126"],
    ["kv11-124", "kv11-127"],
    ["kv11-125", "kv11-126"],
    ["kv11-126", "kv11-127"],
    ["kv11-128", "kv11-129"],
  ],
  summary: "OK: set-11 data, notes, cloze forms, and meaning-choice guards",
});
