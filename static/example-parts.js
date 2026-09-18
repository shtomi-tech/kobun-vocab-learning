"use strict";

// 例文・和歌の表示に使う純粋な計算。空欄の位置、和歌の句の特定、出典箇所の文字列を扱う。
// DOM の組み立て（exampleBody）は mode-vocab.js が受け持つ。
const KobunExampleParts = (() => {
  const BLANK = "（　）";
  const SMALL_KANA = new Set(["ゃ", "ゅ", "ょ", "ぁ", "ぃ", "ぅ", "ぇ", "ぉ"]);

  const isWaka = (word) => word.exampleForm === "waka" && Array.isArray(word.waka?.phrases);

  function wakaRefText(word) {
    const ref = word.waka?.ref;
    if (!ref) return "";
    // 歌番号は任意。底本に通し番号がない歌集では巻・部立だけを出す。
    return Number.isInteger(ref.number) ? `${ref.book}・${ref.number}番` : ref.book;
  }

  // 和歌の文中問題で誤答の音数を揃えるための、見出し語の拍数（拗音の小書きは数えない）。
  const contextMoraCount = (word) => [...word.headword.split("〜")[0]]
    .filter((character) => !SMALL_KANA.has(character)).length;

  // cloze の空欄が example のどの範囲にあたるか。cloze と example が食い違えば null。
  function exampleTargetPart(word) {
    const blankIndex = word.cloze?.indexOf(BLANK) ?? -1;
    if (blankIndex < 0) return null;
    const prefix = word.cloze.slice(0, blankIndex);
    const suffix = word.cloze.slice(blankIndex + BLANK.length);
    const start = prefix.length;
    const end = word.example.length - suffix.length;
    if (end <= start || word.example.slice(0, start) !== prefix || word.example.slice(end) !== suffix) return null;
    return { start, end };
  }

  // 空欄が和歌のどの句に収まるか。句をまたぐ場合は null。
  function wakaBlankPart(word) {
    const target = exampleTargetPart(word);
    if (!target) return null;
    let offset = 0;
    for (const [index, phrase] of word.waka.phrases.entries()) {
      const nextOffset = offset + phrase.length;
      if (target.start >= offset && target.start < nextOffset && target.end > offset && target.end <= nextOffset) {
        return { index, start: target.start - offset, end: target.end - offset };
      }
      offset = nextOffset;
    }
    return null;
  }

  return { BLANK, isWaka, wakaRefText, contextMoraCount, exampleTargetPart, wakaBlankPart };
})();

if (typeof module !== "undefined") module.exports = KobunExampleParts;
