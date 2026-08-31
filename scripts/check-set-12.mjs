import assert from "node:assert/strict";
import { checkSet } from "./lib/set-check.mjs";

checkSet({
  setId: "kobun-set-12",
  firstNumber: 133,
  expectedForms: new Map([
    ["kv12-133", "いちのひと"],
    ["kv12-134", "ぬし"],
    ["kv12-135", "はらから"],
    ["kv12-136", "兄"],
    ["kv12-137", "おとうと"],
    ["kv12-138", "妹"],
    ["kv12-139", "まらうど"],
    ["kv12-140", "ただ人"],
    ["kv12-141", "我"],
    ["kv12-142", "おのれ"],
    ["kv12-143", "これ"],
    ["kv12-144", "かれ"],
  ]),
  expect(wordsById) {
    assert.equal(wordsById.get("kv12-133").source, "宇津保物語（国譲・p.548）");
    assert.equal(wordsById.get("kv12-136").example, "櫻の直衣に、出社して、客人にもあれ、御兄の公達にもあれ、そこ近くゐて物などうちいひたる、いとをかし。");
    assert.equal(wordsById.get("kv12-136").source, "枕草子（第二段）");
    assert.equal(wordsById.get("kv12-136").cloze, "櫻の直衣に、出社して、客人にもあれ、御（　）の公達にもあれ、そこ近くゐて物などうちいひたる、いとをかし。");
    assert.equal(wordsById.get("kv12-139").example, "急ぐことある折に、長言するまらうど。");
    assert.equal(wordsById.get("kv12-139").source, "枕草子（にくきもの・p.27）");
    assert.equal(wordsById.get("kv12-139").cloze, "急ぐことある折に、長言する（　）。");
    assert.equal(wordsById.get("kv12-144").source, "源氏物語（桐壺）");
  },
  unsafePairs: [
    ["kv12-141", "kv12-142"],
    ["kv12-141", "kv12-143"],
    ["kv12-142", "kv12-143"],
  ],
  summary: "OK: set-12 data, notes, cloze forms, and meaning-choice guards",
});
