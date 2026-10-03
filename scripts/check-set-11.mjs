import assert from "node:assert/strict";
import { checkSet } from "./lib/set-check.mjs";

checkSet({
  setId: "kobun-set-11",
  firstNumber: 121,
  expectedForms: new Map([
    ["kv11-121", "参り"],
    ["kv11-122", "侍る"],
    ["kv11-123", "さぶらふ"],
    ["kv11-124", "上"],
    ["kv11-125", "君"],
    ["kv11-126", "おほやけ"],
    ["kv11-127", "うち"],
    ["kv11-128", "宮"],
    ["kv11-129", "院"],
    ["kv11-130", "殿"],
    ["kv11-131", "御前"],
    ["kv11-132", "北の方"],
  ]),
  expect(wordsById) {
    assert.deepEqual(wordsById.get("kv11-121").meanings, ["さしあげる。", "参上する。", "召しあがる。"]);
    assert.equal(wordsById.get("kv11-121").source, "竹取物語（蓬莱の玉の枝）");
    assert.equal(wordsById.get("kv11-121").example, "「船に乗りて帰り来にけり」と殿に告げやりて、いといたく苦しがりたる様して居給へり。迎へに人多く参りたり。");
    assert.equal(wordsById.get("kv11-121").cloze, "「船に乗りて帰り来にけり」と殿に告げやりて、いといたく苦しがりたる様して居給へり。迎へに人多く（　）たり。");
    assert.deepEqual(wordsById.get("kv11-122").meanings, ["あります。います。", "〜です。〜ます。〜ございます。", "お仕えする。お控えする。"]);
    assert.deepEqual(wordsById.get("kv11-123").meanings, ["あります。います。", "〜です。〜ます。〜ございます。", "お仕えする。お控えする。"]);
    assert.deepEqual(wordsById.get("kv11-124").meanings, ["天皇。", "奥様。", "将軍。", "上（⇔下）。"]);
    assert.deepEqual(wordsById.get("kv11-125").meanings, ["天皇。", "主君。", "高貴な人。", "あなた。"]);
    assert.equal(wordsById.get("kv11-125").source, "源氏物語（若菜下）");
    assert.equal(wordsById.get("kv11-125").example, "次の君とならせたまふべき皇子おはしまさず…。");
    assert.equal(wordsById.get("kv11-125").cloze, "次の（　）とならせたまふべき皇子おはしまさず…。");
    assert.equal(wordsById.get("kv11-127").source, "源氏物語（夕顔）");
    assert.equal(wordsById.get("kv11-127").example, "むげに弱るやうにし給ふ。うちにも聞しめし歎く事かぎりなし。御いのりかたがたに隙なくののしる。");
    assert.equal(wordsById.get("kv11-127").cloze, "むげに弱るやうにし給ふ。（　）にも聞しめし歎く事かぎりなし。御いのりかたがたに隙なくののしる。");
    assert.deepEqual(wordsById.get("kv11-126").meanings, ["天皇。", "朝廷。"]);
    assert.deepEqual(wordsById.get("kv11-127").meanings, ["天皇。", "宮中。内裏。", "内側。"]);
    assert.deepEqual(wordsById.get("kv11-128").meanings, ["皇族。", "皇族の邸。", "神社。"]);
    assert.deepEqual(wordsById.get("kv11-129").meanings, ["上皇。法皇。", "上皇などの貴人の邸。"]);
    assert.deepEqual(wordsById.get("kv11-130").meanings, ["身分の高い男性貴族。", "身分の高い男性貴族の邸。"]);
    assert.deepEqual(wordsById.get("kv11-131").meanings, ["身分の高いお方。", "身分の高いお方の前。"]);
    assert.deepEqual(wordsById.get("kv11-132").meanings, ["正妻。夫人。", "北の方角。"]);
    assert.equal(wordsById.get("kv11-122").source, "竹取物語（つまどひ）");
    assert.equal(wordsById.get("kv11-123").example, "ただ一所深き山へ入り給ひぬ。宮づかさ、さぶらふ人々、皆手を分ちて求め奉れども、");
    assert.equal(wordsById.get("kv11-123").source, "竹取物語（蓬莱の玉の枝）");
    assert.equal(wordsById.get("kv11-123").cloze, "ただ一所深き山へ入り給ひぬ。宮づかさ、（　）人々、皆手を分ちて求め奉れども、");
    assert.equal(wordsById.get("kv11-124").source, "宇津保物語（蔵開・上）");
    assert.equal(wordsById.get("kv11-126").source, "竹取物語（天の羽衣）");
    assert.equal(wordsById.get("kv11-128").source, "伊勢物語");
    assert.equal(wordsById.get("kv11-131").example, "御前に、男ども二百人ばかり居て、物言ひなどす。");
    assert.equal(wordsById.get("kv11-131").source, "宇津保物語（吹上・上）");
    assert.equal(wordsById.get("kv11-131").cloze, "（　）に、男ども二百人ばかり居て、物言ひなどす。");
    assert.equal(wordsById.get("kv11-132").example, "三条におはして、北の方に、ありつるやう申し給ひて、この御文の目録を見給へば、");
    assert.equal(wordsById.get("kv11-132").source, "宇津保物語（蔵開・上）");
    assert.equal(wordsById.get("kv11-132").cloze, "三条におはして、（　）に、ありつるやう申し給ひて、この御文の目録を見給へば、");
    assert.equal(wordsById.get("kv11-130").example, "外よりきたる者どもなどぞ、「殿は何にかならせ給へる」など問ふ。答には、「何の前司にこそは」と、必いらふる。");
    assert.equal(wordsById.get("kv11-130").source, "枕草子（すさまじきもの）");
    assert.equal(wordsById.get("kv11-130").cloze, "外よりきたる者どもなどぞ、「（　）は何にかならせ給へる」など問ふ。答には、「何の前司にこそは」と、必いらふる。");
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
