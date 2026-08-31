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

    const word78 = wordsById.get("kv07-078");
    assert.equal(word78.example, "あなかしこあだにな。");
    assert.equal(word78.translation, "けっしていいかげんにするな。");
    assert.equal(word78.source, "源氏物語");

    const word79 = wordsById.get("kv07-079");
    assert.equal(word79.example, "ゆめゆめ人に語るべからず。");
    assert.equal(word79.translation, "けっして人に語るな。");
    assert.equal(word79.source, "宇治拾遺物語（巻第七・canvas65）");

    assert.deepEqual(wordsById.get("kv07-083").meanings, ["やはり。依然として。", "それでもやはり。なんと言ってもやはり。"]);
  },
  familyOverlapPairs: [
    ...allPairs(["kv06-072", "kv07-073", "kv07-074", "kv07-075", "kv07-076"]),
    ...allPairs(["kv07-078", "kv07-079", "kv07-080"]),
  ],
  summary: "OK: set-07 data, notes, and meaning-family guards",
});
