#!/usr/bin/env node
// セット内プールで文中四択が成立するかを検査する。
//
// なぜ必要か: scripts/check-context-choices.mjs は全セット横断（allWords）で
// 誤答候補を数えるが、static/mode-vocab.js の choiceSet() は kind==="context"
// のとき state.set.words、つまり「同じセットの12語」からしか誤答を選ばない。
// このズレのため、同義語が1セットに固まっていても既存検査は通ってしまい、
// 実機では選択肢が2〜3個になったり、誤答も正解になる問題が出る。
//
// 使い方:
//   node scripts/check-set-choices.mjs            # 全セット
//   node scripts/check-set-choices.mjs kobun-set-17
//   node scripts/check-set-choices.mjs kobun-set-17 --pairs
//
// --pairs を付けると「同時に選択肢へ出せるペア」を列挙する。ここに並んだ
// ペアは、一方の cloze にもう一方を入れても文が成立しないか人手で見ること。
// 判定は static/meaning-guard.js をそのまま使うので、実装を変えればこの
// スクリプトの結果も自動で追従する。

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const { isSafePair, hasThreeMutuallySafe } = createRequire(import.meta.url)("../static/meaning-guard.js");

const root = process.env.KOBUN_ROOT || process.cwd();
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));

const args = process.argv.slice(2);
const wantPairs = args.includes("--pairs");
const onlySetId = args.find((arg) => !arg.startsWith("--"));

const manifest = readJson("data/manifest.json");
const sets = Object.entries(manifest.sets)
  .filter(([setId]) => !onlySetId || setId === onlySetId)
  .map(([setId, entry]) => [setId, readJson(entry.dataUrl).words]);

if (!sets.length) {
  console.error(`セットが見つからない: ${onlySetId}`);
  process.exit(2);
}

const failures = [];
for (const [setId, words] of sets) {
  for (const word of words) {
    const { ok, candidateCount } = hasThreeMutuallySafe(word, words);
    if (!ok) failures.push({ setId, word, candidateCount });
  }
}

for (const [setId, words] of sets) {
  const bad = failures.filter((failure) => failure.setId === setId);
  console.log(`${bad.length ? `NG ${bad.length}語` : "OK"}: ${setId} / ${words.length}語`);
  for (const { word, candidateCount } of bad) {
    console.log(`    ${word.id} ${word.headword} — セット内の安全候補 ${candidateCount}語（相互に安全な3つ組を作れない）`);
  }
}

if (wantPairs) {
  for (const [setId, words] of sets) {
    console.log(`\n${setId}: 同時に選択肢へ出せるペア（cloze の答えが一意か人手で見る）`);
    let count = 0;
    for (let i = 0; i < words.length; i += 1) {
      for (let j = i + 1; j < words.length; j += 1) {
        if (!isSafePair(words[i], words[j])) continue;
        console.log(`    ${words[i].headword} × ${words[j].headword}`);
        count += 1;
      }
    }
    if (!count) console.log("    （なし）");
  }
}

if (failures.length) {
  console.log(`\n${failures.length}語で選択肢が4つに満たない。意味が近い語が同じセットに固まっていないか、`);
  console.log("meanings の書き方が重複していないかを見直す（AUTHORING_STANDARD §6）。");
  process.exit(1);
}
