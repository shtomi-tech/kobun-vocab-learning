const clozeBlank = "（　）";
const attachedSuffixes = [
  "させて", "ながら", "たまへ", "たまふ", "給へ", "給ふ",
  "けり", "ける", "らん", "らむ", "まし", "べき", "けれ",
  "て", "ば", "む", "ん", "ず",
];
const headwordOwnedSuffixesById = new Map([
  ["kv02-019", "ば"], ["kv03-032", "む"], ["kv08-091", "まし"], ["kv17-199", "ん"],
  ["kv18-210", "て"], ["kv24-277", "けれ"], ["kv30-352", "て"], ["kv32-376", "けれ"],
  ["kv32-381", "けれ"], ["kv33-385", "けれ"], ["kv40-479", "給へ"], ["kv42-494", "けれ"], ["kv42-499", "けれ"],
]);
const answerRepeatAllowedById = new Map([["kv08-086", "かつ"]]);
const legacySourceLabels = new Set(["出典未詳", "学習用例文", "単語解説"]);
const wakaMoraTargets = [5, 7, 5, 7, 7];
const wakaSmallKana = new Set(["ゃ", "ゅ", "ょ", "ぁ", "ぃ", "ぅ", "ぇ", "ぉ"]);
const countMora = (reading) => [...reading].filter((character) => !wakaSmallKana.has(character)).length;
const countNonOverlappingOccurrences = (text, needle) => {
  let count = 0;
  let offset = 0;
  if (!needle) return count;
  while (true) {
    const index = text.indexOf(needle, offset);
    if (index < 0) return count;
    count += 1;
    offset = index + needle.length;
  }
};

export function validateExample(setId, word) {
  if (!word || typeof word !== "object") throw new Error(`${setId}: invalid example`);
  if (!word.example || typeof word.example !== "string") throw new Error(`${setId}: ${word.id} missing example`);
  if (!word.translation || typeof word.translation !== "string") throw new Error(`${setId}: ${word.id} missing translation`);
  if (!word.source || typeof word.source !== "string") throw new Error(`${setId}: ${word.id} missing source`);
  if (!word.cloze || typeof word.cloze !== "string") throw new Error(`${setId}: ${word.id} missing cloze`);
  if (!['waka', 'prose'].includes(word.exampleForm)) throw new Error(`${setId}: ${word.id} exampleForm must be waka or prose`);
  if ((word.cloze.match(/（　）/g) ?? []).length !== 1) throw new Error(`${setId}: ${word.id} cloze must have exactly one blank`);

  const blankIndex = word.cloze.indexOf(clozeBlank);
  const prefix = word.cloze.slice(0, blankIndex);
  const suffix = word.cloze.slice(blankIndex + clozeBlank.length);
  if (!word.example.startsWith(prefix) || !word.example.endsWith(suffix) || prefix.length + suffix.length >= word.example.length) {
    throw new Error(`${setId}: ${word.id} cloze must replace one contiguous span of example`);
  }
  const removed = word.example.slice(prefix.length, word.example.length - suffix.length);
  if (removed.length >= 2 && answerRepeatAllowedById.get(word.id) !== removed && countNonOverlappingOccurrences(word.example, removed) >= 2) {
    throw new Error(`${setId}: ${word.id} cloze answer is exposed in example more than once`);
  }
  const attachedSuffix = attachedSuffixes.find((candidate) => removed.endsWith(candidate));
  const headwordForms = [word.headword, word.kanji].flatMap((form) => {
    const withoutParentheticalNote = form.replace(/[（）()]/g, "");
    return [form, form.split("〜")[0], withoutParentheticalNote, withoutParentheticalNote.split("〜")[0]];
  });
  const headwordOwnsSuffix = headwordForms.includes(removed) || headwordOwnedSuffixesById.get(word.id) === attachedSuffix;
  if (attachedSuffix && !headwordOwnsSuffix) throw new Error(`${setId}: ${word.id} cloze blank includes attached suffix ${attachedSuffix}`);
  if (word.example.endsWith(`（${word.source}）`)) throw new Error(`${setId}: ${word.id} source is duplicated in example`);
  if (legacySourceLabels.has(word.source)) throw new Error(`${setId}: ${word.id} source must name a real text or 学習用作例`);

  if (word.waka !== undefined && word.exampleForm !== "waka") throw new Error(`${setId}: ${word.id} waka requires exampleForm=waka`);
  if (word.exampleForm !== "waka") return;
  const waka = word.waka;
  if (!waka || typeof waka !== "object" || Array.isArray(waka)) throw new Error(`${setId}: ${word.id} waka must be an object`);
  if (!Array.isArray(waka.phrases) || waka.phrases.length !== 5 || !waka.phrases.every((phrase) => typeof phrase === "string" && phrase.length > 0)) {
    throw new Error(`${setId}: ${word.id} waka.phrases must contain five non-empty strings`);
  }
  if (waka.phrases.join("") !== word.example) throw new Error(`${setId}: ${word.id} waka.phrases must reconstruct example`);
  if (!Array.isArray(waka.reading) || waka.reading.length !== 5 || !waka.reading.every((reading) => typeof reading === "string" && /^[ぁ-んー]+$/.test(reading))) {
    throw new Error(`${setId}: ${word.id} waka.reading must contain five hiragana readings`);
  }
  if (waka.reading.some((reading) => /[ゃゅょぁぃぅぇぉ]/u.test(reading))) throw new Error(`${setId}: ${word.id} waka reading must use historical kana without small kana`);
  const moraCounts = waka.reading.map(countMora);
  if (moraCounts.some((count, index) => Math.abs(count - wakaMoraTargets[index]) > 1)) throw new Error(`${setId}: ${word.id} waka readings have invalid mora counts: ${moraCounts.join("/")}`);
  if (/[、。]/u.test(word.example)) throw new Error(`${setId}: ${word.id} waka example must not contain punctuation`);
  if (/[（）()]/u.test(word.source)) throw new Error(`${setId}: ${word.id} waka source must contain collection name only`);
  if (typeof waka.author !== "string" || !waka.author.trim()) throw new Error(`${setId}: ${word.id} waka.author is required`);
  if (!waka.ref || typeof waka.ref !== "object" || Array.isArray(waka.ref)) throw new Error(`${setId}: ${word.id} waka.ref is required`);
  if (waka.ref.collection !== word.source || typeof waka.ref.collection !== "string" || !waka.ref.collection.trim()) throw new Error(`${setId}: ${word.id} waka.ref.collection must match source`);
  if (typeof waka.ref.book !== "string" || !waka.ref.book.trim()) throw new Error(`${setId}: ${word.id} waka.ref.book is required`);
  if (waka.ref.collection !== "万葉集" && !waka.ref.book.includes("・")) throw new Error(`${setId}: ${word.id} waka.ref.book must include the section name`);
  if (waka.ref.number !== undefined && (!Number.isInteger(waka.ref.number) || waka.ref.number < 1)) throw new Error(`${setId}: ${word.id} waka.ref.number must be a positive integer`);

  const blankStart = prefix.length;
  const blankEnd = word.example.length - suffix.length;
  let offset = 0;
  let startPhrase = -1;
  let endPhrase = -1;
  for (const [index, phrase] of waka.phrases.entries()) {
    const nextOffset = offset + phrase.length;
    if (blankStart >= offset && blankStart < nextOffset) startPhrase = index;
    if (blankEnd > offset && blankEnd <= nextOffset) endPhrase = index;
    offset = nextOffset;
  }
  if (startPhrase < 0 || endPhrase < 0 || startPhrase !== endPhrase) throw new Error(`${setId}: ${word.id} waka cloze blank must stay within one phrase`);
}
