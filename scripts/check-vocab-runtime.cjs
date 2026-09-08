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
  vm.runInNewContext(`${cloudSource}\nglobalThis.__cloud = KobunCloud;`, sandbox);
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
assert.match(cloudSource, /async function rpc\(name, body, options = \{\}\)/, "RPCの追加オプション受け入れが必要です");
assert.match(cloudSource, /function flush\(\{ keepalive = false \} = \{\}\)/, "flush APIが必要です");
assert.match(cloudSource, /p_dataset_progress: item\.progress/, "進捗のRPC引数を維持する必要があります");
assert.match(cloudSource, /p_meta: item\.meta \|\| \{\}/, "メタデータのRPC引数を維持する必要があります");
assert.match(modeSource, /window\.addEventListener\("pagehide", \(\) => cloud\?\.flush\(\{ keepalive: true \}\)\)/, "pagehideからkeepalive flushを呼ぶ必要があります");

const calls = [];
let failNextSave = false;
const response = (value, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => value,
});
const fetchStub = async (url, init = {}) => {
  calls.push({ url, init });
  if (url === "static/config.json") return response({ supabaseUrl: "https://project.supabase.co", supabaseAnonKey: "anon-key" });
  if (url.endsWith("/app_auth_student")) return response([{ id: "student-1", display_name: "検査用生徒" }]);
  if (url.endsWith("/app_load_progress")) return response([{ progress: {} }]);
  if (url.endsWith("/app_save_progress_dataset")) {
    if (failNextSave) {
      failNextSave = false;
      return response({ error: "temporary" }, 503);
    }
    return response(null, 204);
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
  const saveCalls = () => calls.filter(({ url }) => url.endsWith("/app_save_progress_dataset"));
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
