// 例文品質レビュー（docs/EXAMPLE_QUALITY_RUBRIC.md §2）の母数を数え直す読み取り専用スクリプト。
// データも台帳も変更しない。ルーブリックの「現行データの実測」を更新するときに実行する。
import fs from "node:fs";

const words = fs
  .readdirSync("data")
  .filter((file) => /^set-\d+\.json$/u.test(file))
  .sort()
  .flatMap((file) => JSON.parse(fs.readFileSync(`data/${file}`, "utf8")).words);

// docs/SOURCE_EDITIONS.md「語ごとの対応」の底本欄を語IDへ引く。証拠段階の判定はこの欄を根拠にする。
const ledger = new Map(
  fs
    .readFileSync("docs/SOURCE_EDITIONS.md", "utf8")
    .split("\n")
    .filter((line) => /^\|\s*kv\d\d-\d\d\d/u.test(line))
    .map((line) => [line.match(/kv\d\d-\d\d\d/u)[0], line.split("|")[3].trim()]),
);

const stage = (word) => {
  const base = ledger.get(word.id);
  if (base === undefined) return "台帳に未記載";
  if (base.includes("『")) return "底本・確認資料あり";
  if (base.includes("学習用作例")) return "学習用作例";
  if (base.includes("添付資料")) return "添付資料のみ";
  return /源氏物語/u.test(word.source) ? "底本不特定（源氏物語）" : "底本未確定（その他）";
};

const prose = words.filter((word) => word.exampleForm === "prose");
const lengths = words.map((word) => word.example.length).sort((a, b) => a - b);
const median = (lengths[Math.floor((lengths.length - 1) / 2)] + lengths[Math.ceil((lengths.length - 1) / 2)]) / 2;
const shared = Object.values(
  words.reduce((map, word) => ((map[word.example] ??= []).push(word.id), map), {}),
).filter((ids) => ids.length > 1);
const blankLength = (word) => word.example.length - (word.cloze.length - "（　）".length);
const tally = words.reduce((map, word) => ((map[stage(word)] = (map[stage(word)] ?? 0) + 1), map), {});

console.log(`語数 ${words.length}`);
console.log(
  `主例文 和歌 ${words.filter((word) => word.exampleForm === "waka").length} ／ 学習用作例 ${
    words.filter((word) => word.source === "学習用作例").length
  } ／ 添付候補あり ${words.filter((word) => Array.isArray(word.examples)).length} ／ source に（添付資料）${
    words.filter((word) => /添付資料/u.test(word.source)).length
  }`,
);
console.log(
  `例文長 最短 ${lengths[0]} ／ 中央値 ${median} ／ 最長 ${lengths.at(-1)}｜散文 60字超 ${
    prose.filter((word) => word.example.length > 60).length
  }（うち90字超 ${prose.filter((word) => word.example.length > 90).length}）／ 14字以下 ${
    prose.filter((word) => word.example.length < 15).length
  }`,
);
console.log(`同一本文 ${shared.length}組 ${shared.flat().length}語 ／ 1文字空欄 ${words.filter((word) => blankLength(word) === 1).length}語`);
console.log("典拠台帳の記録状況");
for (const [key, count] of Object.entries(tally).sort((a, b) => b[1] - a[1])) console.log(`  ${key}: ${count}`);
console.log(`  90字超の散文: ${prose.filter((word) => word.example.length > 90).map((word) => word.id).join(", ")}`);
console.log(`  台帳に未記載: ${words.filter((word) => !ledger.has(word.id)).map((word) => word.id).join(", ")}`);
