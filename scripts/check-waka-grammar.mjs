// 歌の間の文法解説（data/waka-grammar.json）の形を検査する。
// 解説の中身の正しさは人が確かめる。ここでは本文との一致・問題の形・参照カードの登録だけを見る。
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadWords } from "./lib/data.mjs";

const grammar = JSON.parse(fs.readFileSync(new URL("../data/waka-grammar.json", import.meta.url), "utf8"));
const POS = new Set(["名詞", "動詞", "形容詞", "形容動詞", "副詞", "連体詞", "接続詞", "感動詞", "助動詞", "助詞", "連語", "接頭語", "接尾語"]);
const REVIEW = new Set(["needs-check"]);

const wakaByExample = new Map();
for (const word of loadWords()) {
  for (const candidate of [word, ...(word.examples ?? [])]) {
    if (candidate.exampleForm === "waka") wakaByExample.set(candidate.example, candidate.waka.phrases);
  }
}

assert.ok(grammar.rules && typeof grammar.rules === "object", "rules map is required");
const keys = new Set();
let quizCount = 0;
for (const poem of grammar.poems) {
  const label = poem.key.slice(0, 10);
  assert.ok(!keys.has(poem.key), `${label}: duplicate poem key`);
  keys.add(poem.key);
  const phrases = wakaByExample.get(poem.key);
  assert.ok(phrases, `${label}: key must match a waka example in data/set-*.json`);
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

console.log(`OK: ${grammar.poems.length} poems, ${quizCount} quiz items, ${cardNote}`);
