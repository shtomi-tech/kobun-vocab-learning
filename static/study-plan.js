"use strict";

// 学習目標（1日の単語目標）と到達予想の純ロジック。DOM・localStorage・クラウドには触れない。
// 保存と画面表示は mode-vocab.js が受け持つ。
const KobunStudyPlan = (() => {
  // 古文単語の学習目標。全セット横断で「文中回答済み」になった語を積み上げる。
  const GOAL_TOTAL = 600;
  const VERSION = 1;
  const DEFAULT_DAILY = 12;
  const DAILY_MAX = 60;
  const FORECAST_DAYS = [7, 30, 90, 180, 365];

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

  function normalizeStudyPlan(candidate) {
    const source = candidate && typeof candidate === "object" && !Array.isArray(candidate) ? candidate : {};
    const daily = Number(source.dailyWordGoal);
    return {
      version: VERSION,
      dailyWordGoal: Number.isInteger(daily) && daily >= 1 && daily <= DAILY_MAX
        ? daily
        : DEFAULT_DAILY,
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
    isValidIsoDate,
    startOfLocalDay,
    normalizeStudyPlan,
    defaultStudyPlan,
    studyPlanSummary,
    vocabularyForecast,
    vocabularyGoalForecast,
    migrateFirstAnsweredAt,
  };
})();

if (typeof module !== "undefined") module.exports = KobunStudyPlan;
