"use strict";

// 意味を書く演習（ホームの「書く」タブ）の純粋ロジック。
// 出題は段階式: まず見出し語だけで書く → 誤答・わからない → 例文をヒントにもう一度 → それでも誤答 → 答えを確認。
// 見出し語だけで正解＝覚えた（learned）、例文で正解＝あやふや（shaky。回の最後にもう一度）、
// 答えを見た＝未習得（notLearned。数問あとに見出し語だけでもう一度）。
// 記憶から引き出す負荷を先に掛け、例文は補助に回す（英単語アプリ eiken-q1-practice の同名演習から移植）。
// 結果は履歴（kind: "written"）にだけ残し、間隔復習（FSRS）と思い出す問題のノルマには混ぜない。
const KobunWrittenDrill = (() => {
  const SESSION_SIZE = 10;
  const SIZE_CHOICES = [5, 10, 20];
  // 答えを見た語を、何問あとにもう一度出すか。
  const REASK_GAP = 3;
  const MAX_ANSWER_LENGTH = 60;
  const grades = ["correct", "partial", "wrong"];
  const outcomes = ["learned", "shaky", "notLearned"];

  /** 1回の語数の選択肢。出題できる語が少ないときは、その数に丸めて重複を除く。 */
  function sizeChoices(available) {
    const count = Math.max(0, Math.floor(Number(available) || 0));
    return [...new Set(SIZE_CHOICES.map((size) => Math.min(size, count)))].filter((size) => size > 0);
  }

  /** 保存していた語数が選択肢に無ければ、いちばん大きい選択肢にする。 */
  function preferredSize(choices, stored) {
    const value = Number(stored) || SESSION_SIZE;
    return choices.includes(value) ? value : choices[choices.length - 1];
  }

  /**
   * 1回の採点結果から次の段階を決める。
   * step: "word" | "example"、reask: 再出題か、grade: "correct" | "partial" | "wrong"。
   * exampleShown: 見出し語の段階から例文を出していたか（同じ読みの語）。そのときは例文の段階を飛ばす。
   * 戻り値の next は "example"（例文をヒントにもう一度）| "result"（正解で次へ）| "answer"（答えを確認）。
   */
  function nextStep(step, reask, grade, { exampleShown = false } = {}) {
    const correct = grade === "correct";
    if (reask) return { next: correct ? "result" : "answer", reaskResult: correct ? "correct" : "wrong" };
    if (step === "word") {
      if (correct) return { next: "result", outcome: "learned" };
      return exampleShown ? { next: "answer", outcome: "notLearned" } : { next: "example" };
    }
    return correct ? { next: "result", outcome: "shaky" } : { next: "answer", outcome: "notLearned" };
  }

  /** 再出題を差し込む位置。未習得は数問あと、あやふやは回の最後。差し込まないときは -1。 */
  function reaskIndex(outcome, pos, length, gap = REASK_GAP) {
    if (outcome === "notLearned") return Math.min(pos + 1 + gap, length);
    if (outcome === "shaky") return length;
    return -1;
  }

  function normalize(value) {
    return String(value || "")
      .normalize("NFKC")
      .replace(/[「」『』【】（）()［］[\]〔〕、。，．,.・／/〜~～;；:：!！?？\s]/g, "")
      .replace(/(?:すること|こと|する|な|の)$/u, "");
  }

  /** 書いた答えが、正解の意味のどれかと表記ゆれ程度で一致するか。一致すれば Jev に送らず正解にする。 */
  function localMatch(answer, meanings) {
    const target = normalize(answer);
    if (!target) return false;
    return (Array.isArray(meanings) ? meanings : [meanings])
      .flatMap((meaning) => String(meaning || "").split(/[。、；;／,，]/))
      .map(normalize)
      .filter(Boolean)
      .includes(target);
  }

  /** 回の集計。results は { outcome, reaskResult }。 */
  function summarize(results) {
    const list = Array.isArray(results) ? results : [];
    const count = (outcome) => list.filter((r) => r && r.outcome === outcome).length;
    const reasked = list.filter((r) => r && r.reaskResult);
    return {
      learned: count("learned"),
      shaky: count("shaky"),
      notLearned: count("notLearned"),
      reasked: reasked.length,
      reaskCorrect: reasked.filter((r) => r.reaskResult === "correct").length,
    };
  }

  return {
    SESSION_SIZE, SIZE_CHOICES, REASK_GAP, MAX_ANSWER_LENGTH, grades, outcomes,
    sizeChoices, preferredSize, nextStep, reaskIndex, normalize, localMatch, summarize,
  };
})();

if (typeof module !== "undefined") module.exports = KobunWrittenDrill;
