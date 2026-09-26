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
    ["kv08-091", "ましませ"],
    ["kv08-092", "いませ"],
    ["kv08-093", "いますがる"],
    ["kv08-094", "賜はす"],
    ["kv08-095", "たぶ"],
    ["kv08-096", "のたまひ"],
  ]),
  expect(wordsById) {
    assert.deepEqual(wordsById.get("kv08-085").meanings, ["だんだん。しだいに。"]);
    assert.equal(wordsById.get("kv08-085").source, "徒然草（第十九段）");
    assert.equal(wordsById.get("kv08-085").example, "鳥の声などもことの外に春めきて、のどやかなる日かげに、垣根の草萌え出づるころより、やや春深くかすみわたりて、花もやうやう気色だつほどこそあれ、をりしも雨風うちつどきて、心あわただしく散りすぎぬ。");
    assert.equal(wordsById.get("kv08-085").cloze, "鳥の声などもことの外に春めきて、のどやかなる日かげに、垣根の草萌え出づるころより、（　）春深くかすみわたりて、花もやうやう気色だつほどこそあれ、をりしも雨風うちつどきて、心あわただしく散りすぎぬ。");
    assert.equal(wordsById.get("kv08-086").source, "方丈記（冒頭）");
    assert.equal(wordsById.get("kv08-087").source, "伊勢物語（第四十二段）");
    assert.equal(wordsById.get("kv08-087").example, "昔、男、色好みと知る知る、女をあひ言へりけり。されど、憎くはたあらざりけり。");
    assert.equal(wordsById.get("kv08-087").cloze, "昔、男、色好みと知る知る、女をあひ言へりけり。されど、憎く（　）あらざりけり。");
    assert.equal(wordsById.get("kv08-088").example, "昔、おほきおほいまうちぎみと聞ゆるおはしけり。");
    assert.equal(wordsById.get("kv08-088").source, "伊勢物語（頼む君）");
    assert.equal(wordsById.get("kv08-088").cloze, "昔、おほきおほいまうちぎみと聞ゆる（　）けり。");
    assert.equal(wordsById.get("kv08-089").source, "枕草子（上にさぶらふ御猫は）");
    assert.equal(wordsById.get("kv08-089").example, "朝餉の間にうへはおはします。御覧じて、いみじう驚かせ給ふ。");
    assert.equal(wordsById.get("kv08-089").cloze, "朝餉の間にうへは（　）。御覧じて、いみじう驚かせ給ふ。");
    assert.equal(wordsById.get("kv08-091").source, "平家物語（巻一・わが身の栄花）");
    assert.equal(wordsById.get("kv08-091").example, "君も賢王にてましませば、神も神徳を輝かし、花も心ありければ、二十日の齢を保ちけり。");
    assert.equal(wordsById.get("kv08-091").cloze, "君も賢王にて（　）ば、神も神徳を輝かし、花も心ありければ、二十日の齢を保ちけり。");
    assert.equal(wordsById.get("kv08-092").source, "落窪物語（二の巻）");
    assert.equal(wordsById.get("kv08-094").source, "竹取物語（かぐや姫の昇天）");
    assert.equal(wordsById.get("kv08-095").source, "平家物語（巻九・生食の沙汰）");
    assert.deepEqual(wordsById.get("kv08-096").meanings, ["おっしゃる。"]);
    assert.equal(wordsById.get("kv08-096").source, "蜻蛉日記（巻中）");
    assert.equal(wordsById.get("kv08-096").example, "かへり事なにくれといと哀に多くのたまひて、");
    assert.equal(wordsById.get("kv08-096").cloze, "かへり事なにくれといと哀に多く（　）て、");
    assert.equal(wordsById.get("kv08-093").source, "貫之集（詞書）");
    assert.equal(wordsById.get("kv08-093").example, "これはここにいますがる神のし給ふならむ。");
    assert.equal(wordsById.get("kv08-093").cloze, "これはここに（　）神のし給ふならむ。");
  },
  familyOverlapPairs: [
    ...allPairs(["kv08-088", "kv08-089", "kv08-090", "kv08-091", "kv08-092", "kv08-093"]),
    ...allPairs(["kv08-094", "kv08-095"]),
  ],
  summary: "OK: set-08 data, notes, cloze forms, and meaning-family guards",
});
