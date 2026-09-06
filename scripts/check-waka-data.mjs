import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("../", import.meta.url);
const read = (relativePath) => fs.readFileSync(new URL(relativePath, root), "utf8");

const manifest = JSON.parse(read("data/manifest.json"));
const words = Object.values(manifest.sets).flatMap(({ dataUrl }) => JSON.parse(read(dataUrl)).words);
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

console.log(`OK: waka data / ${wakaWords.length}語`);
