import assert from "node:assert/strict";
import fs from "node:fs";

const mode = fs.readFileSync(new URL("../static/mode-vocab.js", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("../static/styles.css", import.meta.url), "utf8");

assert.match(mode, /function exampleBody\(word, \{ blank = false \} = \{\}\)/, "exampleBody helper is required");
assert.match(mode, /exampleBody\(word, \{ blank: true \}\)/, "cloze rendering must use exampleBody");
assert.ok((mode.match(/exampleBody\(word\)/g) ?? []).length >= 2, "card and feedback must use exampleBody");
assert.match(mode, /exampleForm === "waka"/, "waka display must be selected by exampleForm");
assert.match(styles, /\.example--waka, \.cloze--waka/);
assert.match(styles, /\.example--waka[\s\S]*?flex-wrap:\s*wrap/);
assert.match(styles, /\.example--waka \.ku, \.cloze--waka \.ku[\s\S]*?white-space:\s*nowrap/);

console.log("OK: waka display contract");
