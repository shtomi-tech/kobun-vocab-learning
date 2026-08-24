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

const changedFiles = new Map();
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
  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(adoption, field)) location.data.words[location.index][field] = adoption[field];
  }
  changedFiles.set(location.dataUrl, location);
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
    "data/set-11.json",
  ]).has(dataUrl);
  const serialized = collapseSelectedArrays(`${JSON.stringify(location.data, null, 2)}\n`, notesOneLine);
  fs.writeFileSync(new URL(`../${dataUrl}`, import.meta.url), serialized, "utf8");
}

console.log(`OK: applied ${adoptions.length} waka/prose adoptions across ${changedFiles.size} data files`);
