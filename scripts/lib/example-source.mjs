import vm from "node:vm";

import { read } from "./data.mjs";

// ブラウザ側の選択ロジックを検査・候補探索でもそのまま使う。
// Node 側に別実装を持つと、優先順位だけが二重人格になるためである。
const source = read("static/example-source.js");
const api = vm.runInNewContext(`${source}\nKobunExampleSource`, { window: {} });

export const exampleSource = api;
export const selectExample = (word) => api.select(word);
export const isUsableExample = (candidate) => api.isUsable(candidate);
