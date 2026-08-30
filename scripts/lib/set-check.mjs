// check-set-NN.mjs 群の共通部分。セットごとに違うのは
// 「語番号の開始」「cloze が復元する語形」「意味の実値」「同時に出してはいけない組」だけなので、
// それだけを渡してもらい、残りの検査はここで一度だけ書く。
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const root = new URL("../../", import.meta.url);
const require = createRequire(import.meta.url);

export const guard = require("../../static/meaning-guard.js");
// 改行コードはLFへ揃える。実装の字面を正規表現で見る検査が、CRLFの作業コピーでも同じ結果になる。
export const read = (relativePath) => fs.readFileSync(new URL(relativePath, root), "utf8").replace(/\r\n/g, "\n");
export const readJson = (relativePath) => JSON.parse(read(relativePath));

export const manifest = readJson("data/manifest.json");

// 誤答候補は全セットから探すため、毎回読み直さず一度だけ読む。
let allWordsCache = null;
export function allWords() {
  if (!allWordsCache) {
    allWordsCache = Object.values(manifest.sets).flatMap(({ dataUrl }) => readJson(dataUrl).words);
  }
  return allWordsCache;
}

// 意味の字面が同じ語は選択肢に並べても四択にならないため、候補から外してから数える。
export function hasThreeSafeCandidates(target, pool = allWords()) {
  const distinct = pool.filter((candidate) =>
    guard.meaningText(candidate) !== guard.meaningText(target) || candidate.id === target.id);
  return guard.hasThreeMutuallySafe(target, distinct).ok;
}

const REQUIRED_TEXT_KEYS = ["headword", "kanji", "example", "translation", "source", "cloze"];
const CLOZE_BLANK = "（　）";
const stripSpaces = (value) => value.replace(/\s/g, "");

/**
 * セットJSONの共通検査。
 * @param {object} options
 * @param {string} options.setId              manifest上のセットID（例 "kobun-set-06"）
 * @param {number} options.firstNumber        語番号の開始（例 61 → kv06-061）
 * @param {number} [options.count]            収録語数
 * @param {Map<string,string>} [options.expectedForms] 語ID → cloze の空欄に入る語形
 * @param {Array<[string,string]>} [options.familyOverlapPairs] 意味グループで重なっている必要がある組
 * @param {Array<[string,string]>} [options.unsafePairs]        同時に選択肢へ出してはいけない組
 * @param {(wordsById: Map<string,object>) => void} [options.expect] セット固有の実値検査
 * @param {string} options.summary            成功時に出す一行
 */
export function checkSet({
  setId,
  firstNumber,
  count = 12,
  expectedForms = null,
  familyOverlapPairs = [],
  unsafePairs = [],
  expect = null,
  summary,
}) {
  const setNumber = setId.slice(-2);
  const dataUrl = `data/set-${setNumber}.json`;
  assert.equal(manifest.sets[setId].dataUrl, dataUrl);

  const data = readJson(dataUrl);
  assert.equal(data.meta.id, setId);
  assert.equal(data.meta.count, count);
  assert.equal(data.meta.dataVersion, 1);
  assert.deepEqual(
    data.words.map((word) => word.id),
    Array.from({ length: count }, (_, index) => `kv${setNumber}-${String(index + firstNumber).padStart(3, "0")}`),
  );

  for (const word of data.words) {
    for (const key of REQUIRED_TEXT_KEYS) {
      assert.ok(typeof word[key] === "string" && word[key].length > 0, `${word.id}: ${key} is required`);
    }
    assert.ok(
      word.meanings.length >= 1 && word.meanings.every((meaning) => typeof meaning === "string" && meaning.length > 0),
      `${word.id}: meanings are required`);
    assert.ok(
      word.notes?.length >= 1 && word.notes.every((note) => typeof note === "string" && note.trim().length > 0),
      `${word.id}: notes are required`);
    assert.equal((word.cloze.match(/（　）/g) ?? []).length, 1, `${word.id}: cloze must have one blank`);
    if (expectedForms) {
      assert.equal(
        stripSpaces(word.cloze.replace(CLOZE_BLANK, expectedForms.get(word.id))),
        stripSpaces(word.example),
        `${word.id}: cloze does not restore the example`);
    }
    assert.ok(!word.example.endsWith(`（${word.source}）`), `${word.id}: source is duplicated in example`);
  }

  const wordsById = new Map(data.words.map((word) => [word.id, word]));
  if (expect) expect(wordsById);

  // 隣接セットの語と組で見たい場合があるため、セット内になければ全語から引く。
  const byId = (id) => {
    const word = wordsById.get(id) ?? allWords().find((candidate) => candidate.id === id);
    assert.ok(word, `${id}: word not found`);
    return word;
  };
  for (const [leftId, rightId] of familyOverlapPairs) {
    assert.ok(
      guard.hasMeaningFamilyOverlap(byId(leftId), byId(rightId)),
      `${leftId}/${rightId}: family overlap is not configured`);
  }
  for (const [leftId, rightId] of unsafePairs) {
    assert.ok(
      !guard.isSafePair(byId(leftId), byId(rightId)),
      `${leftId}/${rightId}: near meanings must not appear together`);
  }

  for (const word of data.words) {
    assert.ok(hasThreeSafeCandidates(word), `${word.id}: fewer than three safe distractor words`);
  }

  console.log(summary);
}

// nearMeaningIds の全ペアが意味グループで重なっていることを求めるときの組み立て。
export function allPairs(ids) {
  const pairs = [];
  for (let left = 0; left < ids.length; left += 1) {
    for (let right = left + 1; right < ids.length; right += 1) pairs.push([ids[left], ids[right]]);
  }
  return pairs;
}
