"use strict";

// 学習目標（1日の単語目標）と到達予想の純ロジック契約。
// mode-vocab.js の内部関数を __test で露出させ、DOMなしで計算だけを検証する。

const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");

const js = fs.readFileSync("static/mode-vocab.js", "utf8").replace(/\r\n/g, "\n");

// 保存キー・クラウド同梱・語彙目標の定義がソースにあること（文字列契約）。
assert.match(js, /const STUDY_PLAN_KEY = `kobun_vocab_study_plan_v1\$\{storageScope\}`;/, "学習目標の保存キーが必要");
assert.match(js, /function cloudMeta\(\)/, "クラウドメタ生成を1か所へまとめる必要がある");
assert.match(js, /studyPlanV1: studyPlan/, "学習目標をクラウドパッチへ同梱する必要がある");
assert.match(js, /if \(!isValidIsoDate\(u\.firstAnsweredAt\)\) u\.firstAnsweredAt = answeredAt;/, "初回答時刻は1度だけ記録する必要がある");
assert.match(js, /migrateStudyPlanFirstAnswers\(\);\n\s*loadStudyPlan\(\);/, "起動時に履歴移行→学習目標読み込みの順で呼ぶ必要がある");

const exposed = [
  "normalizeStudyPlan",
  "isValidIsoDate",
  "startOfLocalDay",
  "studyPlanSummary",
  "vocabularyForecast",
  "vocabularyGoalForecast",
  "migrateFirstAnsweredAt",
];
const source = js.replace(
  "  return { mount };",
  `  return { mount, __test: { ${exposed.join(", ")} } };`,
);
assert.ok(source.includes("__test:"), "内部関数の露出に失敗した");

const sandbox = {
  URLSearchParams,
  location: { search: "" },
  console,
  KobunMeaningGuard: { meaningText: () => "", isSafePair: () => true },
};
vm.runInNewContext(`${source}\nglobalThis.__app = KobunVocabApp;`, sandbox);
const t = sandbox.__app.__test;

const localDate = (y, m, d, h = 12, min = 0) => new Date(y, m - 1, d, h, min);
const iso = (date) => date.toISOString();

// --- normalizeStudyPlan: 範囲・既定値・スリム形状 ---
// vm 実行の返り値は別レルムのため deepStrictEqual を避け、フィールドを個別に確認する。
const def = t.normalizeStudyPlan(null);
assert.equal(def.version, 1, "既定 version は 1");
assert.equal(def.dailyWordGoal, 12, "既定は1日12語");
assert.equal(t.normalizeStudyPlan({ dailyWordGoal: 1 }).dailyWordGoal, 1, "下限1を許可");
assert.equal(t.normalizeStudyPlan({ dailyWordGoal: 60 }).dailyWordGoal, 60, "上限60を許可");
assert.equal(t.normalizeStudyPlan({ dailyWordGoal: 0 }).dailyWordGoal, 12, "0は既定へ");
assert.equal(t.normalizeStudyPlan({ dailyWordGoal: 61 }).dailyWordGoal, 12, "61は既定へ");
assert.equal(t.normalizeStudyPlan({ dailyWordGoal: 8.5 }).dailyWordGoal, 12, "非整数は既定へ");
assert.equal(t.normalizeStudyPlan({ dailyWordGoal: "20" }).dailyWordGoal, 20, "数字文字列は受理");
assert.equal(
  JSON.stringify(Object.keys(t.normalizeStudyPlan({ dailyWordGoal: 20, junk: 1 })).sort()),
  JSON.stringify(["dailyWordGoal", "version"]),
  "保存形状はversionとdailyWordGoalのみ（未知キーは持ち込まない）",
);
assert.equal(t.normalizeStudyPlan("nope").dailyWordGoal, 12, "オブジェクト以外は既定へ");

// --- isValidIsoDate ---
assert.equal(t.isValidIsoDate("2026-09-02T01:30:00.000Z"), true);
assert.equal(t.isValidIsoDate("2026-09-02"), false, "日付のみは不可");
assert.equal(t.isValidIsoDate(""), false);
assert.equal(t.isValidIsoDate(null), false);

// --- studyPlanSummary: firstAnsweredAt をローカル日付で「今日」判定 ---
const plan = { version: 1, dailyWordGoal: 12 };
const now = localDate(2026, 9, 2, 10);
const entries = [
  { unit: { firstAnsweredAt: iso(localDate(2026, 9, 2, 0, 5)) } },   // 今日
  { unit: { firstAnsweredAt: iso(localDate(2026, 9, 2, 23, 30)) } }, // 今日（深夜。UTCへ切り出さない）
  { unit: { firstAnsweredAt: iso(localDate(2026, 9, 1, 23, 30)) } }, // 昨日
  { unit: { firstAnsweredAt: iso(localDate(2026, 9, 3, 0, 30)) } },  // 明日
  { unit: { learned: true } },                                       // 履歴も時刻も無い旧回答は今日に数えない
  { unit: {} },
];
const summary = t.studyPlanSummary(now, plan, entries);
assert.equal(summary.answeredToday, 2, "初回答がローカル当日内の語だけを数える");
assert.equal(summary.dailyWordGoal, 12);
assert.equal(summary.dailyRemaining, 10, "残数は目標−今日");
assert.equal(
  t.studyPlanSummary(localDate(2026, 9, 2, 23, 59), plan, [{ unit: { firstAnsweredAt: iso(localDate(2026, 9, 2, 23, 59)) } }]).answeredToday,
  1,
  "ISO文字列をUTC日付として切り出さず、ローカル日付で集計する",
);
assert.equal(t.studyPlanSummary(now, plan, []).answeredToday, 0, "空配列は0");
assert.equal(t.studyPlanSummary(now, { dailyWordGoal: 2 }, entries).dailyRemaining, 0, "残数は0未満にならない");

// --- vocabularyForecast: 5期間 × 1日の単語目標（1語=語彙1） ---
assert.equal(
  JSON.stringify(t.vocabularyForecast(plan)),
  JSON.stringify([
    { days: 7, vocabulary: 84 },
    { days: 30, vocabulary: 360 },
    { days: 90, vocabulary: 1080 },
    { days: 180, vocabulary: 2160 },
    { days: 365, vocabulary: 4380 },
  ]),
  "期間別の理論語数は日別目標と連動する",
);
assert.equal(t.vocabularyForecast({ dailyWordGoal: 20 })[0].vocabulary, 140, "日別目標の変更が予測へ反映される");

// --- vocabularyGoalForecast: 起点0・目標600・現在値クランプ ---
const g0 = t.vocabularyGoalForecast(now, plan, 0);
assert.equal(g0.currentVocabulary, 0, "起点は0（前級習得済みの概念は無い）");
assert.equal(g0.remainingVocabulary, 600);
assert.equal(g0.dailyVocabulary, 12);
assert.equal(g0.daysToGoal, 50, "600 ÷ 12 = 50日");
const expected = t.startOfLocalDay(now);
expected.setDate(expected.getDate() + 50);
assert.equal(g0.estimatedDate.getTime(), expected.getTime(), "到達日はローカル日付へ日数を加算する");

const g1 = t.vocabularyGoalForecast(now, plan, 130);
assert.equal(g1.currentVocabulary, 130);
assert.equal(g1.remainingVocabulary, 470);
assert.equal(g1.daysToGoal, Math.ceil(470 / 12), "残数はceilで日数化する");

const gDone = t.vocabularyGoalForecast(now, plan, 700);
assert.equal(gDone.currentVocabulary, 600, "現在値は600でクランプ");
assert.equal(gDone.remainingVocabulary, 0);
assert.equal(gDone.daysToGoal, 0, "到達済みは0日");
assert.equal(gDone.estimatedDate.getTime(), t.startOfLocalDay(now).getTime());

assert.equal(t.vocabularyGoalForecast(now, { dailyWordGoal: 5 }, 0).daysToGoal, 120, "日別目標5なら120日");

// --- migrateFirstAnsweredAt: 履歴補完・非上書き・冪等 ---
const legacy = {
  units: {
    "kv01-001": { learned: true },
    "kv01-002": { learned: true, firstAnsweredAt: iso(localDate(2026, 8, 20)) },
    "kv01-003": { learned: true },
  },
  history: [
    { kind: "meaning", wordId: "kv01-001", at: iso(localDate(2026, 8, 1)) },
    { kind: "question", wordId: "kv01-001", result: "wrong", at: iso(localDate(2026, 8, 3)) },
    { kind: "question", wordId: "kv01-001", result: "correct", at: iso(localDate(2026, 8, 4)) },
  ],
};
assert.equal(t.migrateFirstAnsweredAt(legacy), true, "履歴から初回答時刻を補完する");
assert.equal(legacy.units["kv01-001"].firstAnsweredAt, iso(localDate(2026, 8, 3)), "最古の文中回答時刻を採用する");
assert.equal(legacy.units["kv01-002"].firstAnsweredAt, iso(localDate(2026, 8, 20)), "既存の初回答時刻を上書きしない");
assert.equal(legacy.units["kv01-003"].firstAnsweredAt, undefined, "履歴に日時が無ければ推測日時を作らない");
assert.equal(legacy.migrations.studyPlanFirstAnsweredAtV1, 1, "移行済みマーカーを立てる");
assert.equal(t.migrateFirstAnsweredAt(legacy), false, "移行は冪等（2回目は何もしない）");
assert.equal(t.migrateFirstAnsweredAt({ migrations: { studyPlanFirstAnsweredAtV1: 1 } }), false, "マーカー済みは走らない");
assert.equal(t.migrateFirstAnsweredAt(null), false, "壊れた入力でも例外を出さない");

console.log("study plan logic contract: OK");
