import assert from "node:assert/strict";
import { checkSet, allPairs } from "./lib/set-check.mjs";

checkSet({
  setId: "kobun-set-07",
  firstNumber: 73,
  expect(wordsById) {
    const word73 = wordsById.get("kv07-073");
    assert.equal(word73.example, "世の中にたえて桜のなかりせば春の心はのどけからまし");
    assert.equal(word73.translation, "この世の中にまったく桜がなかったならば、春を過ごす人の心はどれほどのどかであったことだろう。");
    assert.equal(word73.source, "古今和歌集");
    assert.equal(word73.cloze, "世の中に（　）桜のなかりせば春の心はのどけからまし");

    const word75 = wordsById.get("kv07-075");
    assert.equal(word75.source, "源氏物語（桐壺）");
    assert.equal(word75.example, "つゆまどろまれず、明しかねさせ給ふ。");
    assert.equal(word75.cloze, "（　）まどろまれず、明しかねさせ給ふ。");

    const word78 = wordsById.get("kv07-078");
    assert.equal(word78.example, "あなかしこあだにな。");
    assert.equal(word78.translation, "けっしていいかげんにするな。");
    assert.equal(word78.source, "源氏物語（葵）");

    const word79 = wordsById.get("kv07-079");
    assert.equal(word79.example, "ゆめゆめ人に語るべからず。");
    assert.equal(word79.translation, "けっして人に語るな。");
    assert.equal(word79.source, "宇治拾遺物語（巻第七・canvas65）");

    const word77 = wordsById.get("kv07-077");
    assert.equal(word77.source, "古今著聞集（巻第十・馬藝）");
    assert.equal(word77.example, "敦頼は、よも落ちじ。");
    assert.equal(word77.cloze, "敦頼は、（　）落ちじ。");

    const word80 = wordsById.get("kv07-080");
    assert.equal(word80.source, "枕草子（巻二）");
    assert.equal(word80.example, "「一事な落としそ」と侍れば、如何がはせん。");
    assert.equal(word80.cloze, "「（　）」と侍れば、如何がはせん。");

    const word84 = wordsById.get("kv07-084");
    assert.equal(word84.source, "今鏡（第六・ふぢなみの下）");
    assert.equal(word84.example, "ほととぎすは鳴かで、やうやう明けゆくほどに、水鶏のたたきければ…。");
    assert.equal(word84.translation, "ほととぎすは鳴かないで、だんだん夜が明けていく頃に、水鶏が鳴いたので…。");
    assert.equal(word84.cloze, "ほととぎすは鳴かで、（　）明けゆくほどに、水鶏のたたきければ…。");

    assert.deepEqual(wordsById.get("kv07-083").meanings, ["やはり。依然として。", "それでもやはり。なんと言ってもやはり。"]);
  },
  familyOverlapPairs: [
    ...allPairs(["kv06-072", "kv07-073", "kv07-074", "kv07-075", "kv07-076"]),
    ...allPairs(["kv07-078", "kv07-079", "kv07-080"]),
  ],
  summary: "OK: set-07 data, notes, and meaning-family guards",
});
