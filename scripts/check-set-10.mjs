import assert from "node:assert/strict";
import { checkSet } from "./lib/set-check.mjs";

checkSet({
  setId: "kobun-set-10",
  firstNumber: 109,
  expectedForms: new Map([
    ["kv10-109", "聞こゆれ"],
    ["kv10-110", "きこえさす"],
    ["kv10-111", "奏し"],
    ["kv10-112", "啓し"],
    ["kv10-113", "賜り"],
    ["kv10-114", "うけたまはら"],
    ["kv10-115", "まうで"],
    ["kv10-116", "罷ら"],
    ["kv10-117", "まかで"],
    ["kv10-118", "つかうまつる"],
    ["kv10-119", "たまふる"],
    ["kv10-120", "奉り"],
  ]),
  expect(wordsById) {
    assert.deepEqual(wordsById.get("kv10-109").meanings, ["申しあげる。", "〜申しあげる。お〜する。"]);
    assert.deepEqual(wordsById.get("kv10-110").meanings, ["申しあげる。", "〜申しあげる。お〜する。"]);
    assert.deepEqual(wordsById.get("kv10-111").meanings, ["（天皇に）申しあげる。"]);
    assert.deepEqual(wordsById.get("kv10-112").meanings, ["（中宮または東宮に）申しあげる。"]);
    assert.deepEqual(wordsById.get("kv10-113").meanings, ["いただく。"]);
    assert.deepEqual(wordsById.get("kv10-114").meanings, ["いただく。お受けする。", "お聞きする。"]);
    assert.deepEqual(wordsById.get("kv10-115").meanings, ["参上する。"]);
    assert.deepEqual(wordsById.get("kv10-116").meanings, ["退出する。", "おいとまする。"]);
    assert.deepEqual(wordsById.get("kv10-117").meanings, ["退出する。", "おいとまする。"]);
    assert.deepEqual(wordsById.get("kv10-118").meanings, ["お仕えする。", "いたす。"]);
    assert.deepEqual(wordsById.get("kv10-119").meanings, ["お与えになる。くださる。", "〜なさる。お〜になる。", "〜ております。"]);
    assert.deepEqual(wordsById.get("kv10-120").meanings, ["さしあげる。", "お〜する。〜申しあげる。", "召しあがる。", "お召しになる。", "お乗りになる。"]);
    assert.equal(wordsById.get("kv10-109").source, "伊勢物語（武蔵鐙）");
    assert.equal(wordsById.get("kv10-110").source, "大和物語（下巻・p.128）");
    assert.equal(wordsById.get("kv10-111").source, "大和物語（上巻・p.74）");
    assert.equal(wordsById.get("kv10-112").source, "大和物語（下巻・p.113）");
    assert.equal(wordsById.get("kv10-115").source, "伊勢物語（p.79）");
    assert.equal(wordsById.get("kv10-117").source, "伊勢物語（p.59）");
    assert.equal(wordsById.get("kv10-118").source, "徒然草（p.336）");
    assert.equal(wordsById.get("kv10-113").source, "源氏物語（桐壺）");
    assert.equal(wordsById.get("kv10-114").source, "源氏物語（蓬生）");
    assert.equal(wordsById.get("kv10-119").source, "毎月抄");
    assert.equal(wordsById.get("kv10-120").example, "朱雀院に参りて、くはしく奏す。限なく悦び給ひて、よろづの物多く奉り給ふ。");
    assert.equal(wordsById.get("kv10-120").source, "宇津保物語（国譲・下）");
    assert.equal(wordsById.get("kv10-120").cloze, "朱雀院に参りて、くはしく奏す。限なく悦び給ひて、よろづの物多く（　）給ふ。");
  },
  unsafePairs: [
    ["kv10-113", "kv10-114"],
    ["kv10-116", "kv10-117"],
    ["kv10-119", "kv10-120"],
  ],
  summary: "OK: set-10 data, notes, cloze forms, and meaning-choice guards",
});
