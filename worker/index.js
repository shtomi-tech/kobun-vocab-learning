// 試験版の Worker。/api/* だけをここで処理し、それ以外は静的アセット（_site）をそのまま返す。
// Jev の API キーは Worker の Secret `TYPESAFE_API_KEY`（ダッシュボードの Variables & Secrets）に置く。
import { JEV_URL, buildJevRequest, parseJevResponse, validateGradeRequest } from "./grade-recall.js";

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

async function gradeRecall(request, env) {
  if (request.method !== "POST") return json({ error: "method not allowed" }, 405);
  if (!env.TYPESAFE_API_KEY) return json({ error: "grading unavailable" }, 503);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  const input = validateGradeRequest(body);
  if (!input.ok) return json({ error: input.error }, 400);

  const dataResponse = await env.ASSETS.fetch(new Request(new URL(input.dataPath, request.url)));
  if (!dataResponse.ok) return json({ error: "unknown word" }, 404);
  const set = await dataResponse.json();
  const word = set.words?.find((item) => item.id === input.wordId);
  if (!word) return json({ error: "unknown word" }, 404);

  let jevResponse;
  try {
    jevResponse = await fetch(JEV_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${env.TYPESAFE_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify(buildJevRequest(word, input.answer)),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return json({ error: "grader unreachable" }, 502);
  }
  if (!jevResponse.ok) {
    console.log("jev error", jevResponse.status, (await jevResponse.text()).slice(0, 300));
    return json({ error: "grader error" }, 502);
  }
  const result = parseJevResponse(await jevResponse.json());
  if (!result) return json({ error: "unexpected grader response" }, 502);
  return json(result);
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/grade-recall") return gradeRecall(request, env);
    if (pathname.startsWith("/api/")) return json({ error: "not found" }, 404);
    return env.ASSETS.fetch(request);
  },
};
