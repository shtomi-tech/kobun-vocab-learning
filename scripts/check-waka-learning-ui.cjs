"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");

const read = (path) => fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const modeSource = read("static/mode-vocab.js");
const dailyKey = "kobun_waka_daily";

class TestNode {
  constructor(tagName, ownerDocument) {
    this.nodeType = 1;
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.attributes = {};
    this.style = {};
    this.listeners = new Map();
    this.parentNode = null;
    this._className = "";
    this._text = "";
    this._innerHTML = "";
    this.open = false;
  }

  get className() { return this._className; }
  set className(value) { this._className = String(value || ""); }

  get classList() {
    return {
      add: (...names) => {
        this._className = [...new Set(`${this._className} ${names.join(" ")}`.trim().split(/\s+/).filter(Boolean))].join(" ");
      },
      remove: (...names) => {
        this._className = this._className.split(/\s+/).filter((name) => name && !names.includes(name)).join(" ");
      },
      contains: (name) => this._className.split(/\s+/).includes(name),
      toggle: (name, force) => {
        const shouldAdd = force ?? !this.classList.contains(name);
        if (shouldAdd) this.classList.add(name);
        else this.classList.remove(name);
        return shouldAdd;
      },
    };
  }

  get textContent() {
    return this._text + this.children.map((child) => child.textContent || "").join("");
  }
  set textContent(value) {
    this._text = String(value ?? "");
    this.children = [];
  }

  get innerHTML() { return this._innerHTML; }
  set innerHTML(value) {
    this._innerHTML = String(value ?? "");
    this._text = "";
    this.children = [];
  }

  append(...children) {
    for (const child of children.flat(Infinity)) {
      if (!child) continue;
      child.parentNode = this;
      this.children.push(child);
    }
  }
  appendChild(child) { this.append(child); return child; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return Object.hasOwn(this.attributes, name) ? this.attributes[name] : null; }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }
  dispatch(type) {
    for (const listener of this.listeners.get(type) || []) {
      listener({ type, target: this, currentTarget: this, preventDefault() {} });
    }
  }
  click() { this.dispatch("click"); }
  focus() { this.ownerDocument.activeElement = this; }
  scrollIntoView() {}
  showModal() { this.open = true; }
  close() { this.open = false; this.dispatch("close"); }

  querySelectorAll(selector) {
    const selectors = selector.split(",").map((part) => part.trim());
    const matches = (node, part) => {
      if (part.startsWith(".")) return node.classList.contains(part.slice(1));
      if (part.startsWith("#")) return node.getAttribute("id") === part.slice(1);
      return node.tagName.toLowerCase() === part.toLowerCase();
    };
    const found = [];
    const visit = (node) => {
      for (const child of node.children) {
        if (child.nodeType === 1) {
          if (selectors.some((part) => matches(child, part))) found.push(child);
          visit(child);
        }
      }
    };
    visit(this);
    return found;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

const documentStub = {
  activeElement: null,
  createElement(tagName) { return new TestNode(tagName, this); },
  createTextNode(text) { return { nodeType: 3, textContent: String(text), parentNode: null }; },
  querySelector() { return null; },
  addEventListener() {},
};
const stored = new Map();
const storageWrites = [];
global.document = documentStub;
global.localStorage = {
  getItem(key) { return stored.get(key) ?? null; },
  setItem(key, value) {
    stored.set(key, String(value));
    storageWrites.push([key, String(value)]);
  },
};
global.window = { addEventListener() {}, removeEventListener() {} };
global.KobunExampleParts = require("../static/example-parts.js");
const gallery = require("../static/waka-gallery.js");

const poem = {
  key: "試験用の和歌本文",
  phrases: ["春の", "野辺に", "風ぞ", "吹く", "花の香"],
  reading: ["はるの", "のべに", "かぜぞ", "ふく", "はなのか"],
  author: "試験作者",
  collection: "試験歌集",
  refText: "巻一",
  translation: "春の野に風が吹き、花の香りがする。",
  targets: [],
};
const quiz = [
  {
    target: { ku: 2, text: "風ぞ" },
    question: "第一問の確認です。",
    choices: ["第一問の誤答", "第一問の正答", "別の誤答", "もう一つの誤答"],
    answer: 1,
    explain: "第一問の短い解説です。",
    rules: ["rule-a"],
  },
  {
    target: { ku: 4, text: "花の香" },
    question: "第二問の確認です。",
    choices: ["第二問の誤答", "別の誤答", "第二問の正答", "もう一つの誤答"],
    answer: 2,
    explain: "第二問の短い解説です。",
    rules: ["rule-a"],
  },
];
const grammar = {
  byKey: new Map([[poem.key, { quiz, tokens: [], notes: [] }]]),
  rules: { "rule-a": "試験用の文法根拠" },
  guides: {
    "rule-a": {
      point: "試験用の解説の要約。",
      reason: "試験用の理由。",
      recap: "試験用のまとめ。",
      table: [["見出し", "本文"]],
      steps: ["手順一"],
      examples: [{ text: "例文", note: "訳" }],
    },
  },
};

function createPanel() {
  const wrap = documentStub.createElement("div");
  const panel = documentStub.createElement("main");
  panel.closest = (selector) => selector === ".wrap" ? wrap : null;
  return { panel, wrap };
}

function button(root, selector, text) {
  const result = root.querySelectorAll(selector).find((node) => node.textContent.includes(text));
  assert.ok(result, `ボタンが見つかりません: ${text}`);
  return result;
}

function click(root, selector, text) {
  const target = button(root, selector, text);
  target.click();
  return target;
}

function seedDaily(value) {
  stored.set(dailyKey, JSON.stringify(value));
}

function todayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// モード間のFocus状態と、一首学習から詳細へ戻るフォーカス経路を保つ。
assert.match(modeSource, /function renderHome\(\) \{\s*session = null;\s*\$\("\.wrap"\)\?\.classList\.remove\("wakaFocus"\);/);
assert.match(modeSource, /function renderSession\(\) \{\s*saveResume\(\);\s*\$\("\.wrap"\)\?\.classList\.remove\("wakaFocus"\);/);
assert.match(modeSource, /onClose: \(\) => openWakaGallery\(key, true\),/);
assert.match(modeSource, /if \(focusGrammar\) panel\.querySelector\("\.wgPoemGrammarStart"\)\?\.focus\(\{ preventScroll: true \}\)/);

// ホームCTAは未着手・途中・完了で始める／続ける／結果を見るに切り替わる。
stored.delete(dailyKey);
assert.match(button(gallery.teaserCard([poem], { onOpen() {}, onDaily() {} }), ".wgButton--gold", "始める").textContent, /今日の10首を始める/);
const now = new Date();
const currentDate = todayKey(now);
seedDaily({ date: currentDate, keys: [poem.key], total: 2, picked: [0] });
assert.match(button(gallery.teaserCard([poem], { onOpen() {}, onDaily() {} }), ".wgButton--gold", "続ける").textContent, /今日の10首を続ける/);
seedDaily({ date: currentDate, keys: [poem.key], total: 2, picked: [0, 2] });
assert.match(button(gallery.teaserCard([poem], { onOpen() {}, onDaily() {} }), ".wgButton--gold", "結果を見る").textContent, /今日の結果を見る/);

// Dailyの途中回答は1問につき1回だけ保存し、誤答の解き直しは保存形式を変えない。
stored.delete(dailyKey);
storageWrites.length = 0;
const { panel: dailyPanel } = createPanel();
const date = new Date(2026, 8, 30, 12);
gallery.renderDaily(dailyPanel, [poem], { grammar, onClose() {}, onOpenPoem() {}, date });
assert.equal(storageWrites.length, 1, "Daily開始時に既存形式のデータが1回保存される");
const writesBeforeAnswer = storageWrites.length;
click(dailyPanel, ".wgChoice", "第一問の誤答");
assert.equal(storageWrites.length, writesBeforeAnswer + 1, "通常解答1問につき1回だけ保存される");
assert.deepEqual(JSON.parse(stored.get(dailyKey)).picked, [0]);
assert.match(dailyPanel.querySelector(".wgQuizFeedback").textContent, /× 不正解/);
// 文法事項は折りたたまず、解説を開くボタンとして答えの直後に見せる。
const dailyFeedback = dailyPanel.querySelector(".wgQuizFeedback");
assert.equal(dailyFeedback.querySelector("details"), null, "文法の根拠を折りたたまない");
click(dailyFeedback, ".wgRuleLink", "試験用の文法根拠");
const quizGuide = dailyPanel.querySelector(".wgGuideDialog");
assert.equal(quizGuide.open, true, "根拠のボタンで解説を開く");
assert.match(quizGuide.textContent, /試験用の解説の要約/);
// 解説は PREP法の順（要点→理由→例→まとめ）に並ぶ。
assert.deepEqual(quizGuide.querySelectorAll(".wgPrepHead").map((node) => node.textContent), ["P要点", "R理由", "E例", "Pまとめ"]);
assert.match(quizGuide.textContent, /試験用の理由[\s\S]*例文[\s\S]*試験用のまとめ/);
quizGuide.close();
assert.equal(dailyPanel.querySelector(".wgTranslation"), null, "現代語訳は歌の最後の問題まで出さない");
click(dailyPanel, ".wgButton", "次の問題");
click(dailyPanel, ".wgChoice", "第二問の正答");
assert.ok(dailyPanel.querySelector(".wgTranslation"), "歌の最後の問題の解答後に現代語訳を出す");
click(dailyPanel, ".wgButton", "結果を見る");
assert.equal(dailyPanel.querySelector(".wgQuizDone").textContent, "2問中 1問 正解");
assert.ok(dailyPanel.querySelector(".wdResultDetails"), "Daily結果では歌ごとの内訳を折りたたむ");
assert.equal(dailyPanel.querySelector(".wdResultDetails").open, false);
const dailyBeforeRetry = stored.get(dailyKey);
const writesBeforeRetry = storageWrites.length;
click(dailyPanel, ".wgButton", "間違えた1問を解き直す");
click(dailyPanel, ".wgChoice", "第一問の正答");
click(dailyPanel, ".wgButton", "結果を見る");
assert.match(dailyPanel.querySelector(".wdRetryScore").textContent, /1問中 1問 正解/);
assert.equal(stored.get(dailyKey), dailyBeforeRetry, "誤答の解き直しでDaily保存データを変更しない");
assert.equal(storageWrites.length, writesBeforeRetry, "誤答の解き直しではDaily保存を呼ばない");

// picked が問題数以上ある既存データからは、問題画面でなく結果画面を再開する。
seedDaily({ date: todayKey(date), keys: [poem.key], total: 2, picked: [1, 2, 0] });
storageWrites.length = 0;
const { panel: resumedPanel } = createPanel();
gallery.renderDaily(resumedPanel, [poem], { grammar, onClose() {}, onOpenPoem() {}, date });
assert.equal(resumedPanel.querySelector(".wgQuizDone").textContent, "2問中 2問 正解");
assert.equal(resumedPanel.querySelector(".wgChoice"), null);
assert.equal(storageWrites.length, 0, "完了状態の再開時にDailyデータを再保存しない");
assert.equal(button(resumedPanel, ".wgButton", "ホームへ戻る").textContent, "ホームへ戻る");

// 単一和歌はDaily保存に触れず、結果の歌別内訳も表示しない。
const sentinel = stored.get(dailyKey);
storageWrites.length = 0;
const { panel: poemPanel } = createPanel();
let homeCalled = false;
gallery.renderPoemLesson(poemPanel, poem, { grammar, onClose() {}, onHome() { homeCalled = true; } });
click(poemPanel, ".wgChoice", "第一問の正答");
click(poemPanel, ".wgButton", "次の問題");
click(poemPanel, ".wgChoice", "第二問の正答");
click(poemPanel, ".wgButton", "結果を見る");
assert.equal(poemPanel.querySelector(".wgQuizDone").textContent, "2問中 2問 正解");
assert.equal(poemPanel.querySelector(".wdResultDetails"), null, "一首結果には歌別内訳を出さない");
assert.equal(
  poemPanel.querySelectorAll(".wgButton").some((node) => node.textContent.includes("間違えた")),
  false,
  "全問正解では誤答復習CTAを出さない",
);
assert.equal(stored.get(dailyKey), sentinel, "一首学習でDaily保存データを変更しない");
assert.equal(storageWrites.length, 0, "一首学習ではDaily保存を呼ばない");
click(poemPanel, ".wgButton", "ホームへ戻る");
assert.equal(homeCalled, true, "一首結果からホームのcallbackを呼べる");

// 一首学習の戻る操作は元の歌詳細へ戻り、文法CTAへフォーカスを置く。
const { panel: returnPanel, wrap } = createPanel();
let returnedToGallery = false;
gallery.renderPoemLesson(returnPanel, poem, {
  grammar,
  onClose() {
    returnedToGallery = true;
    gallery.render(returnPanel, [poem], { grammar, initialKey: poem.key, onClose() {}, onLearnPoem() {} });
    returnPanel.querySelector(".wgPoemGrammarStart")?.focus({ preventScroll: true });
  },
  onHome() {},
});
assert.equal(wrap.classList.contains("wakaFocus"), true);
click(returnPanel, ".wgBack", "歌の間へ戻る");
assert.equal(returnedToGallery, true);
assert.equal(wrap.classList.contains("wakaFocus"), false, "ギャラリー復帰後にFocus表示を解除する");
const grammarCta = returnPanel.querySelector(".wgPoemGrammarStart");
assert.ok(grammarCta, "元の歌詳細に文法CTAを戻す");
assert.equal(documentStub.activeElement, grammarCta, "歌詳細へ戻った後、文法CTAへフォーカスを戻す");

// 文法解説の側だけに本文を持つ歌（百人一首）は、例文の歌の後ろに足し、例文と重なる歌は足さない。
const standalone = {
  key: "春すぎて夏きにけらししろたへのころもほすてふ天のかぐ山",
  author: "持統天皇",
  waka: {
    phrases: ["春すぎて", "夏きにけらし", "しろたへの", "ころもほすてふ", "天のかぐ山"],
    reading: ["はるすぎて", "なつきにけらし", "しろたへの", "ころもほすてふ", "あまのかぐやま"],
    translation: "春が過ぎて夏が来たらしい。",
    ref: { collection: "百人一首", number: 2, origin: "新古今和歌集・夏" },
  },
  quiz,
};
const mixedGrammar = { rules: grammar.rules, guides: grammar.guides, byKey: new Map([[poem.key, { key: poem.key, quiz }], [standalone.key, standalone]]) };
const merged = gallery.withGrammarPoems([poem], mixedGrammar);
assert.deepEqual(merged.map((item) => item.key), [poem.key, standalone.key], "単独の歌を例文の歌の後ろに足す");
assert.equal(merged[1].collection, "百人一首");
assert.equal(merged[1].refText, "2番（原典：新古今和歌集・夏）");
assert.deepEqual(merged[1].targets, [], "単独の歌は学ぶ語を持たない");
assert.equal(gallery.withGrammarPoems([poem], null).length, 1, "文法解説が読めなければ例文の歌だけ");
const { panel: mixedPanel } = createPanel();
gallery.render(mixedPanel, merged, { grammar: mixedGrammar, initialKey: standalone.key, onClose() {}, onLearnPoem() {} });
const standaloneDetail = mixedPanel.querySelector(".wgDialog");
assert.equal(standaloneDetail.querySelectorAll("h4").some((node) => node.textContent === "この歌で学ぶ語"), false, "単独の歌の詳細に学ぶ語の見出しを出さない");
assert.ok(standaloneDetail.querySelector(".wgPoemGrammarStart"), "単独の歌からも文法学習へ進める");

// 歌の詳細から、その歌に出る文法の解説を開ける。
assert.ok(button(standaloneDetail, ".wgRuleLink", "試験用の文法根拠"), "歌の詳細に文法の解説ボタンを出す");

// ホームの「和歌」の面に文法の解説の入口を置き、一覧から解説と歌の問題へ進める。
stored.delete(dailyKey);
assert.ok(button(gallery.teaserCard([poem], { onOpen() {}, onDaily() {}, onGuides() {} }), ".wgButton", "解説の一覧を開く"));
assert.equal(gallery.teaserCard([poem], { onOpen() {}, onDaily() {} }).textContent.includes("解説の一覧を開く"), false, "onGuides が無ければ入口を出さない");
const { panel: guidePanel } = createPanel();
let learnedKey = null;
gallery.renderGuides(guidePanel, mixedGrammar, {
  poems: merged,
  onClose() {},
  onLearnPoem(key) { learnedKey = key; },
});
click(guidePanel, ".wgGuideItem", "試験用の文法根拠");
const indexGuide = guidePanel.querySelector(".wgGuideDialog");
assert.equal(indexGuide.open, true, "一覧の項目で解説を開く");
assert.match(indexGuide.textContent, /試験作者/, "例文の歌の作者を歌の間の情報から引く");
click(indexGuide, ".wgGuideUse", "この歌で解く");
assert.equal(indexGuide.open, false);
assert.equal(learnedKey, poem.key, "解説の歌からその歌の問題へ進む");

console.log("waka learning UI regression: daily resume/answer/retry, single-poem result/return, focus reset, standalone poems, grammar guides OK");
