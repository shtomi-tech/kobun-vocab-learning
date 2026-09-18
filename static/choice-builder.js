"use strict";

// 四択の選択肢を組み立てる純粋ロジック。どの語を候補にするか（セット内・復習プール）は
// mode-vocab.js が決めて渡し、ここでは意味重複ガードと和歌の音数優先だけを扱う。
const KobunChoiceBuilder = (() => {
  const defaultShuffle = (items) => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  /**
   * @param word        出題語
   * @param kind        "meaning"（意味四択）か "context"（文中四択）
   * @param candidates  [{ key, word }] 出題語を除いた候補
   * @param fallback    [{ key, word }] 候補が3つに満たないときの補充元（意味四択のみ使う）
   * @param deps        { isSafePair, meaningText, moraCount, shuffle }
   */
  function buildChoices(word, kind, candidates, fallback, deps) {
    const { isSafePair, meaningText, moraCount, shuffle = defaultShuffle } = deps;
    const correct = kind === "meaning" ? meaningText(word) : word.headword;
    const distinctCandidates = candidates
      .filter(({ word: other }) => isSafePair(word, other));
    const selectedCandidates = [];
    const addCandidates = (items) => {
      for (const candidate of shuffle(items)) {
        if (selectedCandidates.every(({ word: other }) => isSafePair(candidate.word, other))) {
          selectedCandidates.push(candidate);
        }
        if (selectedCandidates.length === 3) break;
      }
    };
    // 和歌の文中問題は空欄の音数が見えるため、見出し語の拍数が近い誤答を先に選ぶ。
    const isWakaContextQuestion = kind === "context" && word.exampleForm === "waka";
    const preferredCandidates = isWakaContextQuestion
      ? distinctCandidates.filter(({ word: other }) => Math.abs(moraCount(word) - moraCount(other)) <= 1)
      : [];
    if (isWakaContextQuestion) {
      const preferredIds = new Set(preferredCandidates.map(({ word: other }) => other.id));
      addCandidates(preferredCandidates);
      addCandidates(distinctCandidates.filter(({ word: other }) => !preferredIds.has(other.id)));
    } else {
      addCandidates(distinctCandidates);
    }
    if (kind === "meaning" && selectedCandidates.length < 3 && fallback.length) {
      addCandidates(fallback.filter(({ word: other }) => isSafePair(word, other)));
    }
    const pool = selectedCandidates
      .map(({ word: other }) => kind === "meaning" ? meaningText(other) : other.headword)
      .filter((value, index, values) => value !== correct && values.indexOf(value) === index);
    return shuffle([correct, ...shuffle(pool).slice(0, 3)]);
  }

  // 保存済みの意味四択（再開時）が、今のデータでも安全な組み合わせのままかを確かめる。
  function meaningChoicesAreSafe(word, choices, source, currentKey, deps) {
    const { isSafePair, meaningText } = deps;
    const correct = meaningText(word);
    if (!Array.isArray(choices) || choices.length !== 4 || new Set(choices).size !== 4 || !choices.includes(correct)) return false;
    const selected = choices.map((choice) => choice === correct
      ? word
      : source.find(({ key, word: other }) => key !== currentKey && meaningText(other) === choice)?.word);
    if (!selected.every(Boolean)) return false;
    const distractors = selected.filter((item) => item !== word);
    return distractors.every((item) => isSafePair(word, item)) &&
      selected.every((item, index) => selected.slice(index + 1).every((other) =>
        isSafePair(item, other)
      ));
  }

  return { buildChoices, meaningChoicesAreSafe };
})();

if (typeof module !== "undefined") module.exports = KobunChoiceBuilder;
