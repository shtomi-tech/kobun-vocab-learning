"use strict";

const KobunExampleSource = (() => {
  const priority = Object.freeze(["attached", "waka", "prose", "generated"]);
  const priorityIndex = new Map(priority.map((sourceType, index) => [sourceType, index]));
  const exampleFields = ["example", "translation", "source", "cloze", "exampleForm", "waka"];
  const requiredFields = ["example", "translation", "source", "cloze", "exampleForm"];
  const exampleBlank = "（　）";
  const legacySourceLabels = new Set(["出典未詳", "学習用例文", "単語解説"]);
  const wakaSmallKana = new Set(["ゃ", "ゅ", "ょ", "ぁ", "ぃ", "ぅ", "ぇ", "ぉ"]);
  const wakaMoraTargets = [5, 7, 5, 7, 7];
  const countMora = (reading) => [...reading].filter((character) => !wakaSmallKana.has(character)).length;

  function sourceTypeOf(candidate) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
    if (candidate.sourceType !== undefined) {
      return priorityIndex.has(candidate.sourceType) ? candidate.sourceType : null;
    }
    if (candidate.exampleForm === "waka" || candidate.waka?.phrases) return "waka";
    if (candidate.source === "学習用作例") return "generated";
    return "prose";
  }

  function isUsable(candidate) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return false;
    if (requiredFields.some((field) => typeof candidate[field] !== "string" || !candidate[field].trim())) return false;
    if (!["waka", "prose"].includes(candidate.exampleForm)) return false;
    if (candidate.sourceType === "waka" && candidate.exampleForm !== "waka") return false;
    if (["prose", "generated"].includes(candidate.sourceType) && candidate.exampleForm !== "prose") return false;
    if (candidate.sourceType === "generated" && candidate.source !== "学習用作例") return false;
    if (candidate.sourceType === "prose" && candidate.source === "学習用作例") return false;
    if (legacySourceLabels.has(candidate.source) || candidate.example.endsWith(`（${candidate.source}）`)) return false;
    const blankIndex = candidate.cloze.indexOf(exampleBlank);
    if (blankIndex < 0 || (candidate.cloze.match(/（　）/g) ?? []).length !== 1) return false;
    const prefix = candidate.cloze.slice(0, blankIndex);
    const suffix = candidate.cloze.slice(blankIndex + exampleBlank.length);
    if (!candidate.example.startsWith(prefix) || !candidate.example.endsWith(suffix) || prefix.length + suffix.length >= candidate.example.length) return false;
    if (candidate.exampleForm === "waka") {
      if (/[、。]/u.test(candidate.example) || /[（）()]/u.test(candidate.source)) return false;
      if (!candidate.waka || typeof candidate.waka !== "object" || Array.isArray(candidate.waka)) return false;
      if (!Array.isArray(candidate.waka.phrases) || candidate.waka.phrases.length !== 5 || !candidate.waka.phrases.every((phrase) => typeof phrase === "string" && phrase.length > 0)) return false;
      if (candidate.waka.phrases.join("") !== candidate.example) return false;
      if (!Array.isArray(candidate.waka.reading) || candidate.waka.reading.length !== 5 || !candidate.waka.reading.every((reading) => typeof reading === "string" && /^[ぁ-んー]+$/u.test(reading))) return false;
      if (candidate.waka.reading.some((reading) => /[ゃゅょぁぃぅぇぉ]/u.test(reading))) return false;
      if (candidate.waka.reading.some((reading, index) => Math.abs(countMora(reading) - wakaMoraTargets[index]) > 1)) return false;
      if (typeof candidate.waka.author !== "string" || !candidate.waka.author.trim()) return false;
      if (!candidate.waka.ref || typeof candidate.waka.ref !== "object" || Array.isArray(candidate.waka.ref)) return false;
      if (candidate.waka.ref.collection !== candidate.source || typeof candidate.waka.ref.book !== "string" || !candidate.waka.ref.book.trim()) return false;
      if (candidate.waka.ref.collection !== "万葉集" && !candidate.waka.ref.book.includes("・")) return false;
      if (candidate.waka.ref.number !== undefined && (!Number.isInteger(candidate.waka.ref.number) || candidate.waka.ref.number < 1)) return false;
    } else if (candidate.waka !== undefined) {
      return false;
    }
    return true;
  }

  function legacyCandidate(word) {
    const { examples: _examples, ...legacy } = word;
    return legacy;
  }

  function select(word) {
    const candidates = [
      ...(Array.isArray(word.examples) ? word.examples : []),
      legacyCandidate(word),
    ]
      .map((candidate, index) => ({ candidate, index, sourceType: sourceTypeOf(candidate) }))
      .filter(({ candidate, sourceType }) => sourceType && isUsable(candidate))
      .sort((left, right) => priorityIndex.get(left.sourceType) - priorityIndex.get(right.sourceType) || left.index - right.index);

    const selected = candidates[0]?.candidate;
    if (!selected) return word;

    const selectedFields = Object.fromEntries(
      exampleFields
        .filter((field) => selected[field] !== undefined)
        .map((field) => [field, selected[field]]),
    );
    const result = { ...word, ...selectedFields };
    if (result.exampleForm !== "waka") delete result.waka;
    return result;
  }

  return Object.freeze({ priority, sourceTypeOf, isUsable, select });
})();

window.KobunExampleSource = KobunExampleSource;
