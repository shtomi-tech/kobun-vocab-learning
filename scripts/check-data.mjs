import fs from "node:fs";

const manifest = JSON.parse(fs.readFileSync(new URL("../data/manifest.json", import.meta.url)));
if (!manifest.sets?.[manifest.defaultSetId]) throw new Error("defaultSetId is not registered");

const idsAcrossSets = new Set();
const clozeBlank = "（　）";
const attachedSuffixes = [
  "させて", "ながら", "たまへ", "たまふ", "給へ", "給ふ",
  "けり", "ける", "らん", "らむ", "まし", "べき", "けれ",
  "て", "ば", "む", "ん", "ず",
];
const headwordOwnedSuffixesById = new Map([
  ["kv02-019", "ば"], // よばふ: よば は語の一部で、後続の「ひて」が見えている。
  ["kv03-032", "む"], // よをそむく: よをそむ は語の一部で、後続の「きぬ」が見えている。
  ["kv08-091", "まし"], // まします: 連用形ましましの語尾で、助動詞「まし」ではない。
  ["kv17-199", "ん"], // いかがはせむ: 底本の字面「いかがはせん」の語尾で、助動詞ではなく見出し語の一部。
]);
const answerRepeatAllowedById = new Map([
  ["kv08-086", "かつ"], // 「かつ〜かつ〜」は語法上の反復で、対句がないと「一方では」の意味を示せない。
]);
const legacySourceLabels = new Set(["出典未詳", "学習用例文", "単語解説"]);
const wakaMoraTargets = [5, 7, 5, 7, 7];
const wakaSmallKana = new Set(["ゃ", "ゅ", "ょ", "ぁ", "ぃ", "ぅ", "ぇ", "ぉ"]);
const countMora = (reading) => [...reading].filter((character) => !wakaSmallKana.has(character)).length;
const countNonOverlappingOccurrences = (text, needle) => {
  if (!needle) return 0;
  let count = 0;
  let offset = 0;
  while (true) {
    const index = text.indexOf(needle, offset);
    if (index < 0) return count;
    count++;
    offset = index + needle.length;
  }
};

function validateWaka(setId, word) {
  if (word.exampleForm !== undefined && !["waka", "prose"].includes(word.exampleForm)) {
    throw new Error(`${setId}: ${word.id} exampleForm must be waka or prose`);
  }
  if (word.waka !== undefined && word.exampleForm !== "waka") {
    throw new Error(`${setId}: ${word.id} waka requires exampleForm=waka`);
  }
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
  if (waka.reading.some((reading) => /[ゃゅょぁぃぅぇぉ]/u.test(reading))) {
    throw new Error(`${setId}: ${word.id} waka.reading must use historical kana without small kana`);
  }
  const moraCounts = waka.reading.map(countMora);
  if (moraCounts.some((count, index) => Math.abs(count - wakaMoraTargets[index]) > 1)) {
    throw new Error(`${setId}: ${word.id} waka readings have invalid mora counts: ${moraCounts.join("/")}`);
  }
  if (/[、。]/u.test(word.example)) throw new Error(`${setId}: ${word.id} waka example must not contain punctuation`);
  if (typeof waka.author !== "string" || !waka.author.trim()) throw new Error(`${setId}: ${word.id} waka.author is required`);
  if (/[（）()]/u.test(word.source)) throw new Error(`${setId}: ${word.id} waka source must contain collection name only`);
  if (!waka.ref || typeof waka.ref !== "object" || Array.isArray(waka.ref)) throw new Error(`${setId}: ${word.id} waka.ref is required`);
  if (typeof waka.ref.collection !== "string" || !waka.ref.collection.trim()) throw new Error(`${setId}: ${word.id} waka.ref.collection is required`);
  if (typeof waka.ref.book !== "string" || !waka.ref.book.trim()) throw new Error(`${setId}: ${word.id} waka.ref.book is required`);
  // 万葉集は部立を持たないため巻のみ。勅撰集は「巻＋部立」で表記を揃える。
  if (waka.ref.collection !== "万葉集" && !waka.ref.book.includes("・")) {
    throw new Error(`${setId}: ${word.id} waka.ref.book must include the section name`);
  }
  if (!Number.isInteger(waka.ref.number) || waka.ref.number < 1) throw new Error(`${setId}: ${word.id} waka.ref.number is required`);
  if (waka.ref.collection !== word.source) throw new Error(`${setId}: ${word.id} waka.ref.collection must match source`);

  const blankIndex = word.cloze.indexOf(clozeBlank);
  const prefix = word.cloze.slice(0, blankIndex);
  const suffix = word.cloze.slice(blankIndex + clozeBlank.length);
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
  if (startPhrase < 0 || endPhrase < 0 || startPhrase !== endPhrase) {
    throw new Error(`${setId}: ${word.id} waka cloze blank must stay within one phrase`);
  }
}

for (const [setId, entry] of Object.entries(manifest.sets)) {
  const data = JSON.parse(fs.readFileSync(new URL(`../${entry.dataUrl}`, import.meta.url)));
  if (data.meta.id !== setId) throw new Error(`${setId}: meta.id mismatch`);
  if (data.meta.count !== data.words.length) throw new Error(`${setId}: count mismatch`);
  if (!Number.isInteger(data.meta.dataVersion) || data.meta.dataVersion < 1) throw new Error(`${setId}: invalid dataVersion`);
  const ids = new Set();
  for (const word of data.words) {
    for (const key of ["id", "headword", "kanji", "meanings", "example", "translation", "source", "cloze", "exampleForm"]) {
      if (!word[key] || (Array.isArray(word[key]) && !word[key].length)) throw new Error(`${setId}: ${word.id || "unknown"} missing ${key}`);
    }
    if (!["waka", "prose"].includes(word.exampleForm)) throw new Error(`${setId}: ${word.id} exampleForm must be waka or prose`);
    if (!word.meanings.every((meaning) => typeof meaning === "string" && meaning.length > 0)) throw new Error(`${setId}: ${word.id} has an empty meaning`);
    if (!Array.isArray(word.notes) || !word.notes.length || !word.notes.every((note) => typeof note === "string" && note.trim().length > 0)) throw new Error(`${setId}: ${word.id} missing valid notes`);
    if ((word.cloze.match(/（　）/g) ?? []).length !== 1) throw new Error(`${setId}: ${word.id} cloze must have exactly one blank`);
    const blankIndex = word.cloze.indexOf(clozeBlank);
    const prefix = word.cloze.slice(0, blankIndex);
    const suffix = word.cloze.slice(blankIndex + clozeBlank.length);
    if (!word.example.startsWith(prefix) || !word.example.endsWith(suffix) || prefix.length + suffix.length >= word.example.length) {
      throw new Error(`${setId}: ${word.id} cloze must replace one contiguous span of example`);
    }
    const removed = word.example.slice(prefix.length, word.example.length - suffix.length);
    const answerRepeatAllowed = answerRepeatAllowedById.get(word.id) === removed;
    if (removed.length >= 2 && !answerRepeatAllowed && countNonOverlappingOccurrences(word.example, removed) >= 2) {
      throw new Error(`${setId}: ${word.id} cloze answer is exposed in example more than once`);
    }
    const attachedSuffix = attachedSuffixes.find((candidate) => removed.endsWith(candidate));
    const headwordForms = [word.headword, word.kanji].flatMap((form) => {
      const withoutParentheticalNote = form.replace(/[（）()]/g, "");
      return [form, form.split("〜")[0], withoutParentheticalNote, withoutParentheticalNote.split("〜")[0]];
    });
    const headwordOwnsSuffix = headwordForms.includes(removed) || headwordOwnedSuffixesById.get(word.id) === attachedSuffix;
    if (attachedSuffix && !headwordOwnsSuffix) {
      throw new Error(`${setId}: ${word.id} cloze blank includes attached suffix ${attachedSuffix}`);
    }
    validateWaka(setId, word);
    if (word.example.endsWith(`（${word.source}）`)) throw new Error(`${setId}: ${word.id} source is duplicated in example`);
    // 出典が特定できない例文は「学習用作例」として作例と明示する（実出典を装わない）。
    if (legacySourceLabels.has(word.source)) throw new Error(`${setId}: ${word.id} source must name a real text or 学習用作例`);
    if (ids.has(word.id)) throw new Error(`${setId}: duplicate id ${word.id}`);
    ids.add(word.id);
    if (idsAcrossSets.has(word.id)) throw new Error(`cross-set duplicate id ${word.id}`);
    idsAcrossSets.add(word.id);
  }
  console.log(`OK: ${setId} / ${data.words.length}語`);
}
