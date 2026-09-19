import fs from "node:fs";
import path from "node:path";

import { read, resolve } from "./data.mjs";

export const HACHIDAISHU_URL = "https://raw.githubusercontent.com/yamagen/hachidaishu/main/hachidaishu.jsonl";
export const HACHIDAISHU_CACHE = ".cache/waka/hachidaishu.jsonl";
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
  ["Manyoshu", "万葉集"],
]);
const smallKana = new Set(["ゃ", "ゅ", "ょ", "ぁ", "ぃ", "ぅ", "ぇ", "ぉ"]);

const normalize = (value) => String(value ?? "").normalize("NFKC").replace(/[・･〜～（）()\s]/gu, "");
const moraCount = (reading) => [...reading].filter((character) => !smallKana.has(character)).length;

export function parseCorpusJsonl(text) {
  return text
    .split(/\r?\n/u)
    .map((line, index) => ({ line: index + 1, text: line.trim() }))
    .filter(({ text }) => text && !text.startsWith("#"))
    .map(({ line, text }) => {
      try {
        return JSON.parse(text);
      } catch (error) {
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
    const anthology = String(record.Anthology ?? "");
    const poem = String(record.Poem ?? "");
    if (!anthology || !poem || typeof record.Surface !== "string") continue;
    const key = `${anthology}\u0000${poem}`;
    const entry = poems.get(key) ?? { anthology, poem, tokens: [] };
    entry.tokens.push(record);
    poems.set(key, entry);
  }
  return poems.values();
}

function matchToken(token, variants) {
  const fields = [token.LemmaReading, token.KanjiReading, token.Lemma, token.Kanji, token.Surface]
    .filter((value) => typeof value === "string")
    .map(normalize);
  const variant = variants.find((candidate) => fields.some((field) => field === candidate || field.includes(candidate)));
  return variant ? { variant, field: fields.indexOf(variant) } : null;
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
        return match ? [{ tokenIndex, surface: token.Surface, ...match }] : [];
      });
      if (!matches.length) continue;
      const hasLongerMatch = matches.some((match) => longerVariants.includes(match.variant));
      if (longerVariants.length && !hasLongerMatch) continue;
      const reading = poem.tokens.map((token) => token.KanjiReading ?? token.LemmaReading ?? "").join("");
      const surface = poem.tokens.map((token) => token.Surface).join("");
      const matchedVariants = [...new Set(matches.map((match) => match.variant))];
      const bestLength = Math.max(...matchedVariants.map((variant) => variant.length));
      const score = bestLength * 20 + (matches.length > 1 ? 5 : 0) + (reading ? 1 : 0);
      candidates.push({
        wordId: word.id,
        headword: word.headword,
        collection,
        anthology: poem.anthology,
        poem: poem.poem,
        surface,
        reading,
        matchedVariants,
        matches: matches.map(({ tokenIndex, surface: tokenSurface, variant }) => ({ tokenIndex, surface: tokenSurface, variant })),
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
  if (options.corpusPath) return parseCorpusJsonl(fs.readFileSync(options.corpusPath, "utf8"));
  if (fs.existsSync(cachePath)) return parseCorpusJsonl(fs.readFileSync(cachePath, "utf8"));
  if (options.noFetch) throw new Error(`Hachidaishu cache is missing: ${cachePath}`);
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(options.url ?? HACHIDAISHU_URL);
  if (!response.ok) throw new Error(`Hachidaishu download failed: HTTP ${response.status}`);
  const text = await response.text();
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, text, "utf8");
  return parseCorpusJsonl(text);
}

export function corpusSummary(records) {
  const poems = [...groupPoems(records)];
  return { records: records.length, poems: poems.length, anthologies: [...new Set(poems.map((poem) => poem.anthology))] };
}

export const readCorpusFile = (relativePath) => parseCorpusJsonl(read(relativePath));
