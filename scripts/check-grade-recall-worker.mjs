// 思い出す復習の自動採点 Worker（worker/grade-recall.js・worker/index.js）を、Jev を呼ばずに検証する。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildJevRequest, JEV_MODEL, MAX_ANSWER_LENGTH, parseJevResponse, validateGradeRequest } from "../worker/grade-recall.js";
import worker from "../worker/index.js";

const set01 = JSON.parse(readFileSync(new URL("../data/set-01.json", import.meta.url), "utf8"));
const word = set01.words[0];

// 入力検査
assert.deepEqual(validateGradeRequest({ wordId: "kv01-001", answer: " 出歩く " }), { ok: true, wordId: "kv01-001", answer: "出歩く", dataPath: "/data/set-01.json" });
for (const body of [null, {}, { wordId: "kv1-001", answer: "a" }, { wordId: "../x", answer: "a" }, { wordId: "kv01-001", answer: "  " }, { wordId: "kv01-001", answer: 3 }, { wordId: "kv01-001", answer: "あ".repeat(MAX_ANSWER_LENGTH + 1) }]) {
  assert.equal(validateGradeRequest(body).ok, false, `拒否する: ${JSON.stringify(body)?.slice(0, 40)}`);
}

// 要求の組み立て: 版を固定し、正解は data から、答えは state の別欄に入れる
const request = buildJevRequest(word, "出歩く");
assert.equal(request.model, JEV_MODEL);
assert.notEqual(request.model, "jev-latest");
assert.deepEqual(request.state.word.meanings, word.meanings);
assert.equal(request.state.student_answer, "出歩く");
assert.deepEqual(Object.keys(request.questions.grade.criteria), ["correct", "partial", "wrong"]);
assert.equal(JSON.stringify(request).includes("student-"), false, "生徒IDは送らない");

// 応答の読み取り
assert.deepEqual(parseJevResponse({ model: "jev-1.13.0", answers: { grade: { type: "choice", choice: "partial", probabilities: { correct: 0.2, partial: 0.7, wrong: 0.1 }, confidence: 0.6 } } }),
  { grade: "partial", confidence: 0.6, probabilities: { correct: 0.2, partial: 0.7, wrong: 0.1 }, model: "jev-1.13.0" });
for (const json of [null, {}, { answers: { grade: { type: "noul", noul: 1 } } }, { answers: { grade: { type: "choice", choice: "easy", confidence: 1 } } }]) {
  assert.equal(parseJevResponse(json), null);
}

// Worker 本体: /api 以外は静的アセットへ、キーが無ければ 503、入力が悪ければ Jev を呼ばずに 400
const assets = { fetch: async (req) => {
  const { pathname } = new URL(req.url);
  if (pathname === "/data/set-01.json") return new Response(JSON.stringify(set01));
  return new Response(`asset:${pathname}`, { status: pathname === "/data/set-99.json" ? 404 : 200 });
} };
const post = (body) => new Request("https://example.test/api/grade-recall", { method: "POST", body: JSON.stringify(body) });
assert.equal(await (await worker.fetch(new Request("https://example.test/index.html"), { ASSETS: assets })).text(), "asset:/index.html");
assert.equal((await worker.fetch(post({ wordId: "kv01-001", answer: "x" }), { ASSETS: assets })).status, 503);
assert.equal((await worker.fetch(new Request("https://example.test/api/grade-recall"), { ASSETS: assets, TYPESAFE_API_KEY: "k" })).status, 405);
assert.equal((await worker.fetch(new Request("https://example.test/api/other"), { ASSETS: assets })).status, 404);

const realFetch = globalThis.fetch;
let jevCalls = [];
globalThis.fetch = async (url, init) => {
  jevCalls.push({ url, init });
  return new Response(JSON.stringify({ model: "jev-1.13.0", answers: { grade: { type: "choice", choice: "correct", probabilities: { correct: 0.9, partial: 0.1, wrong: 0 }, confidence: 0.85 } } }));
};
try {
  const env = { ASSETS: assets, TYPESAFE_API_KEY: "test-key" };
  assert.equal((await worker.fetch(post({ wordId: "kv01-001", answer: "" }), env)).status, 400);
  assert.equal((await worker.fetch(post({ wordId: "kv99-001", answer: "x" }), env)).status, 404);
  assert.equal((await worker.fetch(post({ wordId: "kv01-999", answer: "x" }), env)).status, 404);
  assert.equal(jevCalls.length, 0, "入力が悪いときは Jev を呼ばない");
  const response = await worker.fetch(post({ wordId: "kv01-001", answer: "出歩く" }), env);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).grade, "correct");
  assert.equal(jevCalls.length, 1);
  assert.equal(jevCalls[0].init.headers.authorization, "Bearer test-key");
  assert.deepEqual(JSON.parse(jevCalls[0].init.body).state.word.meanings, word.meanings, "正解はサーバ側の data から引く");
} finally {
  globalThis.fetch = realFetch;
}

console.log("OK: 思い出す復習の自動採点 Worker（入力検査・要求・応答・振り分け）");
