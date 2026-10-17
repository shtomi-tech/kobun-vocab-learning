"use strict";

// 和歌で文法：文法事項（根拠カード ID）ごとの習熟度と、全項目の習熟を目指す出題の組み立て。
// 画面は持たない。waka-gallery.js が答えを record() で渡し、buildSession() で次の問題を受け取る。
//
// 習熟の段階（level）
//   0 = まだ正解していない／学習中に間違えた
//   1〜2 = 学習中、3以上 = 習熟（MASTER_LEVEL）、上限 MAX_LEVEL
// 期限が来ている（または一度も正解していない）項目に正解すると1段上がり、次の期限は INTERVAL_DAYS だけ先になる。
// 期限前の正解では段階を上げない（同じ日に詰めて解いても習熟にはならない）。最短でも1日目・2日目・5日目の3回で習熟。
// 間違えると、習熟済みなら1段、学習中なら0段へ戻り、その日のうちに再び出題対象になる。
// 1問に複数の文法事項が付いているときは、正解なら全部に、誤答なら先頭（その問題の主眼）だけに反映する。
//
// 保存は端末ごと（localStorage）。学習進捗の端末間同期の対象外で、今日の10首と同じ扱い。
const KobunGrammarMastery = (() => {
  const STORE_KEY = "kobun_waka_mastery";
  const SESSION_KEY = "kobun_waka_mastery_session";
  const MASTER_LEVEL = 3;
  const MAX_LEVEL = 5;
  // その段階に上がったあと、次に出題するまでの日数。
  const INTERVAL_DAYS = [0, 1, 3, 7, 14, 30];
  const SESSION_SIZE = 10;
  // 1回の練習に入れる新しい項目の数。復習が多い日でも最低 NEW_MIN、少ない日は NEW_MAX まで。
  const NEW_MIN = 2;
  const NEW_MAX = 5;

  const dayNumber = (date = new Date()) => Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
  const itemId = (poemKey, q) => `${poemKey}#${q}`;
  const hashKey = (text) => {
    let h = 2166136261;
    for (const ch of text) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0;
    return h;
  };

  const storage = () => {
    try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; }
  };
  const readJson = (key) => {
    try { return JSON.parse(storage()?.getItem(key) || "null"); } catch { return null; }
  };
  const writeJson = (key, value) => {
    try { storage()?.setItem(key, JSON.stringify(value)); } catch { /* 保存できなくても解答は続ける */ }
  };

  // 保存形：{ v: 1, total, rules: { [rule]: { level, due, seen, correct, wrong, last } }, asked: { [itemId]: 日番号 } }
  function load() {
    const saved = readJson(STORE_KEY);
    if (!saved || saved.v !== 1 || typeof saved.rules !== "object") return { v: 1, total: 0, rules: {}, asked: {} };
    return { v: 1, total: Number(saved.total) || 0, rules: saved.rules || {}, asked: saved.asked || {} };
  }
  const save = (state) => writeJson(STORE_KEY, state);

  const ruleState = (state, rule) => state.rules[rule] || { level: 0, due: 0, seen: 0, correct: 0, wrong: 0, last: null };
  const isMastered = (entry) => (entry?.level || 0) >= MASTER_LEVEL;
  const isDue = (entry, today) => Boolean(entry?.seen) && (entry.due ?? 0) <= today;

  // 表示用の状態。new = 未学習、learning = 学習中、mastered = 習熟、review = 習熟済みで復習の期限が来ている。
  function status(entry, today = dayNumber()) {
    if (!entry?.seen) return "new";
    if (isMastered(entry)) return isDue(entry, today) ? "review" : "mastered";
    return "learning";
  }

  // 1問の解答を記録する。返り値は文法事項ごとの { rule, before, after } の一覧（段階が変わらなくても入る）。
  function record(rules, ok, { poemKey = null, q = null, date = new Date(), state = load() } = {}) {
    const today = dayNumber(date);
    const list = [...new Set(rules || [])];
    const changes = list.map((rule, index) => {
      const before = ruleState(state, rule);
      const after = { ...before, seen: before.seen + 1, last: today };
      if (ok) {
        after.correct = before.correct + 1;
        if (!before.seen || before.level === 0 || before.due <= today) {
          after.level = Math.min(MAX_LEVEL, before.level + 1);
          after.due = today + INTERVAL_DAYS[after.level];
        }
      } else if (index === 0) {
        after.wrong = before.wrong + 1;
        after.level = before.level >= MASTER_LEVEL ? 1 : 0;
        after.due = today;
      }
      state.rules[rule] = after;
      return { rule, before: before.level, after: after.level };
    });
    if (poemKey != null && q != null) state.asked[itemId(poemKey, q)] = today;
    save(state);
    return changes;
  }

  // grammar（{ rules, byKey }）から、出題のある文法事項と、その問題の一覧を作る。
  function catalog(grammar) {
    const items = [];
    for (const [poemKey, entry] of grammar?.byKey || []) {
      (entry.quiz || []).forEach((item, q) => {
        if (item.rules?.length) items.push({ id: itemId(poemKey, q), poemKey, q, item });
      });
    }
    const byRule = new Map();
    for (const entry of items) {
      entry.item.rules.forEach((rule, index) => {
        if (!byRule.has(rule)) byRule.set(rule, { primary: [], secondary: [] });
        byRule.get(rule)[index === 0 ? "primary" : "secondary"].push(entry);
      });
    }
    // 出題のある項目だけが習熟の対象。並びは grammar.rules の順。
    const order = Object.keys(grammar?.rules || {});
    const rules = [...byRule.keys()].sort((a, b) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || (a < b ? -1 : 1);
    });
    return { items, byRule, rules };
  }

  // 全体の進み。grammar が無いときは保存だけから数える（ホームの入口用）。
  function summary(grammar = null, { date = new Date(), state = load() } = {}) {
    const today = dayNumber(date);
    const rules = grammar ? catalog(grammar).rules : Object.keys(state.rules);
    const total = grammar ? rules.length : state.total;
    let mastered = 0;
    let learning = 0;
    let due = 0;
    for (const rule of rules) {
      const entry = state.rules[rule];
      if (!entry?.seen) continue;
      if (isMastered(entry)) mastered++;
      else learning++;
      if (isDue(entry, today)) due++;
    }
    const fresh = Math.max(0, total - mastered - learning);
    return { total, mastered, learning, fresh, due, started: mastered + learning > 0 };
  }

  // 次の練習の問題を選ぶ。返り値は catalog の items と同じ形の一覧（同じ歌の問題は隣に並べる）。
  // 優先順：①期限の来た項目（段階の低い順・期限の古い順）②新しい項目（出題数の多い＝よく出る順）
  //         ③学習中で期限前の項目 ④残りの新しい項目 ⑤習熟済みで期限前の項目（期限の近い順）。
  // 1項目につき1問。問題は、その項目が主眼のものから、最後に解いてから日が経っているものを選ぶ。
  function buildSession(grammar, { date = new Date(), size = SESSION_SIZE, state = load() } = {}) {
    const today = dayNumber(date);
    const { byRule, rules } = catalog(grammar);
    if (state.total !== rules.length) {
      state.total = rules.length;
      save(state);
    }
    const info = (rule) => ruleState(state, rule);
    const volume = (rule) => byRule.get(rule).primary.length + byRule.get(rule).secondary.length;
    const due = rules.filter((rule) => isDue(info(rule), today))
      .sort((a, b) => info(a).level - info(b).level || info(a).due - info(b).due);
    const fresh = rules.filter((rule) => !info(rule).seen)
      .sort((a, b) => volume(b) - volume(a) || rules.indexOf(a) - rules.indexOf(b));
    const learning = rules.filter((rule) => info(rule).seen && !isDue(info(rule), today) && !isMastered(info(rule)))
      .sort((a, b) => info(a).level - info(b).level || info(a).due - info(b).due);
    const mastered = rules.filter((rule) => !isDue(info(rule), today) && isMastered(info(rule)))
      .sort((a, b) => info(a).due - info(b).due);

    const newSlots = Math.min(fresh.length, Math.max(NEW_MIN, Math.min(NEW_MAX, size - due.length)));
    const queue = [
      ...due.slice(0, size - Math.min(newSlots, NEW_MIN)),
      ...fresh.slice(0, newSlots),
      ...learning,
      ...fresh.slice(newSlots),
      ...mastered,
    ];

    const picked = [];
    const used = new Set();
    const lastAsked = (entry) => state.asked[entry.id] ?? -Infinity;
    for (const rule of queue) {
      if (picked.length >= size) break;
      if (picked.some((entry) => entry.rule === rule)) continue;
      const { primary, secondary } = byRule.get(rule);
      const pool = (primary.length ? primary : secondary).filter((entry) => !used.has(entry.id));
      const fallback = secondary.filter((entry) => !used.has(entry.id));
      const options = pool.length ? pool : fallback;
      if (!options.length) continue;
      const choice = [...options].sort((a, b) => lastAsked(a) - lastAsked(b)
        || hashKey(`${today}:${a.id}`) - hashKey(`${today}:${b.id}`))[0];
      used.add(choice.id);
      picked.push({ ...choice, rule });
    }

    // 同じ歌の問題は続けて解けるよう、最初に出てきた位置へまとめる。
    const poemOrder = [];
    for (const entry of picked) if (!poemOrder.includes(entry.poemKey)) poemOrder.push(entry.poemKey);
    return poemOrder.flatMap((key) => picked.filter((entry) => entry.poemKey === key).sort((a, b) => a.q - b.q));
  }

  // 練習の途中経過。保存形：{ date: 日番号, ids: [itemId], picked: [選んだ選択肢の番号] }。
  const readSession = () => readJson(SESSION_KEY);
  const writeSession = (value) => writeJson(SESSION_KEY, value);

  return {
    STORE_KEY,
    SESSION_KEY,
    MASTER_LEVEL,
    MAX_LEVEL,
    INTERVAL_DAYS,
    SESSION_SIZE,
    dayNumber,
    itemId,
    load,
    status,
    record,
    catalog,
    summary,
    buildSession,
    readSession,
    writeSession,
  };
})();

if (typeof module !== "undefined") module.exports = KobunGrammarMastery;
