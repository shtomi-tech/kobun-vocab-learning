"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const read = (path) => fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const modeSource = read("static/mode-vocab.js");
const cloudSource = read("static/cloud.js");

function loadModeApp(exposedNames, sandboxOverrides = {}) {
  const source = modeSource.replace(
    "  return { mount };",
    `  return { mount, __test: { ${exposedNames.join(", ")} } };`,
  );
  assert.ok(source.includes("__test:"), "mode-vocab.js の内部関数の露出に失敗しました");
  const sandbox = {
    URLSearchParams,
    location: { search: "" },
    console,
    KobunMeaningGuard: { meaningText: () => "", isSafePair: () => true },
    KobunStudyPlan: require("../static/study-plan.js"),
    KobunExampleParts: require("../static/example-parts.js"),
    KobunChoiceBuilder: require("../static/choice-builder.js"),
    ...sandboxOverrides,
  };
  vm.runInNewContext(`${source}\nglobalThis.__app = KobunVocabApp;`, sandbox);
  return sandbox.__app.__test;
}

function loadCloudApi(fetch) {
  const sandbox = {
    URLSearchParams,
    location: { search: "?s=student-1&t=token-1" },
    console: { log: (...args) => console.log(...args), error: () => {}, warn: (...args) => console.warn(...args) },
    fetch,
    setTimeout,
    clearTimeout,
  };
  vm.runInNewContext(`${cloudSource}\nglobalThis.__cloud = { create: createCloud };`, sandbox);
  return sandbox.__cloud;
}

// --- T1: 学習ブロック境界 ---
const { createLearnSession, state } = loadModeApp(["createLearnSession", "state"]);
const words = Array.from({ length: 12 }, (_, index) => ({ id: `kv01-${String(index + 1).padStart(3, "0")}` }));
state.set = { words };
state.progress = { units: {} };

const ids = words.map(({ id }) => id);
const asSet = (values) => new Set(Array.from(values));
const assertSameIds = (actual, expected, message) => {
  assert.equal(actual.length, expected.length, message);
  assert.deepEqual(asSet(actual), asSet(expected), message);
};

const directThird = createLearnSession(2);
assertSameIds(directThird.contextOrder, ids.slice(8), "第3ブロック直接開始は第3ブロックだけを出題する");
assert.equal(directThird.batchIndex, 2);

ids.slice(0, 8).forEach((id) => { state.progress.units[id] = { learned: true }; });
const resumedThird = createLearnSession();
assertSameIds(resumedThird.contextOrder, ids.slice(8), "途中開始は未学習ブロック以降だけを出題する");
assert.equal(resumedThird.batchIndex, 2);

const normalStart = createLearnSession(0);
assertSameIds(normalStart.contextOrder, ids, "通常開始は全12語を文中問題へ渡す");
console.log("vocabulary runtime contract: T1 context boundary OK");

// --- T3: 進捗コンテナの正規化 ---
assert.match(modeSource, /function normalizeProgress\(candidate, set\)/, "進捗正規化関数が必要です");
assert.match(modeSource, /const progress = normalizeProgress\(saved, set\)/, "ローカル読み込み直後に正規化する必要があります");
const storageValues = new Map();
const localStorageStub = {
  getItem: (key) => storageValues.has(key) ? storageValues.get(key) : null,
  setItem: (key, value) => storageValues.set(key, String(value)),
};
const malformedTest = loadModeApp(
  ["normalizeProgress", "loadProgressFor", "applyCloudProgress", "state", "unit", "reviewIds", "appendHistory"],
  { localStorage: localStorageStub },
);
const malformedSet = {
  meta: { dataVersion: 1 },
  words: [{ id: "kv02-001" }],
};
const malformed = { units: null, finalCheck: null, history: {}, items: null, keepMe: "yes" };
const normalized = malformedTest.normalizeProgress(malformed, malformedSet);
assert.equal(typeof normalized.units, "object");
assert.equal(Array.isArray(normalized.units), false);
assert.equal(typeof normalized.finalCheck, "object");
assert.equal(typeof normalized.items, "object");
assert.equal(Array.isArray(normalized.history), true);
assert.equal(normalized.keepMe, "yes", "未知のトップレベル項目は保持する必要があります");
for (const candidate of [null, [], "broken", 42]) {
  const safe = malformedTest.normalizeProgress(candidate, malformedSet);
  assert.equal(typeof safe.units, "object");
  assert.equal(Array.isArray(safe.history), true);
}

storageValues.set("kobun_vocab_progress_set-02", JSON.stringify(malformed));
const loaded = malformedTest.loadProgressFor("set-02", malformedSet);
malformedTest.state.set = malformedSet;
malformedTest.state.progress = loaded;
assert.doesNotThrow(() => malformedTest.unit("kv02-001"), "壊れたunitsでもunit()を利用できる必要があります");
assert.deepEqual(Array.from(malformedTest.reviewIds()), [], "空の正規化後は復習対象が空である必要があります");
assert.doesNotThrow(() => malformedTest.appendHistory({ kind: "question", wordId: "kv02-001" }), "正規化後は履歴を追加できる必要があります");
assert.equal(Array.isArray(loaded.history), true);
assert.equal(loaded.history.length, 1);

malformedTest.state.manifest = { sets: { "set-02": {} } };
malformedTest.applyCloudProgress({ "set-02": malformed });
const cloudLoaded = malformedTest.loadProgressFor("set-02", malformedSet);
assert.equal(typeof cloudLoaded.units, "object", "cloud由来データも次回読み込みで正規化する必要があります");
assert.equal(Array.isArray(cloudLoaded.history), true);
console.log("vocabulary runtime contract: T3 malformed progress OK");

// --- T4: 初回ヒーロー ---
assert.ok(!modeSource.includes("const isFirstVisit = learned === 0"), "学習語数を初回ヒーローの条件に使ってはいけません");
assert.match(modeSource, /if \(isFirstReveal\) \{/, "初回ヒーローはisFirstRevealで判定する必要があります");
function createDomStub() {
  const selectorNodes = new Map();
  const createNode = (tagName, text = "") => {
    let className = "";
    let innerHTML = "";
    const node = {
      nodeType: 1,
      tagName,
      children: [],
      attributes: {},
      style: {},
      textContent: text,
      append(...children) { this.children.push(...children.flat().filter(Boolean)); },
      appendChild(child) { this.children.push(child); return child; },
      setAttribute(key, value) { this.attributes[key] = String(value); },
      removeAttribute(key) { delete this.attributes[key]; },
      addEventListener() {},
      querySelectorAll() { return []; },
      querySelector() { return null; },
      focus() {},
      scrollIntoView() {},
    };
    Object.defineProperty(node, "className", {
      get: () => className,
      set: (value) => { className = String(value || ""); },
    });
    Object.defineProperty(node, "classList", {
      value: {
        add: (...names) => { className = [...new Set(`${className} ${names.join(" ")}`.trim().split(/\s+/))].join(" "); },
        remove: (...names) => { className = className.split(/\s+/).filter((name) => name && !names.includes(name)).join(" "); },
        contains: (name) => className.split(/\s+/).includes(name),
      },
    });
    Object.defineProperty(node, "innerHTML", {
      get: () => innerHTML,
      set: (value) => { innerHTML = String(value); node.children = []; },
    });
    return node;
  };
  const homePanel = createNode("main");
  const sessionPanel = createNode("main");
  const wrap = createNode("div");
  selectorNodes.set("#homePanel", homePanel);
  selectorNodes.set("#sessionPanel", sessionPanel);
  selectorNodes.set(".wrap", wrap);
  return {
    document: {
      activeElement: null,
      createElement: (tagName) => createNode(tagName),
      createTextNode: (text) => ({ nodeType: 3, textContent: String(text) }),
      querySelector: (selector) => selectorNodes.get(selector) || null,
      addEventListener() {},
    },
    homePanel,
  };
}
const domStub = createDomStub();
const homeTest = loadModeApp(
  ["renderHome", "state"],
  {
    document: domStub.document,
    localStorage: localStorageStub,
    KobunSetProgress: {
      summarize: (set, progress) => ({
        learnedCount: set.words.filter((word) => progress.units[word.id]?.learned).length,
        reviewCount: 0,
        bestScore: 0,
      }),
      aggregate: () => ({ totalSets: 1, clearedSets: 0, inProgressSets: 0, reviewSets: 0 }),
      summarizeBlocks: (set) => Array.from({ length: Math.ceil(set.words.length / 4) }, (_, index) => ({
        index,
        total: Math.min(4, set.words.length - index * 4),
        words: set.words.slice(index * 4, index * 4 + 4),
        key: "unlearned",
        label: "未着手",
        isCurrent: index === 0,
      })),
    },
    KobunSrs: { labels: ["1日後"], label: () => "1日後", isDue: () => false },
  },
);
const homeWords = Array.from({ length: 4 }, (_, index) => ({
  id: `kv03-${String(index + 1).padStart(3, "0")}`,
  headword: `語${index + 1}`,
  kanji: `語${index + 1}`,
  meanings: ["意味"],
}));
homeTest.state.set = { meta: { title: "検査セット", dataVersion: 1 }, words: homeWords };
homeTest.state.setId = "set-03";
homeTest.state.progress = { units: {}, finalCheck: {} };
homeTest.state.manifest = { sets: { "set-03": { label: "第3セット" } } };
homeTest.state.reviewPool = [];
homeTest.renderHome();
const firstHeroCount = domStub.homePanel.children.filter((node) => node.className.split(/\s+/).includes("hero")).length;
homeTest.state.progress.units = {};
homeTest.renderHome();
const secondHeroCount = domStub.homePanel.children.filter((node) => node.className.split(/\s+/).includes("hero")).length;
assert.equal(firstHeroCount, 1, "初回ホームにはヒーローを1つ表示する必要があります");
assert.equal(secondHeroCount, 0, "学習語数0でも再描画時にヒーローを再表示してはいけません");
console.log("vocabulary runtime contract: T4 home hero once OK");

// --- T2: 終了時 flush と既存RPC契約 ---
// 共通 cloud.js（正本: portal/shared/cloud.js）が pagehide / 非表示時の keepalive 送信を受け持つ。
assert.match(cloudSource, /function flush\(\{ keepalive = false \} = \{\}\)/, "flush APIが必要です");
assert.match(cloudSource, /addEventListener\("pagehide", \(\) => flush\(\{ keepalive: true \}\)\)/, "pagehideからkeepalive flushを呼ぶ必要があります");
assert.match(modeSource, /cloud = createCloud\(\{/, "共通 createCloud を使う必要があります");

const calls = [];
let failNextSave = false;
let saveRevision = 0;
const response = (value, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => value,
});
const fetchStub = async (url, init = {}) => {
  calls.push({ url, init });
  if (url === "static/config.json") return response({ supabaseUrl: "https://project.supabase.co", supabaseAnonKey: "anon-key" });
  if (url.endsWith("/app_auth_student")) return response([{ id: "student-1", display_name: "検査用生徒" }]);
  if (url.endsWith("/app_load_progress_v2")) return response({ progress: {}, revision: 0 });
  if (url.endsWith("/app_save_progress_dataset_v2")) {
    if (failNextSave) {
      failNextSave = false;
      return response({ error: "temporary" }, 503);
    }
    saveRevision += 1;
    return response({ ok: true, revision: saveRevision });
  }
  throw new Error(`unexpected fetch: ${url}`);
};

(async () => {
  const { create } = loadCloudApi(fetchStub);
  const statuses = [];
  const api = create({
    appId: "kobun-vocab-learning",
    getPatch: () => null,
    applyLoaded: () => {},
    onStatus: (message, tone) => statuses.push({ message, tone }),
  });
  await api.init();
  assert.equal(api.isEnabled(), true, "init後は生徒別同期が有効になる必要があります");

  api.queueSave({ datasetId: "set-01", progress: { units: { "kv01-001": { learned: true } } }, meta: { lastDatasetId: "set-01" } });
  await api.flush({ keepalive: true });
  const saveCalls = () => calls.filter(({ url }) => url.endsWith("/app_save_progress_dataset_v2"));
  assert.equal(saveCalls().length, 1, "flush直後に保存RPCを1回送信する必要があります");
  assert.equal(saveCalls()[0].init.keepalive, true, "終了時保存にはkeepaliveを指定する必要があります");
  const body = JSON.parse(saveCalls()[0].init.body);
  assert.equal(body.p_app, "kobun-vocab-learning");
  assert.equal(body.p_student_id, "student-1");
  assert.equal(body.p_access_token, "token-1");
  assert.equal(body.p_dataset_id, "set-01");
  assert.deepEqual(body.p_meta, { lastDatasetId: "set-01" });

  failNextSave = true;
  api.queueSave({ datasetId: "set-01", progress: { units: { "kv01-001": { learned: false } } }, meta: {} });
  await api.flush({ keepalive: true });
  const attemptsAfterFailure = saveCalls().length;
  await api.flush({ keepalive: true });
  assert.equal(saveCalls().length, attemptsAfterFailure + 1, "保存失敗時は今回のパッチを再送対象へ戻す必要があります");
  assert.ok(statuses.some(({ tone }) => tone === "ng"), "保存失敗時のエラー状態を維持する必要があります");
  console.log("cloud runtime contract: T2 pagehide flush OK");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

// --- 思い出して書く復習（recallReview） ---
{
  globalThis.FSRS = require("../static/vendor/fsrs/index.umd.js");
  const realSrs = require("../static/srs.js");
  const recallDom = createDomStub();
  const sessionPanel = recallDom.document.querySelector("#sessionPanel");
  const recallStorage = new Map();
  const recallTest = loadModeApp(
    ["startRecallReview", "chooseRecallConfidence", "answerRecall", "nextRecall", "restoreSession", "renderHome", "state", "getSession: () => session"],
    {
      document: recallDom.document,
      localStorage: {
        getItem: (key) => recallStorage.has(key) ? recallStorage.get(key) : null,
        setItem: (key, value) => recallStorage.set(key, String(value)),
      },
      KobunSrs: realSrs,
      KobunRecallGrade: require("../static/recall-grade.js"),
      KobunMeaningGuard: require("../static/meaning-guard.js"),
      KobunSetProgress: require("../static/set-progress.js"),
      Date,
    },
  );
  const recallSet = JSON.parse(read("data/set-01.json"));
  const recallWords = recallSet.words.slice(0, 2);
  recallTest.state.set = { meta: recallSet.meta, words: recallWords };
  recallTest.state.setId = "kobun-set-01";
  recallTest.state.manifest = { sets: { "kobun-set-01": { label: "第1セット" } } };
  recallTest.state.reviewPool = [];
  recallTest.state.progress = {
    units: Object.fromEntries(recallWords.map((word) => [word.id, { learned: true }])),
    finalCheck: {},
    items: {},
    history: [],
  };
  const texts = (node) => node.nodeType === 3 ? [node.textContent] : [node.textContent || "", ...(node.children || []).flatMap(texts)];
  const panelText = () => texts(sessionPanel).join("\n");

  recallTest.startRecallReview();
  let current = recallTest.getSession();
  assert.equal(current.mode, "recallReview", "補助ボタンの処理で recallReview が始まる");
  assert.equal(current.meaningOrder.length, 2, "期限の語だけを出題する");
  const firstKey = current.meaningOrder[0];
  const firstWord = recallWords.find((word) => `kobun-set-01::${word.id}` === firstKey) || recallWords.find((word) => word.id === firstKey);
  assert.ok(panelText().includes(firstWord.headword), "問う画面に見出し語を出す");
  assert.ok(!panelText().includes(firstWord.kanji), "問う画面に漢字表記を出さない");

  // 途中で一覧へ戻って再開しても、同じ問題の同じ段階から続く
  current.typed = "移動する";
  recallTest.chooseRecallConfidence("sure");
  assert.equal(recallTest.getSession().phase, "revealed", "確信度を選ぶと答え合わせへ進む");
  assert.ok(panelText().includes(firstWord.kanji), "答え合わせでは漢字表記を出す");
  assert.ok(panelText().includes("移動する"), "入力した答えを並べて出す");
  recallTest.renderHome();
  assert.equal(recallTest.state.progress.resume.mode, "recallReview", "途中保存される");
  recallTest.restoreSession();
  current = recallTest.getSession();
  assert.equal(current.phase, "revealed", "再開すると同じ段階から続く");
  assert.equal(current.meaningOrder[current.meaningIndex], firstKey, "再開すると同じ問題から続く");

  recallTest.answerRecall("correct");
  const firstItem = recallTest.state.progress.items[firstWord.id];
  assert.ok(firstItem.fsrs, "自信あり→合っていたで FSRS カードを作る");
  assert.equal(firstItem.nextReviewAt, firstItem.fsrs.due, "nextReviewAt を更新する");
  assert.equal(firstItem.recallCount, 1, "recallCount を数える");
  assert.equal(recallTest.getSession().recallRating, "good", "自信あり→合っていたは good");
  assert.equal(recallTest.state.progress.history.at(-1).kind, "recall", "履歴に recall を残す");

  recallTest.nextRecall();
  current = recallTest.getSession();
  assert.equal(current.phase, "ask", "次の問題は問う段階から");
  assert.equal(current.typed, "", "次の問題では入力を消す");
  const secondKey = current.meaningOrder[1];
  recallTest.chooseRecallConfidence("blank");
  current = recallTest.getSession();
  assert.equal(current.phase, "graded", "思い出せないは自己採点を飛ばす");
  assert.equal(current.recallRating, "again", "思い出せないは again");
  assert.deepEqual(Array.from(current.wrongMeaningIds), [secondKey], "思い出せない語は誤答確認へ回す");
  recallTest.nextRecall();
  assert.equal(recallTest.getSession().stage, "wrongReview", "again があれば誤答確認へ進む");
  console.log("vocabulary runtime contract: recall review OK");
}

// --- 思い出す復習の Jev 自動採点（fetch を差し替えて、採用・確信度不足・採点を直す・答えなしを見る） ---
(async () => {
  const aiDom = createDomStub();
  const aiStorage = new Map();
  const replies = [];
  const requests = [];
  const fakeFetch = async (url, init) => {
    requests.push({ url, body: JSON.parse(init.body) });
    const reply = replies.shift();
    return { ok: Boolean(reply), json: async () => reply };
  };
  const aiTest = loadModeApp(
    ["startRecallReview", "chooseRecallConfidence", "answerRecall", "nextRecall", "overrideAiGrade", "state", "getSession: () => session"],
    {
      document: aiDom.document,
      localStorage: {
        getItem: (key) => aiStorage.has(key) ? aiStorage.get(key) : null,
        setItem: (key, value) => aiStorage.set(key, String(value)),
      },
      fetch: fakeFetch,
      KobunSrs: require("../static/srs.js"),
      KobunRecallGrade: require("../static/recall-grade.js"),
      KobunMeaningGuard: require("../static/meaning-guard.js"),
      KobunSetProgress: require("../static/set-progress.js"),
      Date,
    },
  );
  const aiSet = JSON.parse(read("data/set-01.json"));
  const aiWords = aiSet.words.slice(0, 4);
  aiTest.state.set = { meta: aiSet.meta, words: aiWords };
  aiTest.state.setId = "kobun-set-01";
  aiTest.state.manifest = { sets: { "kobun-set-01": { label: "第1セット" } } };
  aiTest.state.reviewPool = [];
  aiTest.state.progress = {
    units: Object.fromEntries(aiWords.map((word) => [word.id, { learned: true }])),
    finalCheck: {},
    items: {},
    history: [],
  };
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  const currentWordId = () => {
    const s = aiTest.getSession();
    return String(s.meaningOrder[s.meaningIndex]).split("::").pop();
  };
  const lastHistory = () => aiTest.state.progress.history.at(-1);

  aiTest.startRecallReview();

  // 1. 確信度が高い → 自動採点。記録は「次へ」まで保留する。
  let wordId = currentWordId();
  aiTest.getSession().typed = "出歩く";
  replies.push({ grade: "correct", confidence: 0.95, probabilities: { correct: 0.95, partial: 0.05, wrong: 0 }, model: "jev-1.13.0" });
  aiTest.chooseRecallConfidence("sure");
  assert.equal(aiTest.getSession().aiPending, true, "書いた答えがあれば Jev に問い合わせる");
  assert.deepEqual(requests.at(-1).body, { wordId, answer: "出歩く" }, "送るのは語IDと答えだけ");
  await flush();
  let current = aiTest.getSession();
  assert.equal(current.phase, "graded", "確信度が高ければ自動採点で結果へ進む");
  assert.equal(current.aiAutoGrade, "correct");
  assert.equal(current.recallRating, "good");
  assert.equal(aiTest.state.progress.items[wordId], undefined, "自動採点は次へ進むまで記録しない");
  aiTest.nextRecall();
  assert.equal(aiTest.state.progress.items[wordId].recallCount, 1, "次へで記録する");
  assert.equal(lastHistory().gradedBy, "ai");
  assert.equal(lastHistory().aiGrade, "correct");

  // 2. 確信度が低い → 判定を参考表示して自己採点。
  wordId = currentWordId();
  aiTest.getSession().typed = "なにか";
  replies.push({ grade: "partial", confidence: 0.4, probabilities: { correct: 0.3, partial: 0.4, wrong: 0.3 }, model: "jev-1.13.0" });
  aiTest.chooseRecallConfidence("maybe");
  await flush();
  current = aiTest.getSession();
  assert.equal(current.phase, "revealed", "確信度が低ければ自己採点に戻す");
  assert.equal(current.ai.grade, "partial");
  aiTest.answerRecall("wrong");
  assert.equal(lastHistory().gradedBy, "self");
  assert.equal(lastHistory().aiGrade, "partial");
  assert.equal(lastHistory().result, "again");
  aiTest.nextRecall();

  // 3. 自動採点のあと「採点を直す」→ 自己採点で記録し、直したことを残す。
  wordId = currentWordId();
  aiTest.getSession().typed = "歩く";
  replies.push({ grade: "correct", confidence: 0.9, probabilities: { correct: 0.9, partial: 0.1, wrong: 0 }, model: "jev-1.13.0" });
  aiTest.chooseRecallConfidence("sure");
  await flush();
  aiTest.overrideAiGrade();
  current = aiTest.getSession();
  assert.equal(current.phase, "revealed", "採点を直すと自己採点へ戻る");
  assert.equal(aiTest.state.progress.items[wordId], undefined, "直す前の自動採点は記録されていない");
  aiTest.answerRecall("wrong");
  assert.equal(lastHistory().overridden, true);
  assert.equal(lastHistory().result, "again");
  assert.equal(aiTest.state.progress.history.filter((event) => event.wordId === wordId).length, 1, "記録は1回だけ");
  aiTest.nextRecall();

  // 4. 「わからない」は Jev に送らず、違った扱い。
  const before = requests.length;
  aiTest.getSession().typed = "わからない";
  aiTest.chooseRecallConfidence("maybe");
  current = aiTest.getSession();
  assert.equal(requests.length, before, "答えなしは Jev に送らない");
  assert.equal(current.aiAutoGrade, "wrong");
  assert.equal(current.recallRating, "again");
  aiTest.nextRecall();
  assert.equal(lastHistory().aiSource, "rule");

  // 5. 通信に失敗したら自己採点のまま。（全語を採点済みなので記録を空にして出題し直す）
  aiTest.state.progress.items = {};
  aiTest.startRecallReview();
  aiTest.getSession().typed = "移動する";
  aiTest.chooseRecallConfidence("sure");
  await flush();
  current = aiTest.getSession();
  assert.equal(current.phase, "revealed");
  assert.equal(current.aiFailed, true, "失敗は自己採点に戻す");
  console.log("vocabulary runtime contract: recall AI grading OK");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
