"use strict";

// 学習時間（日ごと・累計）。学習画面が見えていて、最後の操作から3分以内の間だけ加算する。
// クラウドでは _meta.studyTimeV1_<端末ID> に端末ごとの日別秒数を置く。
// サーバーも cloud.js も _meta をキー単位でマージするので、端末同士で上書きし合わない。
// 合計＝自端末の記録＋クラウドから読んだ他端末の記録。
const KobunStudyTime = (() => {
  const META_PREFIX = "studyTimeV1_";
  const DEVICE_KEY = "kobun_vocab_device_id";
  const IDLE_MS = 3 * 60 * 1000;
  const TICK_MS = 1000;
  const MAX_TICK_MS = 5 * 1000; // スリープ復帰などで間隔が飛んだ分は数えない
  const FLUSH_MS = 30 * 1000;
  const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

  function dayKey(date = new Date()) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }
  function normalizeDays(value) {
    const days = {};
    if (!value || typeof value !== "object" || Array.isArray(value)) return days;
    Object.entries(value).forEach(([day, sec]) => {
      const n = Math.floor(Number(sec));
      if (DAY_RE.test(day) && Number.isFinite(n) && n > 0) days[day] = n;
    });
    return days;
  }
  function mergeDays(a, b) {
    const out = { ...a };
    Object.entries(b).forEach(([day, sec]) => { out[day] = Math.max(out[day] || 0, sec); });
    return out;
  }
  function readJson(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value && typeof value === "object" && !Array.isArray(value) ? value : null;
    } catch (_) { return null; }
  }
  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* 記録できなくても学習は続ける */ }
  }
  function deviceId() {
    let id = "";
    try { id = localStorage.getItem(DEVICE_KEY) || ""; } catch (_) { /* ignore */ }
    if (!/^[A-Za-z0-9-]{8,64}$/.test(id)) {
      id = (window.crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
      try { localStorage.setItem(DEVICE_KEY, id); } catch (_) { /* ignore */ }
    }
    return id;
  }
  function formatDuration(sec) {
    const minutes = Math.floor(sec / 60);
    if (minutes < 60) return `${minutes}分`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours}時間${rest}分` : `${hours}時間`;
  }

  // storageKey: 生徒別の保存キー / isActive: 学習画面が表示中か / onFlush: クラウド保存の依頼
  function create({ storageKey, isActive, onFlush }) {
    const device = deviceId();
    const stored = readJson(storageKey) || {};
    const data = { days: normalizeDays(stored.days), remote: {} };
    Object.entries(stored.remote && typeof stored.remote === "object" ? stored.remote : {})
      .forEach(([id, value]) => { if (id !== device) data.remote[id] = normalizeDays(value); });
    let carryMs = 0;
    let lastTick = Date.now();
    let lastActivity = Date.now();
    let lastFlush = Date.now();
    let dirty = false;

    // クラウドの _meta から端末別の記録を取り込む（起動時・他端末の保存を取り込んだとき）
    function applyCloudMeta(meta) {
      if (!meta || typeof meta !== "object") return;
      Object.entries(meta).forEach(([key, value]) => {
        if (!key.startsWith(META_PREFIX) || !value || typeof value !== "object") return;
        const id = key.slice(META_PREFIX.length);
        const days = normalizeDays(value.days);
        if (id === device) data.days = mergeDays(data.days, days);
        else if (id) data.remote[id] = days; // 他端末分はクラウドを正とする
      });
      writeJson(storageKey, data);
    }
    function cloudMeta() {
      return Object.keys(data.days).length ? { [META_PREFIX + device]: { days: data.days } } : {};
    }
    function flush() {
      lastFlush = Date.now();
      if (!dirty) return;
      dirty = false;
      writeJson(storageKey, data);
      if (onFlush) onFlush();
    }
    function tick() {
      const now = Date.now();
      const elapsed = now - lastTick;
      lastTick = now;
      if (document.visibilityState !== "visible" || !isActive() || now - lastActivity >= IDLE_MS) return;
      carryMs += Math.min(Math.max(elapsed, 0), MAX_TICK_MS);
      const sec = Math.floor(carryMs / 1000);
      if (sec > 0) {
        carryMs -= sec * 1000;
        const day = dayKey(new Date(now));
        data.days[day] = (data.days[day] || 0) + sec;
        dirty = true;
      }
      if (dirty && now - lastFlush >= FLUSH_MS) flush();
    }
    function totals() {
      const today = dayKey();
      const prev = new Date();
      prev.setDate(prev.getDate() - 1);
      const yesterday = dayKey(prev);
      const out = { today: 0, yesterday: 0, total: 0, average: 0 };
      let firstDay = "";
      [data.days, ...Object.values(data.remote)].forEach((days) => {
        Object.entries(days).forEach(([day, sec]) => {
          out.total += sec;
          if (day === yesterday) out.yesterday += sec;
          if (day === today) out.today += sec;
          if (!firstDay || day < firstDay) firstDay = day;
        });
      });
      // 平均＝累計 ÷ 最初に記録した日から今日までの日数（学習しなかった日も含む）
      if (firstDay) {
        const [y, m, d] = firstDay.split("-").map(Number);
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const span = Math.max(1, Math.round((todayStart - new Date(y, m - 1, d)) / 86400000) + 1);
        out.average = Math.round(out.total / span);
      }
      return out;
    }

    const markActivity = () => { lastActivity = Date.now(); };
    ["pointerdown", "keydown", "wheel", "touchstart", "scroll"].forEach((type) => {
      document.addEventListener(type, markActivity, { capture: true, passive: true });
    });
    document.addEventListener("visibilitychange", () => {
      lastTick = Date.now();
      if (document.visibilityState === "hidden") flush();
      else markActivity();
    });
    window.addEventListener("pagehide", flush);
    setInterval(tick, TICK_MS);

    return { applyCloudMeta, cloudMeta, flush, totals };
  }

  return { create, formatDuration, dayKey, normalizeDays, mergeDays };
})();

if (typeof module !== "undefined") module.exports = KobunStudyTime;
