import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("../", import.meta.url);
const readJson = (relativePath) => JSON.parse(fs.readFileSync(new URL(relativePath, root), "utf8"));
const manifest = readJson("data/manifest.json");
const input = readJson("docs/waka-adoptions.json");
const adoptions = input.adoptions;
const allowedFields = new Set(["example", "translation", "source", "cloze", "exampleForm", "waka"]);

assert.ok(Array.isArray(adoptions), "docs/waka-adoptions.json must contain an adoptions array");

const locations = new Map();
for (const [setId, entry] of Object.entries(manifest.sets)) {
  const data = readJson(entry.dataUrl);
  assert.equal(data.meta.id, setId, `${setId}: meta.id mismatch`);
  data.words.forEach((word, index) => {
    assert.ok(!locations.has(word.id), `duplicate data id: ${word.id}`);
    locations.set(word.id, { data, dataUrl: entry.dataUrl, index, setId });
  });
}

// 入力表は過去の差し替えも全部残しているため、無条件に全件を書き戻すと、
// 後からデータ側で直した例文を古い版へ巻き戻してしまう（kv05-049 で実際に発生）。
// そこで既定は差分表示だけにし、書き込みは対象を明示したときに限る。
//   node scripts/apply-waka.mjs                          … 差分の一覧（書き込まない）
//   node scripts/apply-waka.mjs --write --only id1,id2   … 指定した語だけ反映
//   node scripts/apply-waka.mjs --write --all            … 全件反映（入力表を正とする場合だけ）
const argv = process.argv.slice(2);
const write = argv.includes("--write");
const all = argv.includes("--all");
const onlyIndex = argv.indexOf("--only");
const only = onlyIndex >= 0 ? new Set((argv[onlyIndex + 1] ?? "").split(",").filter(Boolean)) : null;
if (write && !all && !only) {
  console.error("書き込むには --only <id,...> か --all を指定する。まず引数なしで差分を確認すること。");
  process.exit(2);
}

const changedFiles = new Map();
const changedIds = [];
const seenAdoptions = new Set();
for (const adoption of adoptions) {
  assert.ok(adoption && typeof adoption === "object", "each adoption must be an object");
  assert.ok(typeof adoption.id === "string" && adoption.id.length > 0, "each adoption needs an id");
  assert.ok(!seenAdoptions.has(adoption.id), `duplicate adoption: ${adoption.id}`);
  seenAdoptions.add(adoption.id);

  const location = locations.get(adoption.id);
  assert.ok(location, `unknown vocabulary id: ${adoption.id}`);
  for (const field of Object.keys(adoption)) {
    assert.ok(field === "id" || allowedFields.has(field), `${adoption.id}: unsupported adoption field ${field}`);
  }
  const word = location.data.words[location.index];
  const diffFields = [...allowedFields].filter((field) =>
    Object.prototype.hasOwnProperty.call(adoption, field) && JSON.stringify(word[field]) !== JSON.stringify(adoption[field]));
  if (!diffFields.length) continue;
  changedIds.push(`${adoption.id} (${diffFields.join(", ")})`);
  if (only && !only.has(adoption.id)) continue;
  for (const field of diffFields) word[field] = adoption[field];
  changedFiles.set(location.dataUrl, location);
}
if (only) {
  for (const id of only) assert.ok(seenAdoptions.has(id), `--only: not in adoptions: ${id}`);
}

if (!write) {
  console.log(changedIds.length ? `データと異なる入力表の語: ${changedIds.length}件` : "OK: 入力表とデータは一致している");
  for (const line of changedIds) console.log(`  ${line}`);
  if (changedIds.length) console.log("意図した語だけを --write --only <id,...> で反映する。");
  process.exit(0);
}

function collapseSelectedArrays(text, notesOneLine) {
  const lines = text.split("\n");
  const output = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^(\s*)"(meanings|notes|phrases|reading)": \[$/);
    if (!match) {
      output.push(lines[index]);
      continue;
    }
    const entries = [];
    index += 1;
    while (index < lines.length && lines[index].trim() !== "]" && lines[index].trim() !== "],") {
      entries.push(lines[index].trim().replace(/,$/u, ""));
      index += 1;
    }
    assert.ok(index < lines.length, "unterminated meanings array");
    const shouldCollapse = match[2] !== "notes" || entries.length === 1 || notesOneLine;
    if (!shouldCollapse) {
      output.push(`${match[1]}"${match[2]}": [`);
      output.push(...entries.map((entry, entryIndex) => `${match[1]}  ${entry}${entryIndex < entries.length - 1 ? "," : ""}`));
      output.push(`${match[1]}${lines[index].trim()}`);
      continue;
    }
    const suffix = lines[index].trim() === "]," ? "," : "";
    output.push(`${match[1]}"${match[2]}": [${entries.join(", ")}]${suffix}`);
  }
  return output.join("\n");
}

for (const [dataUrl, location] of changedFiles) {
  const notesOneLine = new Set([
    "data/set-03.json",
    "data/set-04.json",
    "data/set-05.json",
    "data/set-08.json",
    "data/set-09.json",
    "data/set-10.json",
    "data/set-11.json",
  ]).has(dataUrl);
  const serialized = collapseSelectedArrays(`${JSON.stringify(location.data, null, 2)}\n`, notesOneLine);
  fs.writeFileSync(new URL(`../${dataUrl}`, import.meta.url), serialized, "utf8");
}

const appliedCount = only ? changedIds.filter((line) => only.has(line.split(" ")[0])).length : changedIds.length;
console.log(`OK: applied ${appliedCount} waka/prose adoptions across ${changedFiles.size} data files`);
