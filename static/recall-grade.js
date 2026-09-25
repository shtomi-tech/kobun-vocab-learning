"use strict";

// 思い出して書く復習の評価。確信度（答えを見る前）・自己採点・ヒントの有無から、
// 評価（good / hard / again）と、誤答確認へ回すか・自信ありの取り違えかを決める純粋ロジック。
// 評価は間隔復習（FSRS）へは渡さず、この問題専用の記録と毎日のノルマにだけ使う。
const KobunRecallGrade = (() => {
  const confidences = ["sure", "maybe", "blank"];
  const selfGrades = ["correct", "partial", "wrong"];

  /**
   * @param confidence  "sure"（言える）| "maybe"（たぶん）| "blank"（思い出せない）
   * @param selfGrade   "correct" | "partial" | "wrong" | null（思い出せないときは null）
   * @param hintUsed    例文ヒントを見たか
   * 想定外の値は例外にせず Again として扱う（学習を止めない）。
   */
  function gradeRecall({ confidence, selfGrade, hintUsed } = {}) {
    const again = { rating: "again", toWrongReview: true, confidentMiss: false };
    if (!confidences.includes(confidence)) return again;
    if (confidence === "blank") return again;
    if (!selfGrades.includes(selfGrade)) return again;
    if (selfGrade === "wrong") return { ...again, confidentMiss: confidence === "sure" };
    if (selfGrade === "partial") return { rating: "hard", toWrongReview: false, confidentMiss: false };
    // 合っていた: 自信ありでヒントなしのときだけ Good。
    const rating = confidence === "sure" && hintUsed !== true ? "good" : "hard";
    return { rating, toWrongReview: false, confidentMiss: false };
  }

  // Jev の自動採点を採用する確信度の下限。日本語の答えで測って決める（README の自動採点の節）。
  const AI_AUTO_THRESHOLD = 0.8;
  const noAnswerPattern = /^(?:わから(?:ない|ん|ず)|分から(?:ない|ん|ず)|わかりません|分かりません|しらない|知らない|知りません|不明|忘れた|[?？・…ー―\-.。、\s])+$/;

  /** 書いた答えが「答えなし」か。Jev に送らず、違った扱いにする。 */
  function isNoAnswer(text) {
    return noAnswerPattern.test(String(text || "").trim());
  }

  /**
   * Jev の判定（{ grade, confidence }）を自動で採用するか。
   * 採用しないとき（確信度が低い・形が想定外）は、判定を参考表示にして自己採点へ戻す。
   */
  function decideAiGrade(result, threshold = AI_AUTO_THRESHOLD) {
    if (!result || !selfGrades.includes(result.grade)) return { auto: false, selfGrade: null };
    const confidence = Number(result.confidence);
    if (!Number.isFinite(confidence) || confidence < threshold) return { auto: false, selfGrade: result.grade };
    return { auto: true, selfGrade: result.grade };
  }

  // --- 毎日のノルマ。間隔復習（FSRS）とは独立に、学習済みの語から1日20問を出す。 ---
  const DAILY_QUOTA = 20;
  const DAY_MS = 86400000;

  function startOfLocalDay(now) {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    return day.getTime();
  }

  /** 今日（端末の日付）答えた思い出す問題の数。histories は各セットの progress.history。 */
  function countToday(histories, now = new Date()) {
    const start = startOfLocalDay(now);
    const end = start + DAY_MS;
    return (Array.isArray(histories) ? histories : []).reduce((sum, history) => sum
      + (Array.isArray(history) ? history : []).filter((event) => {
        if (!event || event.kind !== "recall") return false;
        const at = new Date(event.at).getTime();
        return at >= start && at < end;
      }).length, 0);
  }

  function normalizeStat(value) {
    const source = value && typeof value === "object" ? value : {};
    const count = (key) => Number.isInteger(source[key]) && source[key] > 0 ? source[key] : 0;
    return {
      count: count("count"),
      missCount: count("missCount"),
      confidentMissCount: count("confidentMissCount"),
      lastAt: typeof source.lastAt === "string" ? source.lastAt : null,
      lastRating: ["good", "hard", "again"].includes(source.lastRating) ? source.lastRating : null,
    };
  }

  /** 1問の結果を語ごとの記録（progress.recall[wordId]）へ足す。 */
  function recordStat(value, grade, now = new Date()) {
    const stat = normalizeStat(value);
    const rating = ["good", "hard", "again"].includes(grade?.rating) ? grade.rating : "again";
    stat.count++;
    if (rating === "again") stat.missCount++;
    if (grade?.confidentMiss === true) stat.confidentMissCount++;
    stat.lastAt = now.toISOString();
    stat.lastRating = rating;
    return stat;
  }

  /**
   * 出題する語を選ぶ。entries は { key, stat }。
   * 前回思い出せなかった語 → まだ出していない語 → あいまいだった語 → 思い出せた語の順。
   * 今日すでに出した語は最後に回し、同じ段では前回が古い語から出す。
   */
  function pickWords(entries, size, now = new Date(), random = Math.random) {
    const start = startOfLocalDay(now);
    const tier = { again: 0, null: 1, hard: 2, good: 3 };
    return (Array.isArray(entries) ? entries : [])
      .map((entry) => {
        const stat = normalizeStat(entry.stat);
        const lastAt = stat.lastAt ? new Date(stat.lastAt).getTime() : NaN;
        const today = Number.isFinite(lastAt) && lastAt >= start;
        return { key: entry.key, rank: (today ? 10 : 0) + tier[stat.lastRating], lastAt: Number.isFinite(lastAt) ? lastAt : 0, tie: random() };
      })
      .sort((a, b) => a.rank - b.rank || a.lastAt - b.lastAt || a.tie - b.tie)
      .slice(0, Math.max(0, size))
      .map((entry) => entry.key);
  }

  return {
    confidences, selfGrades, gradeRecall, AI_AUTO_THRESHOLD, isNoAnswer, decideAiGrade,
    DAILY_QUOTA, countToday, normalizeStat, recordStat, pickWords,
  };
})();

if (typeof module !== "undefined") module.exports = KobunRecallGrade;
