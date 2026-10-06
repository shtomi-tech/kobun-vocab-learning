"use strict";

// 書いた答えの採点まわりの純粋ロジック。意味を書く演習（static/written-drill.js と mode-vocab.js）が使う。
// 「答えなし」の判定と、Jev の判定を自動で採用するかどうかだけを持つ。
// （以前の「選択肢なしで思い出す」毎日のノルマは、意味を書く演習と重なるため廃止した。）
const KobunRecallGrade = (() => {
  const selfGrades = ["correct", "partial", "wrong"];

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

  return { selfGrades, AI_AUTO_THRESHOLD, isNoAnswer, decideAiGrade };
})();

if (typeof module !== "undefined") module.exports = KobunRecallGrade;
