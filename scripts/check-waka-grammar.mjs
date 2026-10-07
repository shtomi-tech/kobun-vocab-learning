// 歌の間の文法解説（data/waka-grammar.json）の形を検査する。
// 解説の中身の正しさは人が確かめる。ここでは本文との一致・問題の形・参照カードの登録だけを見る。
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadWords } from "./lib/data.mjs";

const grammar = JSON.parse(fs.readFileSync(new URL("../data/waka-grammar.json", import.meta.url), "utf8"));
const POS = new Set(["名詞", "動詞", "形容詞", "形容動詞", "副詞", "連体詞", "接続詞", "感動詞", "助動詞", "助詞", "連語", "接頭語", "接尾語"]);
const REVIEW = new Set(["needs-check"]);
const MORA_TARGETS = [5, 7, 5, 7, 7];
const SMALL_KANA = /[ゃゅょぁぃぅぇぉ]/u;
// 単語の例文ではない、文法演習のためだけに収める歌の歌集。底本は docs/SOURCE_EDITIONS.md に記録する。
const STANDALONE_COLLECTIONS = new Map([["百人一首", { min: 1, max: 100 }]]);

// 単独の歌（waka を自前で持つ歌）の本文・よみ・出典を、data/set-*.json の和歌と同じ基準で確かめる。
function checkStandalone(label, poem) {
  const { waka } = poem;
  assert.ok(Array.isArray(waka.phrases) && waka.phrases.length === 5 && waka.phrases.every((p) => typeof p === "string" && p.length > 0), `${label}: waka.phrases must be five strings`);
  assert.equal(waka.phrases.join(""), poem.key, `${label}: waka.phrases must reconstruct key`);
  assert.doesNotMatch(poem.key, /[、。]/u, `${label}: waka text must not contain punctuation`);
  assert.ok(Array.isArray(waka.reading) && waka.reading.length === 5 && waka.reading.every((r) => /^[ぁ-んー]+$/u.test(r)), `${label}: waka.reading must be five hiragana readings`);
  assert.ok(!waka.reading.some((r) => SMALL_KANA.test(r)), `${label}: waka.reading must use historical kana without small kana`);
  const moras = waka.reading.map((r) => r.length);
  assert.ok(moras.every((n, i) => Math.abs(n - MORA_TARGETS[i]) <= 1), `${label}: invalid mora counts ${moras.join("/")}`);
  assert.ok(typeof poem.author === "string" && poem.author.trim(), `${label}: author is required`);
  assert.ok(typeof waka.translation === "string" && waka.translation.trim(), `${label}: waka.translation is required`);
  const range = STANDALONE_COLLECTIONS.get(waka.ref?.collection);
  assert.ok(range, `${label}: waka.ref.collection must be one of ${[...STANDALONE_COLLECTIONS.keys()].join(", ")}`);
  assert.ok(Number.isInteger(waka.ref.number) && waka.ref.number >= range.min && waka.ref.number <= range.max, `${label}: waka.ref.number out of range`);
  assert.ok(typeof waka.ref.origin === "string" && waka.ref.origin.includes("・"), `${label}: waka.ref.origin must name the source anthology and section`);
  return waka.phrases;
}

const wakaByExample = new Map();
for (const word of loadWords()) {
  for (const candidate of [word, ...(word.examples ?? [])]) {
    if (candidate.exampleForm === "waka") wakaByExample.set(candidate.example, candidate.waka.phrases);
  }
}

assert.ok(grammar.rules && typeof grammar.rules === "object", "rules map is required");
// 根拠カードの解説（data/grammar-guide.json）。カードごとに要点・見分け方を必ず置く。
const guides = JSON.parse(fs.readFileSync(new URL("../data/grammar-guide.json", import.meta.url), "utf8")).guides;
for (const rule of Object.keys(grammar.rules)) {
  const guide = guides[rule];
  assert.ok(guide, `grammar-guide: ${rule} needs a guide`);
  assert.ok(typeof guide.summary === "string" && guide.summary, `grammar-guide: ${rule} needs a summary`);
  assert.ok(Array.isArray(guide.table) && guide.table.length > 0 && guide.table.every((row) => row.length === 2 && row.every(Boolean)), `grammar-guide: ${rule} table rows must be [label, text]`);
  assert.ok(Array.isArray(guide.steps) && guide.steps.length > 0 && guide.steps.every(Boolean), `grammar-guide: ${rule} needs steps`);
  assert.ok((guide.examples ?? []).every((example) => example.text && example.note), `grammar-guide: ${rule} examples need text and note`);
}
for (const rule of Object.keys(guides)) assert.ok(grammar.rules[rule], `grammar-guide: ${rule} is not a rule in waka-grammar.json`);

const keys = new Set();
const standaloneNumbers = new Set();
let quizCount = 0;
let standaloneCount = 0;
for (const poem of grammar.poems) {
  const label = poem.key.slice(0, 10);
  assert.ok(!keys.has(poem.key), `${label}: duplicate poem key`);
  keys.add(poem.key);
  let phrases;
  if (poem.waka !== undefined) {
    // 例文に使っている歌は例文側のデータが正本なので、単独の歌として二重に持たない。
    assert.ok(!wakaByExample.has(poem.key), `${label}: already a waka example in data/set-*.json; drop the waka field`);
    phrases = checkStandalone(label, poem);
    const id = `${poem.waka.ref.collection}:${poem.waka.ref.number}`;
    assert.ok(!standaloneNumbers.has(id), `${label}: duplicate ${id}`);
    standaloneNumbers.add(id);
    standaloneCount++;
  } else {
    phrases = wakaByExample.get(poem.key);
    assert.ok(phrases, `${label}: key must match a waka example in data/set-*.json, or carry its own waka`);
  }
  assert.equal(poem.tokens.length, 5, `${label}: tokens must have 5 phrases`);
  poem.tokens.forEach((tokens, index) => {
    assert.equal(tokens.map((token) => token.t).join(""), phrases[index], `${label}: tokens of phrase ${index + 1} must join to the phrase`);
    for (const token of tokens) {
      assert.ok(POS.has(token.p), `${label}: unknown part of speech ${token.p}`);
      assert.equal(typeof token.d, "string", `${label}: token detail must be a string`);
      if (token.review !== undefined) assert.ok(REVIEW.has(token.review), `${label}: unknown review mark`);
    }
  });
  for (const note of poem.notes ?? []) {
    assert.ok(note.kind && note.text, `${label}: note needs kind and text`);
    if (note.review !== undefined) assert.ok(REVIEW.has(note.review), `${label}: unknown review mark`);
  }
  assert.ok(Array.isArray(poem.quiz) && poem.quiz.length > 0, `${label}: at least one quiz item`);
  for (const item of poem.quiz) {
    quizCount++;
    assert.ok(Number.isInteger(item.target?.ku) && item.target.ku >= 0 && item.target.ku < 5, `${label}: target.ku must be 0-4`);
    assert.ok(phrases[item.target.ku].includes(item.target.text), `${label}: target text 「${item.target.text}」 must appear in phrase ${item.target.ku + 1}`);
    assert.ok(item.choices.length >= 2 && item.choices.length <= 4, `${label}: 2-4 choices`);
    assert.equal(new Set(item.choices).size, item.choices.length, `${label}: choices must be unique`);
    assert.ok(Number.isInteger(item.answer) && item.answer >= 0 && item.answer < item.choices.length, `${label}: answer index out of range`);
    assert.ok(item.question && item.explain, `${label}: question and explain are required`);
    assert.ok(item.rules.length > 0, `${label}: quiz must cite at least one rule card`);
    for (const rule of item.rules) assert.ok(grammar.rules[rule], `${label}: rule ${rule} must be listed in rules`);
  }
}

// 手元に原則集があれば、参照カードが active であることも確かめる（CIには原則集が無いので省く）。
const indexUrl = new URL("../../docs/kobun-principles/INDEX.md", import.meta.url);
let cardNote = "principle index not found (skipped)";
if (fs.existsSync(indexUrl)) {
  const index = fs.readFileSync(indexUrl, "utf8");
  for (const rule of Object.keys(grammar.rules)) {
    const row = index.split("\n").find((line) => line.includes(`\`${rule}\``));
    assert.ok(row, `${rule}: not found in kobun-principles INDEX.md`);
    assert.match(row, /\|\s*active\s*\|/u, `${rule}: quiz rules must be active cards`);
  }
  cardNote = `${Object.keys(grammar.rules).length} rule cards active`;
}

console.log(`OK: ${grammar.poems.length} poems (${standaloneCount} standalone), ${quizCount} quiz items, ${cardNote}, ${Object.keys(guides).length} guides`);
