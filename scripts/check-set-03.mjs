import assert from "node:assert/strict";
import { checkSet } from "./lib/set-check.mjs";

checkSet({
  setId: "kobun-set-03",
  firstNumber: 25,
  expectedForms: new Map([
    ["kv03-025", "よのなか"],
    ["kv03-026", "かれ"],
    ["kv03-027", "かきくらす"],
    ["kv03-028", "しほたれ"],
    ["kv03-029", "袖さへしぼる"],
    ["kv03-030", "音を"],
    ["kv03-031", "かしらおろし"],
    ["kv03-032", "よをそむ"],
    ["kv03-033", "おこなひ"],
    ["kv03-034", "勤むる"],
    ["kv03-035", "ほだし"],
    ["kv03-036", "うせ"],
  ]),
  expect(wordsById) {
    const word25 = wordsById.get("kv03-025");
    assert.equal(word25.source, "和泉式部日記（p.39）");
    assert.equal(word25.example, "女は、雲間なきながめに「よのなかいかになりぬるならむ」とつきせずのみ眺めて…。");
    assert.equal(word25.cloze, "女は、雲間なきながめに「（　）いかになりぬるならむ」とつきせずのみ眺めて…。");

    const word26 = wordsById.get("kv03-026");
    assert.equal(word26.source, "古今和歌集");
    assert.equal(word26.example, "山里は冬ぞさびしさまさりける人目も草もかれぬと思へば");

    const word27 = wordsById.get("kv03-027");
    assert.equal(word27.source, "狭衣物語（巻第一之下）");
    assert.equal(word27.example, "あやしく物恐ろしきに、衣を引きかづきて臥したるに、こはいかなる事ぞと唯かきくらす心地すれば…。");
    assert.equal(word27.cloze, "あやしく物恐ろしきに、衣を引きかづきて臥したるに、こはいかなる事ぞと唯（　）心地すれば…。");

    const word28 = wordsById.get("kv03-028");
    assert.equal(word28.source, "源氏物語（明石）");

    const word29 = wordsById.get("kv03-029");
    assert.equal(word29.source, "狭衣物語（巻第三之下）");
    assert.equal(word29.example, "「唯今宵ばかりこそは、かうまでも聞えさせめ」とて泣き給ふさま、人の御袖さへしぼるばかりになりぬるに…。");
    assert.equal(word29.cloze, "「唯今宵ばかりこそは、かうまでも聞えさせめ」とて泣き給ふさま、人の御（　）ばかりになりぬるに…。");

    const word30 = wordsById.get("kv03-030");
    assert.equal(word30.source, "宇治拾遺物語（巻十・第六話）");
    assert.equal(word30.example, "日を數へて、明暮は唯だ音をのみ泣く。");
    assert.equal(word30.cloze, "日を數へて、明暮は唯だ（　）のみ泣く。");

    const word31 = wordsById.get("kv03-031");
    assert.equal(word31.source, "古今和歌集（詞書・巻六）");
    const word34 = wordsById.get("kv03-034");
    assert.equal(word34.source, "新拾遺和歌集");
    const word35 = wordsById.get("kv03-035");
    assert.equal(word35.source, "源氏物語（賢木）");
  },
  summary: "OK: set-03 data, cloze forms, and confirmed source entries",
});
