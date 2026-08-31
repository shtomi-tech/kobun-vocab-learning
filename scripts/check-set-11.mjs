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
    assert.equal(wordsById.get("kv11-122").source, "宇津保物語（蔵開・上）");
    assert.equal(wordsById.get("kv11-123").example, "女房や候ひ給ふ。");
    assert.equal(wordsById.get("kv11-123").source, "枕草子（第六十二段「はしたなきもの」）");
    assert.equal(wordsById.get("kv11-123").cloze, "女房や（　）給ふ。");
    assert.equal(wordsById.get("kv11-124").source, "宇津保物語（蔵開・上）");
    assert.equal(wordsById.get("kv11-126").source, "大鏡（太政大臣伊尹伝）");
    assert.equal(wordsById.get("kv11-128").source, "伊勢物語");
    assert.equal(wordsById.get("kv11-131").example, "御前に、男ども二百人ばかり居て、物言ひなどす。");
    assert.equal(wordsById.get("kv11-131").source, "宇津保物語（吹上・上）");
    assert.equal(wordsById.get("kv11-131").cloze, "（　）に、男ども二百人ばかり居て、物言ひなどす。");
    assert.equal(wordsById.get("kv11-132").example, "三條におはして、北の方に、ありつるやう申し給ひて、この御文の目錄を見給へば、");
    assert.equal(wordsById.get("kv11-132").source, "宇津保物語（蔵開・上）");
    assert.equal(wordsById.get("kv11-132").cloze, "三條におはして、（　）に、ありつるやう申し給ひて、この御文の目錄を見給へば、");
    assert.equal(wordsById.get("kv11-130").example, "其夜中にぞ、二條殿に歸らせ給ふ。");
    assert.equal(wordsById.get("kv11-130").source, "栄花物語（巻二・見はてぬ夢）");
    assert.equal(wordsById.get("kv11-130").cloze, "其夜中にぞ、二條（　）に歸らせ給ふ。");
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
