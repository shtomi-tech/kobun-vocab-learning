"use strict";

/* 意味復習の間隔算出。FSRS-6（static/vendor/fsrs の ts-fsrs UMD, グローバル名 FSRS）で
   語ごとの安定性・難易度から次回を決める。固定はしご [1,3,7,14] は、ライブラリが
   読み込めなかったときのフォールバックとしてのみ残す。
   公開API（normalize / record / isDue / label / labels）は変えていない。 */
const KobunSrs = (() => {
  const intervals = [1, 3, 7, 14]; // フォールバック専用
  const DAY_MS = 86400000;

  // FSRSは連続値の間隔を返すため、内訳は「days以下」のバケットで数える。
  // 「以下」にしないと、移行直後の記録（ちょうど14日など）が1つ上のバケットへ落ちる。
  const buckets = [
    { days: 3, label: "3日以内" },
    { days: 7, label: "1週間" },
    { days: 14, label: "2週間" },
    { days: 30, label: "1か月" },
    { days: 90, label: "3か月" },
    { days: Infinity, label: "半年以上" },
  ];
  const labels = ["未実施", "要再確認", ...buckets.map((bucket) => bucket.label)];

  const params = {
    request_retention: 0.9,  // 目標保持率
    maximum_interval: 180,   // 入試までという用途に合わせて短縮（既定36500日は使わない）
    enable_short_term: true, // 1m/10m の当日ステップを使う
    enable_fuzz: true,       // 同じ日に大量の語が固まるのを防ぐ（乱数を含む）
  };
  // Easy(4) は自己申告UIが無く根拠を作れないため使わない。
  const ratings = { again: 1, hard: 2, good: 3 };

  /* 解答時間の判定。閾値はこの4つだけ。初期値は実データを見て調整する前提。
     8秒未満は常に速い・20秒以上は常に遅い・その間はその回の中央値の1.6倍を境に見る。 */
  const RT_HARD_FLOOR_MS = 8000;
  const RT_HARD_CEIL_MS = 20000;
  const RT_HARD_RATIO = 1.6;
  const RT_OUTLIER_MS = 60000; // これを超えた計測は「測れていない」として捨てる

  function rtGrade(ms, median) {
    if (!Number.isFinite(ms)) return "good"; // 測れなかった回は不利にしない
    if (ms >= RT_OUTLIER_MS) return "good";  // 中断・再開で伸びた計測を罰しない
    if (ms >= RT_HARD_CEIL_MS) return "hard";
    if (ms < RT_HARD_FLOOR_MS) return "good";
    const baseline = Number.isFinite(median) ? median : RT_HARD_FLOOR_MS;
    return ms > RT_HARD_RATIO * baseline ? "hard" : "good";
  }

  // その回の中央値。標本が少ないうちは絶対床（8秒）を基準にする。
  function medianMs(values) {
    const valid = (Array.isArray(values) ? values : [])
      .filter((value) => Number.isFinite(value) && value >= 0 && value < RT_OUTLIER_MS)
      .sort((a, b) => a - b);
    if (valid.length < 5) return RT_HARD_FLOOR_MS;
    const middle = Math.floor(valid.length / 2);
    return valid.length % 2 ? valid[middle] : (valid[middle - 1] + valid[middle]) / 2;
  }

  function nextAverageMs(previousMs, ms) {
    return Number.isFinite(previousMs) ? Math.round(previousMs * 0.7 + ms * 0.3) : ms;
  }
  // 計測値として採用できるか（中断・再開で伸びた値を混ぜない）
  function measuredMs(ms) {
    return Number.isFinite(ms) && ms >= 0 && ms < RT_OUTLIER_MS ? ms : null;
  }

  let scheduler = null;
  function lib() {
    return (typeof globalThis !== "undefined" && globalThis.FSRS) || null;
  }
  function fsrs() {
    const loaded = lib();
    if (!loaded) return null;
    if (!scheduler) scheduler = loaded.fsrs(params);
    return scheduler;
  }

  function normalize(value = {}) {
    const source = value || {};
    return {
      wrongCount: Number.isFinite(source.wrongCount) ? source.wrongCount : 0,
      stage: Number.isInteger(source.stage) ? Math.max(0, Math.min(source.stage, intervals.length - 1)) : 0,
      lastAnsweredAt: typeof source.lastAnsweredAt === "string" ? source.lastAnsweredAt : null,
      nextReviewAt: typeof source.nextReviewAt === "string" ? source.nextReviewAt : null,
      // 解答時間。正解したときだけ更新する（誤答は wrongCount と即時再出題で重みが付く）。
      lastMs: Number.isFinite(source.lastMs) ? source.lastMs : null,
      avgMs: Number.isFinite(source.avgMs) ? source.avgMs : null,
      fsrs: source.fsrs && typeof source.fsrs === "object" ? source.fsrs : null,
    };
  }

  function toDate(value, fallback) {
    const time = value ? new Date(value).getTime() : NaN;
    return Number.isFinite(time) ? new Date(time) : fallback;
  }
  function toNumber(value, fallback) {
    return Number.isFinite(Number(value)) ? Number(value) : fallback;
  }
  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  /* 保存形式 → ts-fsrs の Card。
     fsrs が無い記録（旧はしごの進捗）は、直前の間隔（nextReviewAt - lastAnsweredAt）を
     その語の安定性とみなして移行する。stage表より実データに近い。 */
  function toCard(state, now) {
    const loaded = lib();
    if (!loaded) return null;
    const empty = loaded.createEmptyCard(now);
    if (state.fsrs) {
      return {
        ...empty,
        due: toDate(state.fsrs.due, empty.due),
        stability: toNumber(state.fsrs.stability, empty.stability),
        difficulty: toNumber(state.fsrs.difficulty, empty.difficulty),
        elapsed_days: toNumber(state.fsrs.elapsed_days, empty.elapsed_days),
        scheduled_days: toNumber(state.fsrs.scheduled_days, empty.scheduled_days),
        reps: toNumber(state.fsrs.reps, empty.reps),
        lapses: toNumber(state.fsrs.lapses, empty.lapses),
        // 当日ステップの段数。落とすと Learning から抜けられなくなる。
        learning_steps: toNumber(state.fsrs.learning_steps, empty.learning_steps),
        state: toNumber(state.fsrs.state, empty.state),
        last_review: state.fsrs.last_review ? toDate(state.fsrs.last_review, undefined) : undefined,
      };
    }
    if (!state.lastAnsweredAt || !state.nextReviewAt) return empty; // 未実施・誤答直後は New から
    const prevDays = (new Date(state.nextReviewAt).getTime() - new Date(state.lastAnsweredAt).getTime()) / DAY_MS;
    if (!Number.isFinite(prevDays) || prevDays < 1) return empty;
    return {
      ...empty,
      due: toDate(state.nextReviewAt, empty.due),
      stability: clamp(Math.round(prevDays), 1, params.maximum_interval),
      difficulty: clamp(5 + state.wrongCount, 1, 10), // 誤答が多い語ほど難しいと見なす
      elapsed_days: 0,
      scheduled_days: clamp(Math.round(prevDays), 1, params.maximum_interval),
      reps: state.stage + 1, // 実際の回数は不明。表示・診断用
      lapses: state.wrongCount,
      learning_steps: 0,
      state: 2, // Review
      last_review: toDate(state.lastAnsweredAt, undefined),
    };
  }

  // ts-fsrs の Card → 保存形式（Dateを残さない）
  function fromCard(card) {
    return {
      due: new Date(card.due).toISOString(),
      stability: card.stability,
      difficulty: card.difficulty,
      elapsed_days: card.elapsed_days,
      scheduled_days: card.scheduled_days,
      reps: card.reps,
      lapses: card.lapses,
      learning_steps: card.learning_steps,
      state: card.state,
      last_review: card.last_review ? new Date(card.last_review).toISOString() : null,
    };
  }

  /* options.elapsedMs: その問題の解答時間（ms）。options.medianMs: その回の中央値。
     速い正解は Good、遅い正解は Hard、誤答は Again として FSRS へ渡す。 */
  function record(value, correct, now = new Date(), options = {}) {
    const state = normalize(value);
    const scheduled = fsrs();
    // カードは「前回の解答時刻」を持つ必要があるため、lastAnsweredAt を更新する前に作る。
    const card = scheduled ? toCard(state, now) : null;
    const ms = measuredMs(options.elapsedMs);
    const grade = correct ? rtGrade(ms, options.medianMs) : "good";
    state.lastAnsweredAt = now.toISOString();
    if (!correct) state.wrongCount++;
    if (correct && ms !== null) {
      state.lastMs = ms;
      state.avgMs = nextAverageMs(state.avgMs, ms);
    }
    if (scheduled && card) {
      const rating = correct ? (grade === "hard" ? ratings.hard : ratings.good) : ratings.again;
      const next = scheduled.next(card, now, rating).card;
      state.fsrs = fromCard(next);
      // nextReviewAt は due の写し。期限判定・内訳・クラウド同期はこの値だけを見る。
      state.nextReviewAt = state.fsrs.due;
      // stage はロールバック用に凍結する（FSRS経路では進めない）。
      return state;
    }
    // 以下はFSRS未読込時のみ。旧はしごで動かし、学習を止めない。
    if (!correct) {
      state.stage = 0;
      state.nextReviewAt = null;
      return state;
    }
    const days = intervals[state.stage];
    const next = new Date(now);
    next.setDate(next.getDate() + days);
    state.nextReviewAt = next.toISOString();
    // 遅い正解は段を進めず、同じ間隔でもう一度出す。
    if (grade !== "hard") state.stage = Math.min(state.stage + 1, intervals.length - 1);
    return state;
  }

  function isDue(value, now = Date.now()) {
    const state = normalize(value);
    return !state.lastAnsweredAt || !state.nextReviewAt || new Date(state.nextReviewAt).getTime() <= now;
  }

  function label(value) {
    const state = normalize(value);
    if (!state.lastAnsweredAt) return labels[0];
    if (!state.nextReviewAt) return labels[1];
    const days = (new Date(state.nextReviewAt) - new Date(state.lastAnsweredAt)) / DAY_MS;
    // 当日中に戻ってくる語（FSRSの学習ステップ）は「要再確認」に含める。
    if (!Number.isFinite(days) || days < 1) return labels[1];
    return (buckets.find((bucket) => days <= bucket.days) || buckets[buckets.length - 1]).label;
  }

  return {
    intervals, buckets, labels, params, ratings,
    normalize, record, isDue, label,
    rtGrade, medianMs, measuredMs, nextAverageMs,
  };
})();

if (typeof module !== "undefined") module.exports = KobunSrs;
