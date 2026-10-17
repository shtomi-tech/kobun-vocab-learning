"use strict";

// 和歌で文法「文法の習熟」の記録と出題の選び方を、実データ（data/waka-grammar.json）で確かめる。
const assert = require("node:assert/strict");
const fs = require("node:fs");

const stored = new Map();
global.localStorage = {
  getItem: (key) => stored.get(key) ?? null,
  setItem: (key, value) => stored.set(key, String(value)),
};
const M = require("../static/grammar-mastery.js");

const data = JSON.parse(fs.readFileSync("data/waka-grammar.json", "utf8"));
const grammar = { rules: data.rules, byKey: new Map(data.poems.map((poem) => [poem.key, poem])) };
const { items, byRule, rules } = M.catalog(grammar);
const itemById = new Map(items.map((entry) => [entry.id, entry]));
const day = (n) => new Date(2026, 9, 1 + n, 12);

// 出題のある文法事項だけが対象。どれも rules に名前がある。
assert.ok(rules.length > 0);
for (const rule of rules) assert.ok(data.rules[rule], `rules に無い文法事項: ${rule}`);
const withQuiz = new Set(data.poems.flatMap((poem) => poem.quiz.flatMap((item) => item.rules)));
assert.equal(rules.length, withQuiz.size, "問題のある文法事項をすべて対象にする");

// 1回目：10問、1項目1問、同じ問題を重ねない、同じ歌の問題は隣り合う。
stored.clear();
const first = M.buildSession(grammar, { date: day(0) });
assert.equal(first.length, M.SESSION_SIZE);
assert.equal(new Set(first.map((entry) => entry.rule)).size, first.length, "1項目につき1問");
assert.equal(new Set(first.map((entry) => entry.id)).size, first.length, "同じ問題を重ねない");
for (const entry of first) {
  assert.ok(itemById.has(entry.id));
  assert.ok(entry.item.rules.includes(entry.rule), "選んだ問題がその項目を問う");
}
const poemRuns = first.map((entry) => entry.poemKey).filter((key, i, list) => key !== list[i - 1]);
assert.equal(new Set(poemRuns).size, poemRuns.length, "同じ歌の問題は続けて並べる");
assert.equal(M.summary(grammar).total, rules.length);
assert.equal(M.summary().total, rules.length, "保存だけからも全項目数がわかる");

// 正解で1段上がり、同じ日のうちの正解では上がらない。
stored.clear();
const ruleA = rules[0];
let change = M.record([ruleA], true, { date: day(0) });
assert.deepEqual(change, [{ rule: ruleA, before: 0, after: 1 }]);
change = M.record([ruleA], true, { date: day(0) });
assert.deepEqual(change, [{ rule: ruleA, before: 1, after: 1 }], "期限前の正解では上がらない");
M.record([ruleA], true, { date: day(1) });
assert.equal(M.load().rules[ruleA].level, 2);
M.record([ruleA], true, { date: day(2) });
assert.equal(M.load().rules[ruleA].level, 2, "3日後の期限までは上がらない");
M.record([ruleA], true, { date: day(4) });
assert.equal(M.load().rules[ruleA].level, M.MASTER_LEVEL, "日をおいて3回の正解で習熟");
assert.equal(M.status(M.load().rules[ruleA], M.dayNumber(day(5))), "mastered");
assert.equal(M.status(M.load().rules[ruleA], M.dayNumber(day(11))), "review", "期限が来たら復習の時期");

// 間違えると、習熟済みは1段へ戻り、その日の練習の先頭に来る。誤答は先頭の文法事項だけに反映する。
const ruleB = rules[1];
M.record([ruleB], true, { date: day(4) });
change = M.record([ruleA, ruleB], false, { date: day(5) });
assert.deepEqual(change.map((c) => c.after), [1, 1], "誤答は主眼の項目だけ下げる");
assert.equal(M.load().rules[ruleA].due, M.dayNumber(day(5)));
const again = M.buildSession(grammar, { date: day(5) });
assert.equal(again[0].rule === ruleA || again.some((entry, i) => entry.rule === ruleA && i < 3), true, "間違えた項目を先に出す");
assert.ok(again.some((entry) => !M.load().rules[entry.rule]), "期限の項目が少なければ新しい項目を混ぜる");

// 毎日10問ずつ全問正解する学習者は、すべての項目に習熟できる。習熟は最短でも4日目。
stored.clear();
let allMasteredOn = null;
const masteredDay = new Map();
for (let n = 0; n < 120 && allMasteredOn == null; n++) {
  const session = M.buildSession(grammar, { date: day(n) });
  assert.ok(session.length > 0);
  for (const entry of session) {
    M.record(entry.item.rules, true, { poemKey: entry.poemKey, q: entry.q, date: day(n) });
  }
  const state = M.load();
  for (const rule of rules) {
    if (!masteredDay.has(rule) && (state.rules[rule]?.level || 0) >= M.MASTER_LEVEL) masteredDay.set(rule, n);
  }
  if (M.summary(grammar, { date: day(n) }).mastered === rules.length) allMasteredOn = n;
}
assert.ok(allMasteredOn != null, "全項目に習熟できる");
for (const [rule, n] of masteredDay) {
  const firstSeen = M.load().rules[rule];
  assert.ok(firstSeen.correct >= 1);
  assert.ok(n >= 4, `${rule} が4日目より前に習熟した（${n}日目）`);
}

// 1問しかない項目でも、問題は最後に解いてから日が経っているものを選ぶ。
stored.clear();
const multi = rules.find((rule) => byRule.get(rule).primary.length >= 2);
const s1 = M.buildSession(grammar, { date: day(0), size: rules.length }).find((entry) => entry.rule === multi);
M.record(s1.item.rules, true, { poemKey: s1.poemKey, q: s1.q, date: day(0) });
const s2 = M.buildSession(grammar, { date: day(1), size: rules.length }).find((entry) => entry.rule === multi);
assert.notEqual(s2.id, s1.id, "同じ項目でも前回と別の問題を出す");

console.log(`grammar mastery: ${rules.length} rules, all mastered by day ${allMasteredOn} at 10 questions/day OK`);
