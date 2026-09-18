import assert from "node:assert/strict";
import { loadWords, loadAdoptions } from "./lib/data.mjs";

const words = loadWords();
const wakaWords = words.filter((word) => word.exampleForm === "waka");
const wakaIds = new Set(wakaWords.map((word) => word.id));
const wakaFieldIds = new Set(words.filter((word) => word.waka !== undefined).map((word) => word.id));

assert.equal(wakaWords.length, wakaIds.size, "waka IDs must be unique");
assert.deepEqual([...wakaFieldIds].sort(), [...wakaIds].sort(), "data-side waka fields must match exampleForm=waka IDs");
for (const word of words) {
  assert.ok(["waka", "prose"].includes(word.exampleForm), `${word.id}: exampleForm must be explicit`);
  if (word.waka !== undefined) assert.equal(word.exampleForm, "waka", `${word.id}: waka requires exampleForm=waka`);
  if (word.exampleForm === "waka") {
    assert.ok(word.waka && Array.isArray(word.waka.phrases), `${word.id}: waka data is required`);
    assert.ok(word.waka.ref && typeof word.waka.ref === "object" && !Array.isArray(word.waka.ref), `${word.id}: waka ref is required`);
    assert.equal(word.waka.ref.collection, word.source, `${word.id}: waka ref collection must match source`);
    assert.ok(typeof word.waka.ref.book === "string" && word.waka.ref.book.length > 0, `${word.id}: waka ref book is required`);
    if (word.waka.ref.collection !== "万葉集") {
      assert.ok(word.waka.ref.book.includes("・"), `${word.id}: waka ref book must include the section name`);
    }
    // 歌番号は任意。底本が通し番号を印刷していない歌集（和歌三代集・万葉集古義など）でも採れるようにする。
    // 値を入れる場合だけ、正の整数であることを求める。
    if (word.waka.ref.number !== undefined) {
      assert.ok(Number.isInteger(word.waka.ref.number) && word.waka.ref.number > 0, `${word.id}: waka ref number must be a positive integer`);
    }
    assert.doesNotMatch(word.source, /[（）()]/u, `${word.id}: waka source must be collection-only`);
  }
}

// 入力表とデータのずれを検出する。データだけを直すと、次の apply-waka.mjs で巻き戻る原因になる。
const wordById = new Map(words.map((word) => [word.id, word]));
for (const adoption of loadAdoptions().adoptions) {
  const word = wordById.get(adoption.id);
  assert.ok(word, `${adoption.id}: adoption refers to unknown id`);
  for (const [field, value] of Object.entries(adoption)) {
    if (field === "id") continue;
    assert.deepEqual(word[field], value, `${adoption.id}: docs/waka-adoptions.json の ${field} がデータと異なる（入力表かデータの一方だけを直した）`);
  }
}

console.log(`OK: waka data / ${wakaWords.length}語`);
