const assert = require("node:assert/strict");
const fs = require("node:fs");
const parts = require("../static/example-parts.js");
global.KobunExampleParts = parts;
const gallery = require("../static/waka-gallery.js");
const data = JSON.parse(fs.readFileSync("data/waka-gallery.json", "utf8"));
const keys = new Set();
const ids = new Set();
for (const poem of data.poems) {
  assert.equal(poem.phrases.length, 5);
  assert.equal(poem.reading.length, 5);
  for (const [i, reading] of poem.reading.entries()) {
    assert.match(reading, /^[ぁ-ゖー]+$/u);
    assert.ok(Math.abs([...reading].length - [5, 7, 5, 7, 7][i]) <= 1);
    assert.ok(poem.phrases[i].length);
  }
  for (const field of ["id", "author", "collection", "refText", "translation", "note", "sourceUrl"]) assert.ok(poem[field]);
  assert.ok(["古今和歌集", "万葉集", "拾遺和歌集"].includes(poem.collection));
  assert.ok(decodeURI(new URL(poem.sourceUrl).pathname).includes(poem.collection), "参照先の歌集と一致する");
  assert.equal(new URL(poem.sourceUrl).hostname, "ja.wikisource.org");
  assert.ok(!keys.has(poem.phrases.join("")));
  assert.ok(!ids.has(poem.id));
  keys.add(poem.phrases.join("")); ids.add(poem.id);
}
assert.ok(keys.has("月夜には来ぬ人待たるかき曇り雨も降らなむわびつつもねむ"));
const sources = fs.readdirSync("data").filter(f => /^set-\d+\.json$/.test(f)).map(f => ({ setId: f, label: f, set: JSON.parse(fs.readFileSync(`data/${f}`, "utf8")) }));
const before = gallery.collect(sources);
const after = gallery.collect(sources, data.poems);
assert.equal(after.length, before.length + data.poems.length);
assert.deepEqual(after.slice(0, before.length), before, "既存の和歌と単語への対応を保持する");
assert.deepEqual(gallery.collect(sources, [...data.poems, data.poems[0]]), after, "追加の重複を除く");
const original = before[0];
assert.deepEqual(gallery.collect(sources, [original]), before, "重複は既存データを優先する");
console.log(`OK: ${data.poems.length} additional waka; ${before.length} existing poems preserved`);
