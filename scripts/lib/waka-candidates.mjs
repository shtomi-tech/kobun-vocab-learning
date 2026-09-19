import fs from "node:fs";
import path from "node:path";

import { read, resolve } from "./data.mjs";

export const HACHIDAISHU_URL = "https://raw.githubusercontent.com/yamagen/hachidaishu/main/hachidaishu.jsonl";
export const HACHIDAISHU_CACHE = ".cache/waka/hachidaishu.jsonl";
export const HACHIDAISHU_REQUIRED_FIELDS = Object.freeze([
  "anthology",
  "poem",
  "surface",
  "lemma",
  "lemma_reading",
  "kanji",
  "kanji_reading",
]);
const anthologyNames = new Map([
  ["Kokinshu", "古今和歌集"],
  ["Gosenshu", "後撰和歌集"],
  ["Shuishu", "拾遺和歌集"],
  ["Goshuishu", "後拾遺和歌集"],
  ["Kin'yoshu", "金葉和歌集"],
  ["Kin’yoshu", "金葉和歌集"],
  ["Shikashu", "詞花和歌集"],
  ["Senzaishu", "千載和歌集"],
  ["Shinkokinshu", "新古今和歌集"],
]);
export const HACHIDAISHU_COLLECTIONS = Object.freeze([...new Set(anthologyNames.values())]);
const smallKana = new Set(["ゃ", "ゅ", "ょ", "ぁ", "ぃ", "ぅ", "ぇ", "ぉ"]);

const normalize = (value) => String(value ?? "").normalize("NFKC").replace(/[・･〜～（）()\s]/gu, "");
const moraCount = (reading) => [...reading].filter((character) => !smallKana.has(character)).length;

export function validateHachidaishuRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new Error("Hachidaishu schema mismatch: record must be an object");
  }
  for (const field of HACHIDAISHU_REQUIRED_FIELDS) {
    if (!(field in record)) {
      throw new Error(`Hachidaishu schema mismatch: missing \"${field}\"`);
    }
  }
  return record;
}

export function parseCorpusJsonl(text) {
  return text
    .split(/\r?\n/u)
    .map((line, index) => ({ line: index + 1, text: line.trim() }))
    .filter(({ text }) => text && !text.startsWith("#"))
    .map(({ line, text }) => {
      try {
        return validateHachidaishuRecord(JSON.parse(text));
      } catch (error) {
        if (error.message.startsWith("Hachidaishu schema mismatch")) {
          throw new Error(`${error.message} (line ${line})`);
        }
        throw new Error(`hachidaishu JSONL line ${line}: ${error.message}`);
      }
    });
}

export function headwordVariants(word) {
  const values = [word.headword, word.kanji]
    .filter((value) => typeof value === "string")
    .flatMap((value) => value.split(/[・･／/]/u))
    .map((value) => normalize(value))
    .filter((value) => value.length > 0);
  return [...new Set(values)].sort((left, right) => right.length - left.length);
}

function groupPoems(records) {
  const poems = new Map();
  for (const record of records) {
    if (!record || typeof record !== "object") continue;
    const anthology = String(record.anthology ?? "");
    const poem = String(record.poem ?? "");
    if (!anthology || !poem || typeof record.surface !== "string") continue;
    const key = `${anthology}\u0000${poem}`;
    const entry = poems.get(key) ?? { anthology, poem: record.poem, tokens: [] };
    entry.tokens.push(record);
    poems.set(key, entry);
  }
  return poems.values();
}

export function matchToken(token, variants) {
  const fields = [
    ["lemma_reading", token.lemma_reading],
    ["kanji_reading", token.kanji_reading],
    ["lemma", token.lemma],
    ["kanji", token.kanji],
    ["surface", token.surface],
  ]
    .filter(([, value]) => typeof value === "string")
    .map(([field, value]) => ({ field, value: normalize(value) }));
  let partialMatch = null;
  for (const variant of variants) {
    for (const field of fields) {
      if (field.value === variant) return { variant, field: field.field, exact: true };
      if (!partialMatch && field.value.includes(variant)) {
        partialMatch = { variant, field: field.field, exact: false };
      }
    }
  }
  return partialMatch;
}

export function findCandidates(words, records, options = {}) {
  const grouped = [...groupPoems(records)];
  const collectionFilter = options.collection ? normalize(options.collection) : null;
  const output = [];
  for (const word of words) {
    const variants = headwordVariants(word);
    if (!variants.length) continue;
    const longerVariants = variants.filter((variant) => variant.length > 1);
    const candidates = [];
    for (const poem of grouped) {
      const collection = anthologyNames.get(poem.anthology) ?? poem.anthology;
      if (collectionFilter && normalize(collection) !== collectionFilter && normalize(poem.anthology) !== collectionFilter) continue;
      const matches = poem.tokens.flatMap((token, tokenIndex) => {
        const match = matchToken(token, variants);
        return match ? [{ tokenIndex, surface: token.surface, ...match }] : [];
      });
      if (!matches.length) continue;
      const hasLongerMatch = matches.some((match) => longerVariants.includes(match.variant));
      if (longerVariants.length && !hasLongerMatch) continue;
      const reading = poem.tokens.map((token) => token.kanji_reading ?? token.lemma_reading ?? "").join("");
      const surface = poem.tokens.map((token) => token.surface).join("");
      const matchedVariants = [...new Set(matches.map((match) => match.variant))];
      const bestLength = Math.max(...matchedVariants.map((variant) => variant.length));
      const exactLemmaBonus = matches.some((match) => match.exact && ["lemma", "lemma_reading"].includes(match.field)) ? 10 : 0;
      const duplicatePenalty = Math.max(0, matches.length - 1) * 5;
      const score = bestLength * 20 + exactLemmaBonus + (reading ? 1 : 0) - duplicatePenalty;
      candidates.push({
        wordId: word.id,
        headword: word.headword,
        collection,
        anthology: poem.anthology,
        poem: poem.poem,
        surface,
        reading,
        matchedVariants,
        matches: matches.map(({ tokenIndex, surface: tokenSurface, variant, field, exact }) => ({ tokenIndex, surface: tokenSurface, variant, field, exact })),
        totalMora: moraCount(reading),
        likelyTanka: moraCount(reading) >= 28 && moraCount(reading) <= 35,
        score,
        corpus: "hachidaishu",
      });
    }
    candidates.sort((left, right) => right.score - left.score || Number(left.poem) - Number(right.poem));
    output.push({ wordId: word.id, headword: word.headword, exampleForm: word.exampleForm, candidates: candidates.slice(0, options.top ?? 5) });
  }
  return output;
}

export async function loadHachidaishu(options = {}) {
  const cacheRelativePath = options.cacheRelativePath ?? HACHIDAISHU_CACHE;
  const cachePath = resolve(cacheRelativePath);
  if (options.corpusPath) {
    const records = parseCorpusJsonl(fs.readFileSync(options.corpusPath, "utf8"));
    corpusSummary(records);
    return records;
  }
  if (fs.existsSync(cachePath)) {
    const records = parseCorpusJsonl(fs.readFileSync(cachePath, "utf8"));
    corpusSummary(records);
    return records;
  }
  if (options.noFetch) throw new Error(`Hachidaishu cache is missing: ${cachePath}`);
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(options.url ?? HACHIDAISHU_URL);
  if (!response.ok) throw new Error(`Hachidaishu download failed: HTTP ${response.status}`);
  const text = await response.text();
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, text, "utf8");
  const records = parseCorpusJsonl(text);
  corpusSummary(records);
  return records;
}

export function corpusSummary(records) {
  const poems = [...groupPoems(records)];
  if (!records.length || !poems.length) {
    throw new Error("Hachidaishu corpus loaded but contained no usable poems");
  }
  return { records: records.length, poems: poems.length, anthologies: [...new Set(poems.map((poem) => poem.anthology))] };
}

export const readCorpusFile = (relativePath) => parseCorpusJsonl(read(relativePath));
