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

  return { confidences, selfGrades, gradeRecall };
})();

if (typeof module !== "undefined") module.exports = KobunRecallGrade;
