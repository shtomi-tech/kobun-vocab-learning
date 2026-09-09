// 意味復習の間隔算出（FSRS-6）と、旧はしごからの移行・フォールバックを検証する。
//
// enable_fuzz が有効なため日数は乱数を含む。完全一致ではなく範囲で判定すること。
const assert = require("node:assert/strict");
const path = require("node:path");

const VENDOR = path.resolve(__dirname, "..", "static", "vendor", "fsrs", "index.umd.js");
const SRS = path.resolve(__dirname, "..", "static", "srs.js");

function loadSrs({ withFsrs }) {
  delete require.cache[SRS];
  if (withFsrs) globalThis.FSRS = require(VENDOR);
  else delete globalThis.FSRS;
  return require(SRS);
}

const DAY = 86400000;
const start = new Date("2026-09-10T00:00:00.000Z");
const intervalDays = (state, from) => (new Date(state.nextReviewAt).getTime() - from.getTime()) / DAY;

/* ---- FSRSを読み込んだ通常経路 ---- */
const srs = loadSrs({ withFsrs: true });

assert.equal(srs.params.request_retention, 0.9, "目標保持率は0.9");
assert.equal(srs.params.maximum_interval, 180, "上限間隔は180日");
assert.equal(srs.params.enable_short_term, true, "当日ステップを使う");
// Easy(4) は自己申告UIが無いため使わない。
assert.deepEqual(Object.keys(srs.ratings).sort(), ["again", "good", "hard"], "使うRatingはAgain/Hard/Good");

/* ---- 解答時間の判定 ---- */
assert.equal(srs.rtGrade(7999, 8000), "good", "8秒未満は常に速い");
assert.equal(srs.rtGrade(8000, 8000), "good", "絶対床ちょうどは速い扱い");
assert.equal(srs.rtGrade(20000, 8000), "hard", "20秒以上は常に遅い");
assert.equal(srs.rtGrade(16001, 10000), "hard", "中央値の1.6倍超は遅い");
assert.equal(srs.rtGrade(16000, 10000), "good", "1.6倍ちょうどは速い扱い");
assert.equal(srs.rtGrade(undefined, 8000), "good", "測れなかった回は不利にしない");
assert.equal(srs.rtGrade(120000, 8000), "good", "中断・再開で伸びた計測は罰しない");
assert.equal(srs.medianMs([1000, 2000, 3000, 4000]), 8000, "標本5件未満は絶対床を基準にする");
assert.equal(srs.medianMs([5000, 1000, 3000, 2000, 4000]), 3000, "5件以上なら中央値");
assert.equal(srs.medianMs([120000, 1000, 2000, 3000, 4000]), 8000, "外れ値は中央値から除く");
assert.equal(srs.medianMs(null), 8000, "配列でなくても落ちない");
assert.equal(srs.measuredMs(120000), null, "外れ値は計測値として採用しない");
assert.equal(srs.measuredMs(-1), null, "負の値は採用しない");
assert.equal(srs.measuredMs(4200), 4200, "通常の計測値はそのまま使う");
assert.equal(srs.nextAverageMs(undefined, 4100), 4100, "初回の平均は実測値そのもの");
assert.equal(srs.nextAverageMs(7000, 4000), 6100, "平均は直近へ3割寄せる");

// 遅い正解(Hard)は速い正解(Good)より次回が早い
{
  const seed = { wrongCount: 0, stage: 3, lastAnsweredAt: "2026-09-01T00:00:00.000Z", nextReviewAt: "2026-09-15T00:00:00.000Z" };
  const answeredAt = new Date("2026-09-15T00:00:00.000Z");
  const fast = srs.record(seed, true, answeredAt, { elapsedMs: 3000, medianMs: 4000 });
  const slow = srs.record(seed, true, answeredAt, { elapsedMs: 30000, medianMs: 4000 });
  assert.ok(
    slow.fsrs.scheduled_days < fast.fsrs.scheduled_days,
    `遅い正解は次回が早くなる必要がある（Hard ${slow.fsrs.scheduled_days}日 < Good ${fast.fsrs.scheduled_days}日）`,
  );
  assert.equal(fast.lastMs, 3000, "正解時は解答時間を保存する");
  assert.equal(fast.avgMs, 3000, "平均も保存する");
  const wrong = srs.record(fast, false, answeredAt, { elapsedMs: 2000 });
  assert.equal(wrong.lastMs, 3000, "誤答では解答時間を更新しない");
  const unmeasured = srs.record(seed, true, answeredAt, { elapsedMs: 900000, medianMs: 4000 });
  assert.equal(unmeasured.lastMs, null, "外れ値は保存しない");
  assert.ok(
    unmeasured.fsrs.scheduled_days >= fast.fsrs.scheduled_days * 0.8,
    "中断・再開の計測でHard扱いにしない",
  );
}

// 初回正解は当日ステップへ入る
let state = srs.record({}, true, start);
assert.equal(state.nextReviewAt, state.fsrs.due, "nextReviewAt は due の写しである必要がある");
assert.equal(state.fsrs.state, 1, "初回正解は Learning へ入る");
assert.ok(intervalDays(state, start) < 1, "初回正解の次回は当日中");
assert.equal(srs.label(state), "要再確認", "当日中に戻る語は要再確認に数える");
assert.equal(srs.isDue(state, start.getTime()), false, "直後は期限前");

// 正解を重ねると間隔が伸び、上限で頭打ちになる
let at = new Date(start);
const seen = [];
for (let i = 0; i < 12; i += 1) {
  state = srs.record(state, true, at);
  seen.push(state.fsrs.scheduled_days);
  at = new Date(state.fsrs.due);
}
assert.equal(state.fsrs.state, 2, "正解を重ねた語は Review 状態になる");
assert.ok(seen[4] > seen[2], `間隔は伸びる必要がある: ${seen.join(",")}`);
assert.ok(
  seen.every((days) => days <= srs.params.maximum_interval + 1),
  `上限${srs.params.maximum_interval}日（丸めで+1）を超えない: ${seen.join(",")}`,
);
assert.ok(seen.at(-1) >= 120, `十分に正解を重ねれば長期間隔へ到達する: ${seen.join(",")}`);
assert.equal(srs.label(state), "半年以上", "上限付近の語は半年以上に数える");

// 誤答は Relearning へ落ち、lapses が増え、安定性が下がり、当日中に戻る
const matureStability = state.fsrs.stability;
const lapsed = srs.record(state, false, at);
assert.equal(lapsed.fsrs.state, 3, "誤答した成熟語は Relearning へ入る");
assert.equal(lapsed.fsrs.lapses, state.fsrs.lapses + 1, "誤答で lapses が増える");
assert.ok(lapsed.fsrs.stability < matureStability, "誤答で安定性が下がる");
assert.ok(intervalDays(lapsed, at) < 1, "誤答直後は当日中に戻す");
assert.equal(lapsed.wrongCount, state.wrongCount + 1, "wrongCount も維持する（難易度推定と互換のため）");

// 保存形式はJSONへ載る（Dateを残さない）
assert.equal(typeof lapsed.fsrs.due, "string", "due はISO文字列で保存する");
for (const key of ["due", "stability", "difficulty", "scheduled_days", "reps", "lapses", "learning_steps", "state", "last_review"]) {
  assert.ok(key in lapsed.fsrs, `保存形式に ${key} を含める必要がある`);
}
assert.deepEqual(
  JSON.parse(JSON.stringify(lapsed.fsrs)),
  lapsed.fsrs,
  "保存形式は JSON 往復で変化しない必要がある",
);
// 文字列から復元しても状態が続く（learning_steps を落とすと Learning から抜けられない）
const revived = srs.record(JSON.parse(JSON.stringify(lapsed)), true, new Date(lapsed.fsrs.due));
assert.ok(revived.fsrs.stability > 0, "保存・復元をまたいで安定性が続く");

/* ---- 旧はしご（stage）の記録からの移行 ---- */
// 直前の間隔（nextReviewAt - lastAnsweredAt）をその語の安定性として引き継ぐ。
const legacy = {
  wrongCount: 2,
  stage: 3,
  lastAnsweredAt: "2026-09-01T00:00:00.000Z",
  nextReviewAt: "2026-09-15T00:00:00.000Z", // 直前の間隔は14日
};
const legacySnapshot = JSON.stringify(legacy);
const migrated = srs.record(legacy, true, new Date("2026-09-15T00:00:00.000Z"));
assert.equal(JSON.stringify(legacy), legacySnapshot, "record は入力オブジェクトを破壊しない");
assert.ok(migrated.fsrs, "旧記録もFSRSカードを持つようになる");
assert.equal(migrated.fsrs.lapses, 2, "lapses は wrongCount を引き継ぐ");
assert.equal(migrated.stage, 3, "stage はロールバック用に凍結して残す");
assert.ok(
  migrated.fsrs.scheduled_days > 14,
  `14日間隔を正解した語は、次回が14日より先になる必要がある（実際: ${migrated.fsrs.scheduled_days}日）`,
);
// 移行は解答時にだけ起きる。答えるまで既存の期限は動かさない。
assert.equal(srs.isDue(legacy, new Date("2026-09-10T00:00:00.000Z").getTime()), false, "未解答の旧記録の期限は動かない");
assert.equal(srs.label(legacy), "2週間", "旧記録もバケットで表示できる");

// 未実施・誤答直後（nextReviewAt なし）は New から始める
const fresh = srs.record({ wrongCount: 5, stage: 0, lastAnsweredAt: "2026-09-01T00:00:00.000Z", nextReviewAt: null }, true, start);
assert.ok(intervalDays(fresh, start) < 1, "誤答直後の語は当日ステップから積み直す");

/* ---- 内訳バケット ---- */
assert.deepEqual(
  srs.labels,
  ["未実施", "要再確認", "3日以内", "1週間", "2週間", "1か月", "3か月", "半年以上"],
  "内訳は8バケット",
);
const bounds = srs.buckets.map((bucket) => bucket.days);
assert.deepEqual(bounds, [...bounds].sort((a, b) => a - b), "バケットの上限は昇順である必要がある");
assert.equal(srs.label({}), "未実施", "未実施の判定");
assert.equal(srs.label({ lastAnsweredAt: start.toISOString(), nextReviewAt: null }), "要再確認", "期限なしは要再確認");

/* ---- FSRSが読み込めない環境（配信漏れ・ネットワーク失敗）でも学習を止めない ---- */
const offline = loadSrs({ withFsrs: false });
let fallback = {};
for (const days of offline.intervals) {
  fallback = offline.record(fallback, true, start);
  assert.equal(
    Math.round((new Date(fallback.nextReviewAt) - start) / DAY),
    days,
    `フォールバックは旧はしご（${days}日）で動く`,
  );
  assert.equal(fallback.fsrs, null, "フォールバック時はFSRSカードを作らない");
}
{
  let slow = {};
  slow = offline.record(slow, true, start, { elapsedMs: 30000, medianMs: 4000 });
  assert.equal(slow.stage, 0, "フォールバックでも遅い正解は段を進めない");
  assert.equal(Math.round((new Date(slow.nextReviewAt) - start) / DAY), 1, "段は進まないが同じ間隔で出す");
}
fallback = offline.record(fallback, false, start);
assert.equal(fallback.stage, 0, "フォールバックの誤答は stage を戻す");
assert.equal(fallback.nextReviewAt, null, "フォールバックの誤答は即座に対象へ戻す");
assert.equal(offline.isDue(fallback, start.getTime()), true, "フォールバックの誤答は期限到来");

console.log("OK: SRS FSRS-6（上限180日・当日ステップ）/ 旧はしごからの移行 / 未読込時フォールバック");
