import assert from "node:assert/strict";
import fs from "node:fs";

const read = (relativePath) => fs.readFileSync(new URL(relativePath, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const mode = read("../static/mode-vocab.js");
const styles = read("../static/styles.css");

assert.match(mode, /function exampleBody\(word, \{ blank = false, underline = false \} = \{\}\)/, "exampleBody helper is required");
assert.match(mode, /exampleBody\(word, \{ blank: true \}\)/, "cloze rendering must use exampleBody");
assert.ok((mode.match(/exampleBody\(word\)/g) ?? []).length >= 2, "card and feedback must use exampleBody");
assert.match(mode, /exampleForm === "waka"/, "waka display must be selected by exampleForm");
assert.match(mode, /wakaRefText/, "waka reference helper is required");
assert.match(mode, /class: "wakaRef"/, "waka reference must be rendered next to the author");
assert.match(styles, /\.example--waka, \.cloze--waka/);
assert.match(styles, /\.example--waka[\s\S]*?flex-wrap:\s*wrap/);
assert.match(styles, /\.example--waka \.ku, \.cloze--waka \.ku[\s\S]*?white-space:\s*nowrap/);

console.log("OK: waka display contract");
