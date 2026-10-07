"use strict";

// 学習目標（1日の単語目標・1日のノルマ）と到達予想の純ロジック。DOM・localStorage・クラウドには触れない。
// 保存と画面表示は mode-vocab.js が受け持つ。
const KobunStudyPlan = (() => {
  // 古文単語の学習目標。全セット横断で「文中回答済み」になった語を積み上げる。
  const GOAL_TOTAL = 600;
  const VERSION = 1;
  const DEFAULT_DAILY = 12;
  const DAILY_MAX = 60;
  const FORECAST_DAYS = [7, 30, 90, 180, 365];
  // 1日のノルマ（今日・復習・書く・和歌）。「今日」は上の dailyWordGoal をそのまま使う。
  // 既定値は各タブの1回分の出題数（書く10語・今日の10首）。0 はその項目をノルマに含めない。
  // 復習は設定せず、その時点で期限が来ている語数から自動で決める（上限 REVIEW_AUTO_MAX）。
  const REVIEW_AUTO_MAX = 100;
  const QUOTA_LIMITS = {
    write: { def: 10, max: 60 },
    waka: { def: 10, max: 10 },
  };

  function isValidIsoDate(value) {
    return typeof value === "string"
      && /^\d{4}-\d{2}-\d{2}T/.test(value)
      && Number.isFinite(new Date(value).getTime());
  }

  function startOfLocalDay(date = new Date()) {
    const value = new Date(date);
    value.setHours(0, 0, 0, 0);
    return value;
  }

  const isRecord = (value) => value && typeof value === "object" && !Array.isArray(value);

  function normalizeDailyQuota(candidate) {
    const source = isRecord(candidate) ? candidate : {};
    return Object.fromEntries(Object.entries(QUOTA_LIMITS).map(([id, { def, max }]) => {
      // 空文字・null は Number() で 0 になるため、未設定として既定値へ戻す。
      const raw = source[id];
      const value = raw === "" || raw == null ? NaN : Number(raw);
      return [id, Number.isInteger(value) && value >= 0 && value <= max ? value : def];
    }));
  }

  function normalizeStudyPlan(candidate) {
    const source = isRecord(candidate) ? candidate : {};
    const daily = Number(source.dailyWordGoal);
    return {
      version: VERSION,
      dailyWordGoal: Number.isInteger(daily) && daily >= 1 && daily <= DAILY_MAX
        ? daily
        : DEFAULT_DAILY,
      dailyQuota: normalizeDailyQuota(source.dailyQuota),
    };
  }

  function defaultStudyPlan() {
    return normalizeStudyPlan(null);
  }

  // 「今日」の実績は firstAnsweredAt（再回答で上書きされない初回答時刻）をローカル日付へ戻して数える。
  function studyPlanSummary(now = new Date(), plan = {}, entries = []) {
    const safe = normalizeStudyPlan(plan);
    const todayStart = startOfLocalDay(now);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const answeredToday = entries.filter((entry) => {
      const value = entry && entry.unit && entry.unit.firstAnsweredAt;
      if (!isValidIsoDate(value)) return false;
      const at = new Date(value).getTime();
      return at >= todayStart.getTime() && at < tomorrowStart.getTime();
    }).length;
    return {
      dailyWordGoal: safe.dailyWordGoal,
      answeredToday,
      dailyRemaining: Math.max(0, safe.dailyWordGoal - answeredToday),
    };
  }

  // 履歴（{ at, kind, ... }）のうち、ローカル日付で今日の分を数える。日付が変われば自然に0へ戻る。
  function countToday(events, now = new Date(), predicate = () => true) {
    const todayStart = startOfLocalDay(now);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    return (Array.isArray(events) ? events : []).filter((event) => {
      if (!event || !isValidIsoDate(event.at) || !predicate(event)) return false;
      const at = new Date(event.at).getTime();
      return at >= todayStart.getTime() && at < tomorrowStart.getTime();
    }).length;
  }

  // 1日のノルマの達成状況。
  // today: 文中問題まで初めて解いた語 / review: 意味だけ復習で答えた語 /
  // write: 書く演習で出題された語（もう一度の再出題は数えない） / waka: 今日の10首で答え終えた首。
  // 復習の目標は「今日もう答えた数 + いま期限が来ている数」（上限100）。答えるほど期限の数が減るので、
  // 目標は動かずに残りだけが減る。期限の語が無ければ目標0（達成扱い）。
  function dailyQuotaSummary(now = new Date(), plan = {}, { unitEntries = [], history = [], wakaPoemsDone = 0, reviewDue = 0 } = {}) {
    const safe = normalizeStudyPlan(plan);
    const done = {
      today: studyPlanSummary(now, safe, unitEntries).answeredToday,
      review: countToday(history, now, (event) => event.kind === "meaning"),
      write: countToday(history, now, (event) => event.kind === "written" && !String(event.result || "").startsWith("reask-")),
      waka: Math.max(0, Number(wakaPoemsDone) || 0),
    };
    const due = Math.max(0, Math.floor(Number(reviewDue) || 0));
    const goals = {
      today: safe.dailyWordGoal,
      review: Math.min(REVIEW_AUTO_MAX, done.review + due),
      ...safe.dailyQuota,
    };
    const items = ["today", "review", "write", "waka"].map((id) => ({
      id,
      goal: goals[id],
      done: done[id],
      remaining: Math.max(0, goals[id] - done[id]),
      // 復習は自動なので常にノルマに含める（目標0なら達成）。
      active: id === "review" || goals[id] > 0,
    }));
    const active = items.filter((item) => item.active);
    const achievedCount = active.filter((item) => item.remaining === 0).length;
    return { items, activeCount: active.length, achievedCount, allDone: achievedCount === active.length };
  }

  function vocabularyForecast(plan = {}) {
    const daily = normalizeStudyPlan(plan).dailyWordGoal;
    return FORECAST_DAYS.map((days) => ({ days, vocabulary: daily * days }));
  }

  function vocabularyGoalForecast(now = new Date(), plan = {}, learnedVocabulary = 0) {
    const dailyVocabulary = normalizeStudyPlan(plan).dailyWordGoal;
    const currentVocabulary = Math.min(GOAL_TOTAL, Math.max(0, Number(learnedVocabulary) || 0));
    const remainingVocabulary = Math.max(0, GOAL_TOTAL - currentVocabulary);
    const daysToGoal = remainingVocabulary > 0 ? Math.ceil(remainingVocabulary / dailyVocabulary) : 0;
    const estimatedDate = startOfLocalDay(now);
    estimatedDate.setDate(estimatedDate.getDate() + daysToGoal);
    return { currentVocabulary, remainingVocabulary, dailyVocabulary, daysToGoal, estimatedDate };
  }

  // 旧データ救済: units[wordId].firstAnsweredAt が無い語へ、history の最古の文中回答時刻を1度だけ補完する。
  function migrateFirstAnsweredAt(progress) {
    if (!progress || typeof progress !== "object" || Array.isArray(progress)) return false;
    if (progress.migrations && progress.migrations.studyPlanFirstAnsweredAtV1 === 1) return false;
    const firstByWord = new Map();
    (Array.isArray(progress.history) ? progress.history : []).forEach((event) => {
      if (!event || event.kind !== "question" || typeof event.wordId !== "string" || !isValidIsoDate(event.at)) return;
      const current = firstByWord.get(event.wordId);
      if (!current || new Date(event.at).getTime() < new Date(current).getTime()) firstByWord.set(event.wordId, event.at);
    });
    if (!progress.units || typeof progress.units !== "object" || Array.isArray(progress.units)) progress.units = {};
    Object.entries(progress.units).forEach(([wordId, unitState]) => {
      if (!unitState || typeof unitState !== "object" || isValidIsoDate(unitState.firstAnsweredAt)) return;
      const firstAnsweredAt = firstByWord.get(wordId);
      if (firstAnsweredAt) unitState.firstAnsweredAt = firstAnsweredAt;
    });
    progress.migrations = { ...(progress.migrations || {}), studyPlanFirstAnsweredAtV1: 1 };
    return true;
  }

  return {
    GOAL_TOTAL,
    DAILY_MAX,
    QUOTA_LIMITS,
    REVIEW_AUTO_MAX,
    isValidIsoDate,
    startOfLocalDay,
    normalizeStudyPlan,
    defaultStudyPlan,
    studyPlanSummary,
    normalizeDailyQuota,
    countToday,
    dailyQuotaSummary,
    vocabularyForecast,
    vocabularyGoalForecast,
    migrateFirstAnsweredAt,
  };
})();

if (typeof module !== "undefined") module.exports = KobunStudyPlan;
