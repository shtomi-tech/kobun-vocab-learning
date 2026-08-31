import assert from "node:assert/strict";
import { checkSet, allPairs } from "./lib/set-check.mjs";

checkSet({
  setId: "kobun-set-06",
  firstNumber: 61,
  expect(wordsById) {
    const word61 = wordsById.get("kv06-061");
    assert.equal(word61.source, "松浦宮物語（巻第五百二）");
    const word62 = wordsById.get("kv06-062");
    assert.equal(word62.source, "宇津保物語（あて宮）");
    assert.equal(word62.example, "数ならぬ身に、思ふまじきこと思ひそめたるが、過ちこそあれ…。");
    assert.equal(word62.cloze, "（　）身に、思ふまじきこと思ひそめたるが、過ちこそあれ…。");
    const word63 = wordsById.get("kv06-063");
    assert.equal(word63.example, "有明の空を思ひ出づる涙のいとどとどめがたきは、いとけしからぬ心かなと思ふ。");
    assert.equal(word63.translation, "有明の空を思い出す涙がますます止めがたいのは、なんとも困った心だと思う。");
    assert.equal(word63.source, "源氏物語（浮舟）");
    assert.equal(word63.cloze, "有明の空を思ひ出づる涙のいとどとどめがたきは、いと（　）心かなと思ふ。");
    const word69 = wordsById.get("kv06-069");
    assert.equal(word69.example, "かの女君ゆめのごとありしに、ただならずなりにけり。");
    assert.equal(word69.translation, "その女君は、夢のような一夜を過ごしたところ、妊娠した。");
    assert.equal(word69.cloze, "かの女君ゆめのごとありしに、（　）なりにけり。");
    assert.equal(word69.source, "宇津保物語（俊蔭）");
    assert.equal(wordsById.get("kv06-068").source, "源氏物語（玉鬘）");
    const word72 = wordsById.get("kv06-072");
    assert.equal(word72.example, "「好きごとせし人々の文もなし」とのみ言はせて、さらに返事もせずのみあるほどに御文あり。");
    assert.equal(word72.translation, "「浮ついたことをしてきた人々の手紙もない」とだけ言わせて、さらに返事もせずにいるうちに、お手紙が来た。");
    assert.equal(word72.cloze, "「好きごとせし人々の文もなし」とのみ言はせて、（　）返事もせずのみあるほどに御文あり。");
    assert.equal(word72.source, "和泉式部日記");
    const word64 = wordsById.get("kv06-064");
    assert.equal(word64.source, "伊勢物語（第二十一段）");
    assert.equal(word64.example, "この女かく書きおきたるを見て、けしう。心おくべきこともおぼえぬを、何によりてならむと…。");
    assert.equal(word64.cloze, "この女かく書きおきたるを見て、（　）う。心おくべきこともおぼえぬを、何によりてならむと…。");
    assert.equal(wordsById.get("kv06-065").source, "伊勢物語（血の涙）");
    const word66 = wordsById.get("kv06-066");
    const word67 = wordsById.get("kv06-067");
    assert.equal(word66.source, "太平記（巻第三十三）");
    assert.equal(word66.example, "九月十三夜は暮天雲晴れて、月も名に負ふ夜を顕しぬと見えければ…。");
    assert.equal(word66.cloze, "九月十三夜は暮天雲晴れて、月も（　）夜を顕しぬと見えければ…。");
    assert.equal(word67.source, word66.source);
    assert.equal(word67.example, word66.example);
    assert.equal(word67.cloze, "九月十三夜は暮天雲晴れて、月も（　）に負ふ夜を顕しぬと見えければ…。");
  },
  familyOverlapPairs: [
    ...allPairs(["kv06-063", "kv06-064", "kv06-068", "kv06-069"]),
    ["kv06-066", "kv06-067"],
    ["kv06-071", "kv06-072"],
  ],
  summary: "OK: set-06 data, notes, and meaning-family guards",
});
