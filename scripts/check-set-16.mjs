import assert from "node:assert/strict";
import { checkSet } from "./lib/set-check.mjs";

checkSet({
  setId: "kobun-set-16",
  firstNumber: 181,
  expectedForms: new Map([
    ["kv16-181", "さ"],
    ["kv16-182", "さて"],
    ["kv16-183", "然てもありぬべし"],
    ["kv16-184", "さてしもあら"],
    ["kv16-185", "さる"],
    ["kv16-186", "さるは"],
    ["kv16-187", "さるものにて"],
    ["kv16-188", "さらぬ"],
    ["kv16-189", "さるべき"],
    ["kv16-190", "さればよ"],
    ["kv16-191", "さればこそ"],
    ["kv16-192", "しか"],
  ]),
  expect(wordsById) {
    assert.equal(wordsById.get("kv16-181").source, "源氏物語（行幸）");
    assert.equal(wordsById.get("kv16-182").source, "源氏物語（総角）");
    assert.equal(wordsById.get("kv16-183").source, "源氏物語（松風）");
    assert.equal(wordsById.get("kv16-184").source, "十六夜日記（冒頭）");
    assert.equal(wordsById.get("kv16-185").source, "竹取物語");
    assert.equal(wordsById.get("kv16-186").source, "源氏物語（総角）");
    assert.equal(wordsById.get("kv16-187").source, "徒然草（第十九段）");
    assert.equal(wordsById.get("kv16-188").source, "源氏物語（若紫）");
    assert.equal(wordsById.get("kv16-189").source, "源氏物語（桐壺）");
    assert.equal(wordsById.get("kv16-190").source, "源氏物語（末摘花）");
    assert.equal(wordsById.get("kv16-191").source, "竹取物語");
    assert.equal(wordsById.get("kv16-192").source, "源氏物語（手習）");
    assert.equal(wordsById.get("kv16-192").example, "「東の御方は物詣し給ひにきとか、このおはせし人は猶物し給ふや」など問ひ給ふ。「しか、ここに泊りてなむ、心地悪しとこそ物し給ひて、忌む事うけ奉らむとのたまひつる」と語る。");
    assert.equal(wordsById.get("kv16-192").cloze, "「東の御方は物詣し給ひにきとか、このおはせし人は猶物し給ふや」など問ひ給ふ。「（　）、ここに泊りてなむ、心地悪しとこそ物し給ひて、忌む事うけ奉らむとのたまひつる」と語る。");
  },
  summary: "OK: set-16 data, notes, cloze forms, and source labels",
});
