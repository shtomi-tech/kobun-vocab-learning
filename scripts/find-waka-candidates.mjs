#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

import { loadSets, resolve } from "./lib/data.mjs";
import { corpusSummary, findCandidates, HACHIDAISHU_COLLECTIONS, loadHachidaishu } from "./lib/waka-candidates.mjs";
import { selectExample } from "./lib/example-source.mjs";

const argv = process.argv.slice(2);
const valueAfter = (flag) => {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
};
const top = Number(valueAfter("--top") ?? 5);
const setFilter = valueAfter("--set");
const idFilter = valueAfter("--id");
const collection = valueAfter("--collection");
const outputPath = valueAfter("--output") ?? ".cache/waka/candidates.json";
const corpusPath = valueAfter("--corpus");

const words = loadSets()
  .filter(({ setId }) => !setFilter || setId === setFilter)
  .flatMap(({ data }) => data.words.map(selectExample))
  .filter((word) => idFilter || word.exampleForm !== "waka")
  .filter((word) => !idFilter || word.id === idFilter);
const records = await loadHachidaishu({ corpusPath });
const summary = corpusSummary(records);
const results = findCandidates(words, records, { top: Number.isInteger(top) && top > 0 ? top : 5, collection });
const report = {
  generatedAt: new Date().toISOString(),
  corpus: {
    name: "Hachidaishu",
    url: "https://github.com/yamagen/hachidaishu",
    ...summary,
    coverage: {
      collections: HACHIDAISHU_COLLECTIONS,
      excluded: ["Manyoshu (万葉集)"],
    },
  },
  scannedWords: words.length,
  wordsWithCandidates: results.filter((result) => result.candidates.length > 0).length,
  results,
};
const outputAbsolutePath = resolve(outputPath);
fs.mkdirSync(path.dirname(outputAbsolutePath), { recursive: true });
fs.writeFileSync(outputAbsolutePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`waka candidates: ${report.scannedWords}語を走査 / 候補あり ${report.wordsWithCandidates}語 / ${outputPath}`);
