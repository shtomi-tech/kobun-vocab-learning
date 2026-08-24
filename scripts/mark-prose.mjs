import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const root = new URL("../", import.meta.url);
const readJson = (relativePath) => JSON.parse(fs.readFileSync(new URL(relativePath, root), "utf8"));
const manifest = readJson("data/manifest.json");
let markedCount = 0;
let wakaCount = 0;
let proseCount = 0;

function headArrayStyles(dataUrl) {
  const head = execFileSync("git", ["show", `HEAD:${dataUrl}`], { encoding: "utf8" });
  const styles = new Map();
  let currentId = null;
  for (const line of head.split(/\r?\n/u)) {
    const idMatch = line.match(/^\s{6}"id": "([^"]+)"/u);
    if (idMatch) currentId = idMatch[1];
    const fieldMatch = line.match(/^\s{6}"(meanings|notes|phrases|reading)": \[(.*)$/u);
    if (!currentId || !fieldMatch) continue;
    styles.set(`${currentId}:${fieldMatch[1]}`, fieldMatch[2].includes("]") ? "single" : "multi");
  }
  return styles;
}

function formatArrays(text, styles) {
  const lines = text.split("\n");
  const output = [];
  let currentId = null;
  for (let index = 0; index < lines.length; index += 1) {
    const idMatch = lines[index].match(/^\s{6}"id": "([^"]+)"/u);
    if (idMatch) currentId = idMatch[1];
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
    assert.ok(index < lines.length, "unterminated array");
    const shouldCollapse = styles.get(`${currentId}:${match[2]}`) !== "multi";
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

for (const [setId, entry] of Object.entries(manifest.sets)) {
  const dataUrl = entry.dataUrl;
  const data = readJson(dataUrl);
  let markedInFile = 0;
  for (const word of data.words) {
    if (word.exampleForm === undefined) {
      word.exampleForm = "prose";
      markedCount += 1;
      markedInFile += 1;
    }
    if (word.exampleForm === "waka") wakaCount += 1;
    if (word.exampleForm === "prose") proseCount += 1;
  }
  const serialized = formatArrays(`${JSON.stringify(data, null, 2)}\n`, headArrayStyles(dataUrl));
  const current = fs.readFileSync(new URL(`../${dataUrl}`, import.meta.url), "utf8");
  if (serialized !== current) fs.writeFileSync(new URL(`../${dataUrl}`, import.meta.url), serialized, "utf8");
  if (markedInFile) console.log(`OK: ${setId} / prose ${markedInFile}語`);
}

assert.ok(markedCount === 0 || markedCount === 135, `expected a first run of 135 or an idempotent rerun of 0, got ${markedCount}`);
assert.equal(wakaCount, 13, `expected 13 waka values, got ${wakaCount}`);
assert.equal(proseCount, 155, `expected 155 prose values, got ${proseCount}`);
console.log(`OK: marked ${markedCount} prose values / total ${wakaCount + proseCount}語`);
