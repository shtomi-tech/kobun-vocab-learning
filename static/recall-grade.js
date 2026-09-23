"use strict";

// 思い出して書く復習の評価。確信度（答えを見る前）・自己採点・ヒントの有無から、
// FSRS へ渡す rating と、誤答確認へ回すか・自信ありの取り違えかを決める純粋ロジック。
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

  return { confidences, selfGrades, gradeRecall, AI_AUTO_THRESHOLD, isNoAnswer, decideAiGrade };
})();

if (typeof module !== "undefined") module.exports = KobunRecallGrade;
