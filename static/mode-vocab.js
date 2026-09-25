"use strict";

const KobunVocabApp = (() => {
  const MANIFEST_URL = "data/manifest.json";
  const WAKA_GRAMMAR_URL = "data/waka-grammar.json";
  const sharedStudentId = (() => {
    const params = new URLSearchParams(location.search);
    return (params.get("s") || params.get("student") || "").trim();
  })();
  const storageScope = sharedStudentId ? `_${encodeURIComponent(sharedStudentId)}` : "";
  const SET_KEY = `kobun_vocab_dataset${storageScope}`;
  const PROGRESS_PREFIX = `kobun_vocab_progress${storageScope}_`;
  const BATCH_SIZE = 4;
  const MEANING_SESSION_SIZE = 20;
  const HISTORY_LIMIT = 500;
  const APP_ID = "kobun-vocab-learning";
  // 学習目標（1日の単語目標）と到達予想。計算は static/study-plan.js、ここは保存と表示だけを持つ。
  // 常時表示は「今日 n / m語」1本に絞る。
  const STUDY_PLAN_KEY = `kobun_vocab_study_plan_v1${storageScope}`;
  const STUDY_TIME_KEY = `kobun_vocab_study_time_v1${storageScope}`;
  const {
    GOAL_TOTAL: VOCAB_GOAL_TOTAL,
    DAILY_MAX: STUDY_PLAN_DAILY_MAX,
    isValidIsoDate,
    normalizeStudyPlan,
    defaultStudyPlan,
    studyPlanSummary,
    vocabularyForecast,
    vocabularyGoalForecast,
    migrateFirstAnsweredAt,
  } = KobunStudyPlan;

  const state = { manifest: null, setId: null, set: null, progress: null, reviewPool: [] };
  let session = null;
  let cloud = null;
  let studyTime = null;
  let studyPlan = null;
  let pendingCloudStudyPlan = null;
  let homeIntroduced = false;
  let lastQuizEntryKey = null;
  let lastStepKey = null;
  let shareStatusIntroduced = false;

  const $ = (selector) => document.querySelector(selector);
  const el = (tag, attrs = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value === false || value == null) continue;
      if (key === "class") node.className = value;
      else if (key === "onclick") node.addEventListener("click", value);
      else node.setAttribute(key, value === true ? "" : value);
    }
    for (const child of children.flat()) {
      if (child == null) continue;
      node.append(child.nodeType ? child : document.createTextNode(String(child)));
    }
    return node;
  };
  const pressFlash = (element, action) => {
    if (!element) return;
    element.classList.add("is-pressing");
    setTimeout(action, 0);
  };
  const shuffle = (items) => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };
  const progressKey = (setId = state.setId) => PROGRESS_PREFIX + setId;
  const { meaningText, isSafePair: isMeaningSafePair } = KobunMeaningGuard;
  const wordById = (id) => state.set.words.find((word) => word.id === id);
  const {
    BLANK: exampleBlank,
    isWaka,
    wakaRefText,
    contextMoraCount,
    exampleTargetPart,
    wakaBlankPart,
  } = KobunExampleParts;

  function exampleBody(word, { blank = false, underline = false } = {}) {
    if (!isWaka(word)) {
      if (blank) return word.cloze;
      if (!underline) return word.example;
      const target = exampleTargetPart(word);
      if (!target) return word.example;
      return [
        word.example.slice(0, target.start),
        el("span", { class: "meaningTarget" }, word.example.slice(target.start, target.end)),
        word.example.slice(target.end),
      ];
    }
    const targetPart = blank || underline ? wakaBlankPart(word) : null;
    if (blank && !targetPart) return word.cloze;
    if (underline && !targetPart) return word.example;
    return word.waka.phrases.map((phrase, index) => {
      if (targetPart?.index !== index) return el("span", { class: "ku" }, phrase);
      const content = blank
        ? `${phrase.slice(0, targetPart.start)}${exampleBlank}${phrase.slice(targetPart.end)}`
        : underline
          ? [
            phrase.slice(0, targetPart.start),
            el("span", { class: "meaningTarget" }, phrase.slice(targetPart.start, targetPart.end)),
            phrase.slice(targetPart.end),
          ]
          : phrase;
      return el("span", { class: "ku" }, content);
    });
  }

  const exampleClass = (word, base) => `${base}${isWaka(word) ? ` ${base}--waka` : ""}`;

  function normalizeProgress(candidate, set) {
    const source = candidate && typeof candidate === "object" && !Array.isArray(candidate) ? candidate : {};
    const isRecord = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
    return {
      ...source,
      units: isRecord(source.units),
      finalCheck: isRecord(source.finalCheck),
      items: isRecord(source.items),
      history: Array.isArray(source.history) ? source.history : [],
      dataVersion: source.dataVersion,
      ...(source.dataVersion == null ? { dataVersion: set.meta.dataVersion || 1 } : {}),
    };
  }

  function loadProgressFor(setId, set) {
    try {
      const saved = JSON.parse(localStorage.getItem(progressKey(setId)));
      if (saved && typeof saved === "object") {
        const progress = normalizeProgress(saved, set);
        const dataVersion = set.meta.dataVersion || 1;
        if (progress.dataVersion !== dataVersion) {
          progress.dataVersion = dataVersion;
          progress.finalCheck = {};
          delete progress.resume;
        } else if (progress.resume?.mode === "final") {
          // 最終チェックは廃止済み。旧データの途中位置は再開できないため破棄する。
          delete progress.resume;
          localStorage.setItem(progressKey(setId), JSON.stringify(progress));
        }
        return progress;
      }
    } catch (_) { /* 壊れた記録は上書きせず、今回だけ空状態で表示する。 */ }
    return normalizeProgress(null, set);
  }

  function applyExampleSourcePriority(set) {
    return {
      ...set,
      words: set.words.map((word) => KobunExampleSource.select(word)),
    };
  }

  function saveProgressFor(setId, progress) {
    try { localStorage.setItem(progressKey(setId), JSON.stringify(progress)); } catch (_) { /* localStorageなしでも学習は続ける */ }
    if (cloud) cloud.queueSave({ datasetId: setId, progress, meta: cloudMeta() });
  }

  function saveProgress() {
    saveProgressFor(state.setId, state.progress);
  }

  function cloudMeta() {
    return {
      lastDatasetId: state.setId,
      ...(studyPlan ? { studyPlanV1: studyPlan } : {}),
      ...(studyTime ? studyTime.cloudMeta() : {}),
    };
  }

  // 全セットの語について、初回答時刻つきの unit 状態だけを取り出す。
  function studyPlanUnitEntries() {
    return reviewPoolEntries().map((entry) => {
      const unitState = entry.progress && entry.progress.units && entry.progress.units[entry.word.id];
      return { unit: unitState && typeof unitState === "object" ? unitState : {} };
    });
  }

  function readStudyPlanLocal() {
    try {
      const raw = JSON.parse(localStorage.getItem(STUDY_PLAN_KEY));
      return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : null;
    } catch (_) {
      return null;
    }
  }

  function saveStudyPlan() {
    if (!studyPlan) return;
    try { localStorage.setItem(STUDY_PLAN_KEY, JSON.stringify(studyPlan)); } catch (_) { /* localStorageなしでも学習は続く */ }
  }

  function loadStudyPlan() {
    const local = readStudyPlanLocal();
    const localPlan = local ? normalizeStudyPlan(local) : null;
    const cloudPlan = pendingCloudStudyPlan ? normalizeStudyPlan(pendingCloudStudyPlan) : null;
    const shared = Boolean(cloud && cloud.isEnabled());
    studyPlan = shared && cloudPlan ? cloudPlan : (localPlan || defaultStudyPlan());
    if (shared && cloudPlan) saveStudyPlan();
    return studyPlan;
  }

  function migrateStudyPlanFirstAnswers() {
    let migrated = false;
    state.reviewPool.forEach((source) => {
      if (!source || !source.progress) return;
      if (migrateFirstAnsweredAt(source.progress)) {
        migrated = true;
        saveProgressFor(source.setId, source.progress);
      }
    });
    return migrated;
  }

  function unit(id) {
    if (!state.progress.units[id]) state.progress.units[id] = {};
    return state.progress.units[id];
  }

  function saveResume() {
    if (!session) return;
    state.progress.resume = JSON.parse(JSON.stringify(session));
    saveProgress();
  }

  function clearResume() {
    delete state.progress.resume;
    saveProgress();
  }


  function reviewIds() {
    return state.set.words.filter((word) => unit(word.id).needsReview).map((word) => word.id);
  }

  // 全セットの { setId, set, progress }。開いているセットだけは state 側が最新なので差し替える。
  function progressSources() {
    const sources = state.reviewPool.length
      ? state.reviewPool
      : [{ setId: state.setId, set: state.set, progress: state.progress }];
    return sources.map((source) => source.setId === state.setId
      ? { ...source, set: state.set, progress: state.progress }
      : source);
  }

  function reviewPoolEntries() {
    return progressSources().flatMap(({ setId, set, progress }) => set.words.map((word) => ({
      key: `${setId}::${word.id}`,
      setId,
      word,
      progress,
    })));
  }

  function reviewEntryByKey(key) {
    return reviewPoolEntries().find((entry) => entry.key === key) || null;
  }

  function appendHistory(event, progress = state.progress) {
    if (!Array.isArray(progress.history)) progress.history = [];
    progress.history.push({ at: new Date().toISOString(), ...event });
    if (progress.history.length > HISTORY_LIMIT) {
      progress.history.splice(0, progress.history.length - HISTORY_LIMIT);
    }
  }

  function learnedMeaningEntries() {
    return reviewPoolEntries().filter(({ word, progress }) => progress.units?.[word.id]?.learned);
  }

  function dueMeaningEntries() {
    return learnedMeaningEntries().filter(({ word, progress }) => KobunSrs.isDue(progress.items?.[word.id]));
  }

  function setShareStatus(message, tone = "") {
    const slot = $("#shareStatus");
    if (!slot) return;
    const state = tone === "ng" ? "error" : tone === "syncing" ? "syncing" : tone === "ok" ? "saved" : "";
    slot.innerHTML = "";
    if (state) slot.dataset.state = state; else delete slot.dataset.state;
    if (!message) return;
    const justSaved = state === "saved" && !shareStatusIntroduced;
    if (state === "saved") shareStatusIntroduced = true;
    slot.appendChild(el("span", { class: `shareStatusIcon${justSaved ? " is-settling" : ""}`, "aria-hidden": "true" }));
    slot.appendChild(el("span", { class: "shareStatusText" }, message));
  }

  function applyCloudProgress(value, { reason } = {}) {
    if (!value || typeof value !== "object") return;
    if (studyTime) studyTime.applyCloudMeta(value._meta);
    const cloudPlan = value._meta && value._meta.studyPlanV1;
    pendingCloudStudyPlan = cloudPlan && typeof cloudPlan === "object" && !Array.isArray(cloudPlan) ? cloudPlan : null;
    if (studyPlan && pendingCloudStudyPlan) {
      studyPlan = normalizeStudyPlan(pendingCloudStudyPlan);
      saveStudyPlan();
    }
    const lastSetId = value._meta?.lastDatasetId;
    if (lastSetId && state.manifest.sets[lastSetId]) localStorage.setItem(SET_KEY, lastSetId);
    for (const [setId, progress] of Object.entries(value)) {
      if (state.manifest.sets[setId] && progress && typeof progress === "object") {
        localStorage.setItem(PROGRESS_PREFIX + setId, JSON.stringify(progress));
      }
    }
    if (!reason || reason === "init" || !state.set) return;
    // 他端末の保存を取り込んだ（タブ復帰・保存競合）。メモリ上の進捗も読み直す。
    state.progress = loadProgressFor(state.setId, state.set);
    if (!session && !$("#homePanel").classList.contains("hide")) {
      loadReviewPool().then(() => renderHome()).catch((error) => console.error(error));
    }
  }

  async function loadReviewPool() {
    const entries = await Promise.all(Object.entries(state.manifest.sets).map(async ([setId, entry]) => {
      if (setId === state.setId) return { setId, set: state.set, progress: state.progress };
      const set = await fetch(entry.dataUrl, { cache: "no-store" }).then((response) => {
        if (!response.ok) throw new Error(`set: HTTP ${response.status}`);
        return response.json();
      });
      const selectedSet = applyExampleSourcePriority(set);
      return { setId, set: selectedSet, progress: loadProgressFor(setId, selectedSet) };
    }));
    state.reviewPool = entries;
  }

  function wordForSession(id) {
    return reviewEntryByKey(id)?.word || wordById(id);
  }

  // 候補の範囲（セット内か復習プール全体か）だけをここで決め、組み立ては static/choice-builder.js に任せる。
  const choiceDeps = { isSafePair: isMeaningSafePair, meaningText, moraCount: contextMoraCount, shuffle };

  function choiceSet(word, kind) {
    const isMeaningReview = kind === "meaning" && session?.mode === "meaningReview";
    const source = isMeaningReview
      ? reviewPoolEntries().map((entry) => ({ key: entry.key, word: entry.word }))
      : state.set.words.map((other) => ({ key: other.id, word: other }));
    const currentKey = isMeaningReview ? session.meaningOrder[session.meaningIndex] : word.id;
    const candidates = source.filter((other) => other.key !== currentKey);
    // 意味四択でセット内の安全な候補が足りないときは、他セットの既習語から補う。
    const currentIds = new Set(source.map(({ word: other }) => other.id));
    const fallback = kind === "meaning" && !isMeaningReview
      ? reviewPoolEntries()
        .filter(({ word: other }) => !currentIds.has(other.id))
        .map((entry) => ({ key: entry.key, word: entry.word }))
      : [];
    return KobunChoiceBuilder.buildChoices(word, kind, candidates, fallback, choiceDeps);
  }

  function meaningChoicesAreSafe(word, choices) {
    const source = reviewPoolEntries().map((entry) => ({ key: entry.key, word: entry.word }));
    const currentKey = session?.mode === "meaningReview"
      ? session.meaningOrder[session.meaningIndex]
      : word.id;
    return KobunChoiceBuilder.meaningChoicesAreSafe(word, choices, source, currentKey, choiceDeps);
  }

  function blockActionLabel(block, hasResume) {
    if (block.isCurrent) return "続きから";
    if (hasResume) return "再開してから";
    return block.key === "unlearned" ? "始める" : "復習する";
  }

  function learningBlockMap() {
    const blocks = KobunSetProgress.summarizeBlocks(state.set, state.progress, BATCH_SIZE);
    const hasResume = Boolean(state.progress.resume);
    const total = state.set.words.length;
    const section = el("section", { class: "card learningBlockMap" },
      el("p", { class: "label" }, "学習ブロック"),
      el("h2", {}, `全${total}語を${BATCH_SIZE}語ずつ${blocks.length}ブロックで進める`),
    );
    const grid = el("div", { class: "blockGrid" });
    blocks.forEach((block) => {
      const disabled = hasResume && !block.isCurrent;
      const actionLabel = blockActionLabel(block, hasResume);
      grid.appendChild(el("button", {
        class: `blockCard blockCard--${block.key}`,
        type: "button",
        disabled,
        onclick: disabled ? null : () => { if (block.isCurrent) restoreSession(); else startLearn(block.index); },
      },
        el("span", { class: "blockCardNumber" }, String(block.index + 1).padStart(2, "0")),
        el("span", { class: "blockCardBody" },
          el("span", { class: "blockCardTitle" }, `第${block.index + 1}ブロック・${block.total}語`),
          el("span", { class: "blockCardWords" }, block.words.map((word) => word.headword).join(" / ")),
          el("span", { class: `blockCardState blockCardState--${block.key}` }, block.label),
        ),
        el("span", { class: "blockCardArrow" }, `${actionLabel} →`),
      ));
    });
    section.appendChild(grid);
    return section;
  }

  function resumeDescription(resume) {
    if (!resume) return "";
    const title = resume.mode === "recallReview" ? "全セット共通" : state.set?.meta?.title || "このセット";
    const block = resume.mode === "learn"
      ? `・第${Number(resume.batchIndex || 0) + 1}/${resume.batchCount || 1}ブロック`
      : "";
    // resume.order はセット全語のIDなので、ブロック内の語数は currentBatchIds() と同じ切り出しで求める。
    const batchStart = Number(resume.batchIndex || 0) * BATCH_SIZE;
    const batchLength = (resume.order || []).slice(batchStart, batchStart + BATCH_SIZE).length || BATCH_SIZE;
    const stage = {
      flash: `STEP 1 覚える ${Number(resume.index || 0) + 1}/${batchLength}`,
      meaning: resume.mode === "meaningReview" ? "意味だけ復習" : "STEP 2 確かめる",
      recall: `思い出して復習 ${Number(resume.meaningIndex || 0) + 1}/${(resume.meaningOrder || []).length}`,
      wrongReview: "誤答確認",
      context: resume.mode === "review" ? "誤答復習" : "STEP 3 文中で解く",
      done: "完了",
    }[resume.stage] || "学習中";
    return `${title}${block}・${stage}`;
  }

  function studyTimeCard() {
    const totals = studyTime.totals();
    const metric = (label, sec) => el("div", { class: "studyTimeMetric" },
      el("span", { class: "label" }, label),
      el("strong", {}, KobunStudyTime.formatDuration(sec)),
    );
    return el("section", { class: "card studyTimeCard", "aria-labelledby": "studyTimeTitle" },
      el("h2", { id: "studyTimeTitle" }, "学習時間"),
      el("div", { class: "studyTimeMetrics" },
        metric("今日", totals.today),
        metric("前日", totals.yesterday),
        metric("1日平均", totals.average),
        metric("累計", totals.total),
      ),
      el("p", { class: "hint" }, "学習画面を開いている間に自動で記録します（3分操作がなければ停止）。"),
    );
  }

  function renderHome() {
    session = null;
    $(".wrap")?.classList.remove("sessionActive");
    $("#sessionPanel").classList.add("hide");
    $("#wakaPanel")?.classList.add("hide");
    const home = $("#homePanel");
    home.classList.remove("hide");
    home.removeAttribute("aria-busy");
    home.innerHTML = "";

    const summary = KobunSetProgress.summarize(state.set, state.progress);
    const total = state.set.words.length;
    const learned = summary.learnedCount;
    const solved = state.set.words.filter((word) => unit(word.id).solvedCorrect).length;
    const reviews = reviewIds();
    const cleared = summary.key === "cleared";
    const resume = state.progress.resume;
    const nextUnclearedId = cleared && !resume && !reviews.length ? nextUnclearedSetId(state.setId) : null;
    const isFirstReveal = !homeIntroduced;
    homeIntroduced = true;

    if (isFirstReveal) {
      home.appendChild(el("section", { class: "card hero" },
        el("p", { class: "label" }, "学習の流れ"),
        el("h2", {}, "古文単語を「覚えてから解く」"),
        el("p", { class: "hint" }, `${total}語を4語ずつ、覚える → 意味を確かめる、の順に進めてから文中問題を解きます。`),
      ));
    }

    const card = el("section", { class: `card${isFirstReveal ? " is-entering" : ""}` },
      el("p", { class: "label" }, cleared ? "達成状況" : "今日の学習"),
      el("h2", {}, state.set.meta.title),
    );

    if (resume) {
      card.appendChild(el("div", { class: "resumeNotice" },
        el("p", { class: "label" }, "途中保存"),
        el("p", { class: "resumeText" }, resumeDescription(resume)),
        el("p", { class: "hint" }, "この端末に保存されています。続きから再開できます。"),
      ));
    }

    let primary;
    if (resume) primary = ["続きから再開する", restoreSession, "保存した位置から再開します。"];
    else if (learned < total) primary = [`${total}語の学習を始める`, startLearn, "4語の暗記カードと意味確認を1ブロックとして進めます。"];
    else if (reviews.length) primary = [`間違えた${reviews.length}語を復習する`, startReview, "文中問題を解き直します。"];
    else if (nextUnclearedId) {
      const nextIndex = Object.keys(state.manifest.sets).indexOf(nextUnclearedId) + 1;
      primary = [`第${nextIndex}セットへ進む →`, () => switchSet(nextUnclearedId), "次の未CLEARセットを開きます。"];
    }
    else primary = ["このセットをもう一周する", startLearn, "暗記カードからもう一度確認します。"];

    const recommend = el("div", { class: "recommend" },
      el("p", { class: "recEyebrow" }, "▶ まずはここから"),
      el("button", { class: "cta", onclick: () => primary[1]() }, primary[0]),
      el("p", { class: "recWhy" }, primary[2]),
    );
    if (nextUnclearedId) recommend.appendChild(el("button", { class: "ghost", onclick: startLearn }, "このセットをもう一周する"));
    card.appendChild(recommend);

    card.appendChild(el("div", { class: "stats" },
      stat(learned, total, "文中回答済み"),
      stat(summary.reviewCount, total, "復習対象"),
      stat(solved, total, "正解確認済み", { secondary: true }),
    ));
    home.appendChild(card);
    home.appendChild(vocabGoalCard());
    if (studyTime) {
      studyTime.flush();
      home.appendChild(studyTimeCard());
    }
    home.appendChild(meaningMission());
    home.appendChild(recallMission());
    const wakaTeaser = hasWakaGallery() ? KobunWakaGallery.teaserCard(wakaPoems(), { onOpen: openWakaGallery }) : null;
    if (wakaTeaser) home.appendChild(wakaTeaser);
    home.appendChild(el("section", { class: "card" }, setPicker()));
    home.appendChild(learningBlockMap());

    const list = el("section", { class: "card" },
      el("p", { class: "label" }, "単語一覧"),
      el("h2", {}, `全${total}語`),
    );
    const grid = el("div", { class: "wordList" });
    state.set.words.forEach((word, index) => {
      const u = unit(word.id);
      const status = u.needsReview ? "要復習" : u.solvedCorrect ? "正解済み" : u.learned ? "文中回答済み" : "未学習";
      grid.appendChild(el("div", { class: `wordRow ${u.needsReview ? "review" : u.solvedCorrect ? "done" : ""}` },
        el("span", { class: "wordNo" }, index + 1),
        el("span", { class: "wordName" }, `${word.headword}【${word.kanji}】`),
        el("span", { class: "wordStatus" }, status),
      ));
    });
    list.appendChild(grid);
    home.appendChild(list);
  }

  function studyPlanProgress(label, value, max, valueText, detail) {
    const safeMax = Math.max(1, Number(max) || 1);
    const boundedValue = Math.min(Math.max(0, Number(value) || 0), safeMax);
    const track = el("div", {
      class: "studyPlanProgress",
      role: "progressbar",
      "aria-label": label,
      "aria-valuemin": "0",
      "aria-valuemax": String(safeMax),
      "aria-valuenow": String(boundedValue),
      "aria-valuetext": valueText,
    });
    const fill = el("span", { class: "studyPlanProgressFill" });
    fill.style.width = `${(boundedValue / safeMax) * 100}%`;
    track.appendChild(fill);
    return el("div", { class: "studyPlanMetric" },
      el("div", { class: "studyPlanMetricHead" },
        el("strong", {}, label),
        el("span", { class: "studyPlanMetricValue" }, valueText),
      ),
      track,
      el("p", { class: "studyPlanMetricDetail" }, detail),
    );
  }

  // 学習目標パネル。語彙目標カードの先頭に置き、常時表示は「今日 n / m語」1本に絞る。
  function studyPlanPanel() {
    const plan = studyPlan || defaultStudyPlan();
    const summary = studyPlanSummary(new Date(), plan, studyPlanUnitEntries());
    const num = (value) => Number(value).toLocaleString("ja-JP");
    const dailyStatus = summary.dailyRemaining === 0 ? "✓ 今日の目標達成" : `あと${num(summary.dailyRemaining)}語`;

    const settingsId = "studyPlanSettings";
    const settingsToggle = el("button", {
      class: "ghost studyPlanSettingsToggle",
      type: "button",
      "aria-expanded": "false",
      "aria-controls": settingsId,
    }, "学習目標を設定");

    const settings = el("form", {
      class: "studyPlanSettings hide",
      id: settingsId,
      "aria-labelledby": "studyPlanSettingsTitle",
    });
    const dailyInput = el("input", {
      type: "number",
      min: "1",
      max: String(STUDY_PLAN_DAILY_MAX),
      value: String(plan.dailyWordGoal),
      inputmode: "numeric",
    });
    const error = el("p", { class: "studyPlanFormError", role: "alert", "aria-live": "polite" });
    const restoreSettingsForm = () => {
      dailyInput.value = String(plan.dailyWordGoal);
      error.textContent = "";
    };
    const closeSettings = () => {
      restoreSettingsForm();
      settings.classList.add("hide");
      settingsToggle.setAttribute("aria-expanded", "false");
      settingsToggle.focus();
    };
    settings.appendChild(el("h4", { id: "studyPlanSettingsTitle" }, "学習目標の設定"));
    settings.appendChild(el("p", { class: "hint" }, `1日の単語目標は1〜${num(STUDY_PLAN_DAILY_MAX)}語で設定できます。`));
    settings.appendChild(el("label", { class: "studyPlanField" },
      el("span", { class: "fieldLabel" }, "1日の単語目標"),
      dailyInput,
      el("span", { class: "studyPlanFieldHint" }, "文中問題まで解いた語で数えます"),
    ));
    settings.appendChild(error);
    settings.appendChild(el("div", { class: "actions studyPlanFormActions" },
      el("button", { class: "cta", type: "submit" }, "保存"),
      el("button", { class: "ghost", type: "button", onclick: closeSettings }, "キャンセル"),
    ));
    settings.addEventListener("submit", (event) => {
      event.preventDefault();
      const dailyWordGoal = Number(dailyInput.value);
      if (!Number.isInteger(dailyWordGoal) || dailyWordGoal < 1 || dailyWordGoal > STUDY_PLAN_DAILY_MAX) {
        error.textContent = `1日の単語目標は1〜${num(STUDY_PLAN_DAILY_MAX)}語で入力してください。`;
        return;
      }
      studyPlan = normalizeStudyPlan({ ...plan, dailyWordGoal });
      saveStudyPlan();
      if (cloud) cloud.queueSave({ datasetId: state.setId, progress: state.progress, meta: cloudMeta() });
      renderHome();
    });
    settingsToggle.addEventListener("click", () => {
      if (settings.classList.contains("hide")) {
        settings.classList.remove("hide");
        settingsToggle.setAttribute("aria-expanded", "true");
        dailyInput.focus();
      } else {
        closeSettings();
      }
    });

    return el("div", { class: "studyPlanPanel", "aria-labelledby": "studyPlanTitle" },
      el("div", { class: "studyPlanHead" },
        el("div", {},
          el("p", { class: "label" }, "学習目標"),
          el("h3", { id: "studyPlanTitle" }, "新規に学んだ語の進捗"),
        ),
        settingsToggle,
      ),
      el("div", { class: "studyPlanMetrics" },
        studyPlanProgress(
          "今日",
          summary.answeredToday,
          plan.dailyWordGoal,
          `${num(summary.answeredToday)} / ${num(plan.dailyWordGoal)}語`,
          dailyStatus,
        ),
      ),
      settings,
    );
  }

  // 到達予想。既定は折りたたみ。1語＝語彙1で、このペースの600語到達日と期間別の理論語数を出す。注記文は置かない。
  function vocabForecastDetails(learned) {
    const plan = studyPlan || defaultStudyPlan();
    const goalForecast = vocabularyGoalForecast(new Date(), plan, learned);
    const periods = vocabularyForecast(plan);
    const num = (value) => Number(value).toLocaleString("ja-JP");
    const periodLabels = { 7: "1週間後", 30: "1か月後", 90: "3か月後", 180: "半年後", 365: "1年後" };
    const reached = goalForecast.remainingVocabulary === 0;
    const details = el("details", { class: "vocabForecast" });
    details.appendChild(el("summary", { class: "vocabForecastSummary" },
      el("span", { class: "vocabForecastSummaryTitle" }, "このペースで学べる語"),
      el("span", { class: "vocabForecastLead" }, reached
        ? `${num(VOCAB_GOAL_TOTAL)}語の目安に到達しています`
        : `このペースなら${num(VOCAB_GOAL_TOTAL)}語まであと${num(goalForecast.remainingVocabulary)}語`),
    ));
    details.appendChild(el("p", { class: "hint vocabForecastDate" }, reached
      ? `${num(VOCAB_GOAL_TOTAL)}語の目安に到達しています。`
      : `1日${num(goalForecast.dailyVocabulary)}語で、${goalForecast.estimatedDate.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" })}ごろ（あと${num(goalForecast.daysToGoal)}日）`));
    details.appendChild(el("div", { class: "vocabForecastGrid", "aria-label": "期間別の理論上の語数予測" },
      ...periods.map(({ days, vocabulary }) => el("div", { class: "vocabForecastRow" },
        el("span", {}, periodLabels[days] || `${days}日後`),
        el("strong", {}, `+${num(vocabulary)}語`),
      )),
    ));
    return details;
  }

  // 語彙目標カード。セット単位ではなく全セット横断の到達語数を、目標600語に対して1本のバーで示す。
  function vocabGoalCard() {
    const learned = Math.min(learnedMeaningEntries().length, VOCAB_GOAL_TOTAL);
    const pct = (value) => `${(value / VOCAB_GOAL_TOTAL) * 100}%`;
    const num = (value) => value.toLocaleString("ja-JP");
    const message = learned === 0 ? `まずは1語から。${num(VOCAB_GOAL_TOTAL)}語への第一歩。`
      : learned < VOCAB_GOAL_TOTAL * 0.25 ? "一歩めが出ました。それがいちばん大変。"
      : learned < VOCAB_GOAL_TOTAL * 0.5 ? "歩き出しました。この調子。"
      : learned < VOCAB_GOAL_TOTAL * 0.75 ? "半分をこえました。"
      : learned < VOCAB_GOAL_TOTAL ? "ゴールが見えてきました。"
      : `${num(VOCAB_GOAL_TOTAL)}語を歩ききりました。`;

    const walker = el("div", { class: "vgHedgehog", "aria-hidden": "true", "data-walking": learned > 0 ? "1" : "" },
      el("span", { class: "vgHedgehogSprite" }));
    // ハリネズミは中央基準で置くため、0語・満了時に端からはみ出さないよう左右を12pxで止める。
    walker.style.left = `clamp(12px, ${pct(learned)}, calc(100% - 12px))`;

    const fill = el("div", { class: "vgFill" });
    fill.style.width = learned > 0 ? `max(3px, ${pct(learned)})` : "0";

    const track = el("div", {
      class: "vgTrack",
      role: "progressbar",
      "aria-valuemin": "0",
      "aria-valuemax": String(VOCAB_GOAL_TOTAL),
      "aria-valuenow": String(learned),
      "aria-valuetext": `目標${num(VOCAB_GOAL_TOTAL)}語のうち、文中問題まで進んだ語は${num(learned)}語です。`,
    }, fill, walker);

    const ticks = el("div", { class: "vgTicks" });
    [0, 200, 400, VOCAB_GOAL_TOTAL].forEach((value, index, all) => {
      const tick = el("span", { class: `vgTick${index === 0 ? " vgTick--start" : index === all.length - 1 ? " vgTick--end" : ""}` }, num(value));
      if (index > 0 && index < all.length - 1) tick.style.left = pct(value);
      ticks.appendChild(tick);
    });

    return el("section", { class: "card vocabGoal", "aria-labelledby": "vocabGoalTitle" },
      studyPlanPanel(),
      el("div", { class: "vgHead" },
        el("div", {},
          el("p", { class: "label" }, "語彙の目標"),
          el("h2", { id: "vocabGoalTitle" }, `古文単語 ${num(VOCAB_GOAL_TOTAL)}語`),
        ),
        el("p", { class: "vgCount" },
          el("strong", {}, num(learned)),
          el("span", {}, ` 語 / ${num(VOCAB_GOAL_TOTAL)}語`)),
      ),
      el("div", { class: "vgBar" }, track, ticks),
      el("p", { class: "vgMessage" }, message),
      vocabForecastDetails(learned),
    );
  }

  function meaningMission() {
    const pool = reviewPoolEntries();
    const learned = learnedMeaningEntries();
    const due = dueMeaningEntries();
    if (!learned.length) {
      return el("section", { class: "card meaningMission meaningMission--empty" },
        el("p", { class: "label" }, "間隔復習"),
        el("h2", {}, "意味だけ復習"),
        el("p", { class: "hint" }, "通常学習で文中問題まで解いた語が対象になります。"),
        el("p", { class: "meaningMissionEmptyCount" }, `対象 0 / ${pool.length}語`),
      );
    }
    const counts = Object.fromEntries(KobunSrs.labels.map((label) => [label, 0]));
    learned.forEach(({ word, progress }) => counts[KobunSrs.label(progress.items?.[word.id])]++);
    const section = el("section", { class: "card meaningMission" },
      el("p", { class: "label" }, "間隔復習"),
      el("h2", {}, "意味だけ復習"),
      el("p", { class: "lead" }, `全セットの文中問題まで回答した語を、1回最大${MEANING_SESSION_SIZE}語で復習します。次に出す日は語ごとに計算され、正解を重ねるほど間隔が伸びます。`),
      el("div", { class: "meaningMetrics" },
        stat(learned.length, pool.length, "対象語"),
        stat(due.length, learned.length || pool.length, "今すぐ復習"),
      ),
    );
    section.appendChild(el("div", { class: "intervalGrid", "aria-label": "意味復習の間隔別内訳" },
      ...KobunSrs.labels.map((label) => el("div", { class: "intervalCell" }, el("strong", {}, counts[label]), el("span", {}, label))),
    ));
    if (state.progress.resume) {
      section.appendChild(el("p", { class: "hint" }, "通常学習の続きがあるため、先に再開するのがおすすめです。"));
    }
    const button = el("button", { class: "cta reviewCta", disabled: !due.length, onclick: startMeaningReview },
      due.length ? `今回の${Math.min(due.length, MEANING_SESSION_SIZE)}語を復習する` : "今すぐ復習する語はありません",
    );
    if (state.progress.resume) button.className = "ghost secondaryCta";
    section.appendChild(button);
    return section;
  }

  // 選択肢なしで思い出す。間隔復習とは別に、学習済みの語から毎日 RECALL_DAILY_QUOTA 問を出す。
  const RECALL_DAILY_QUOTA = KobunRecallGrade.DAILY_QUOTA;
  const recallTodayCount = () => KobunRecallGrade.countToday(progressSources().map(({ progress }) => progress.history));
  const recallRemaining = () => Math.max(0, RECALL_DAILY_QUOTA - recallTodayCount());

  function recallMission() {
    const learned = learnedMeaningEntries();
    const today = recallTodayCount();
    const remaining = Math.max(0, RECALL_DAILY_QUOTA - today);
    const section = el("section", { class: "card recallMission" },
      el("p", { class: "label" }, "毎日のノルマ"),
      el("h2", {}, "選択肢なしで思い出す"),
      el("p", { class: "lead" }, `学習済みの語から、毎日${RECALL_DAILY_QUOTA}問を4択なしで出します。間隔復習とは別枠で、結果は次の復習日に影響しません。学習済みの語からランダムに出し、今日まだ出していない語を先に出します。`),
      el("div", { class: "meaningMetrics" },
        stat(Math.min(today, RECALL_DAILY_QUOTA), RECALL_DAILY_QUOTA, remaining ? "今日の回答" : "今日の回答（達成）"),
        stat(learned.length, reviewPoolEntries().length, "出題対象"),
      ),
    );
    if (!learned.length) {
      section.appendChild(el("p", { class: "hint" }, "通常学習で文中問題まで解いた語が対象になります。"));
      section.appendChild(el("button", { class: "cta reviewCta", disabled: true }, "出題できる語はまだありません"));
      return section;
    }
    section.appendChild(el("p", { class: "recallQuotaStatus" }, remaining ? `今日の残り ${remaining}問` : "今日のノルマを達成しました"));
    const resume = state.progress.resume;
    // 思い出す問題の途中保存があれば、新しく始めずに続きへつなぐ（新しく始めると途中保存を捨ててしまう）。
    if (resume?.mode === "recallReview") {
      const left = resume.stage === "recall" ? (resume.meaningOrder || []).length - Number(resume.meaningIndex || 0) : 0;
      section.appendChild(el("button", { class: "ghost secondaryCta", onclick: restoreSession },
        left > 0 ? `続きから解く（あと${left}問）` : "続きから再開する（誤答確認）",
      ));
      return section;
    }
    const size = Math.min(remaining || RECALL_DAILY_QUOTA, learned.length);
    if (size < (remaining || RECALL_DAILY_QUOTA)) {
      section.appendChild(el("p", { class: "hint" }, `学習済みが${learned.length}語のため、1回${size}問です。`));
    }
    // 途中保存は1枠なので、ここで始めると別の学習の続きが消える。押す前に分かるようにする。
    if (resume) section.appendChild(el("p", { class: "hint" }, "別の学習の途中保存があります。ここで始めると、その途中保存は消えます。"));
    const button = el("button", { class: "cta reviewCta", onclick: startRecallReview },
      remaining ? `${size}問を解く` : `追加で${size}問解く`,
    );
    if (resume || !remaining) button.className = "ghost secondaryCta";
    section.appendChild(button);
    return section;
  }

  // 歌の間（試験公開）。読み込み済みの全セットから、例文として表示される和歌を集める。
  // 試験機能なので、モジュールや表示先が無い環境（検査用の擬似DOMなど）では入口を出さない。
  const hasWakaGallery = () => typeof KobunWakaGallery !== "undefined" && Boolean($("#wakaPanel"));

  function wakaPoems() {
    return KobunWakaGallery.collect(setSources()
      .filter((source) => source.set)
      .map((source) => ({ setId: source.setId, set: source.set, label: source.entry.label })));
  }

  // 文法解説（試作）は歌の間を開いたときに一度だけ読む。読めなければ文法の層を出さずに開く。
  let wakaGrammar;
  async function loadWakaGrammar() {
    if (wakaGrammar !== undefined) return wakaGrammar;
    try {
      const data = await fetch(WAKA_GRAMMAR_URL, { cache: "no-store" }).then((response) => {
        if (!response.ok) throw new Error(`waka grammar: HTTP ${response.status}`);
        return response.json();
      });
      wakaGrammar = { rules: data.rules || {}, byKey: new Map(data.poems.map((poem) => [poem.key, poem])) };
    } catch (error) {
      console.error(error);
      wakaGrammar = null;
    }
    return wakaGrammar;
  }

  async function openWakaGallery(initialKey = null) {
    const grammar = await loadWakaGrammar();
    $("#homePanel").classList.add("hide");
    $("#sessionPanel").classList.add("hide");
    const panel = $("#wakaPanel");
    panel.classList.remove("hide");
    KobunWakaGallery.render(panel, wakaPoems(), {
      initialKey,
      grammar,
      onClose: () => {
        renderHome();
        $("#homePanel .wgTeaser")?.scrollIntoView({ block: "center" });
        $("#homePanel .wgTeaser .wgButton--gold")?.focus({ preventScroll: true });
      },
    });
    window.scrollTo({ top: 0 });
  }

  function setSources() {
    const poolBySetId = new Map(state.reviewPool.map((source) => [source.setId, source]));
    return Object.entries(state.manifest.sets).map(([setId, entry]) => {
      if (setId === state.setId) return { setId, entry, set: state.set, progress: state.progress };
      const source = poolBySetId.get(setId);
      return { setId, entry, set: source?.set || null, progress: source?.progress || null };
    });
  }

  function nextSetId(currentSetId) {
    const ids = Object.keys(state.manifest.sets);
    const index = ids.indexOf(currentSetId);
    if (index < 0 || index >= ids.length - 1) return null;
    return ids[index + 1];
  }

  function nextUnclearedSetId(currentSetId) {
    const ids = Object.keys(state.manifest.sets);
    const index = ids.indexOf(currentSetId);
    if (index < 0) return null;
    for (const setId of ids.slice(index + 1)) {
      const source = state.reviewPool.find((entry) => entry.setId === setId);
      if (source && KobunSetProgress.summarize(source.set, source.progress).key !== "cleared") return setId;
    }
    return null;
  }

  function showAllSetsHome() {
    renderHome();
    const picker = $(".setPicker");
    if (picker) {
      picker.open = true;
      picker.scrollIntoView({ block: "start" });
    }
  }

  function setPicker() {
    const sources = setSources();
    const current = sources.find((source) => source.setId === state.setId);
    const currentSummary = KobunSetProgress.summarize(current.set, current.progress);
    const aggregateSummary = KobunSetProgress.aggregate(sources.map(({ set, progress }) => ({ set, progress })));
    const overallParts = [`全${aggregateSummary.totalSets}セット・CLEAR ${aggregateSummary.clearedSets}・学習中 ${aggregateSummary.inProgressSets}`];
    if (aggregateSummary.reviewSets > 0) overallParts.push(`要復習 ${aggregateSummary.reviewSets}`);
    const details = el("details", { class: "setPicker" },
      el("summary", { class: "setPickerSummary" },
        el("span", { class: "setPickerInfo" },
          el("span", { class: "setPickerLabel" }, "学習セット"),
          el("strong", {}, current.entry.label),
          el("span", { class: "setPickerSummaryMeta" }, `${currentSummary.label}・文中回答済み ${currentSummary.learnedCount} / ${currentSummary.total}語`),
          el("span", { class: "setPickerOverallMeta" }, overallParts.join("・")),
        ),
        el("span", { class: "setPickerAction" },
          "変更する",
          el("span", { class: "setPickerCaret", "aria-hidden": "true" }, "▾"),
        ),
      ),
    );
    const list = el("div", { class: "setList", "aria-label": "学習セット一覧" });
    sources.forEach(({ setId, entry, set, progress }, index) => {
      const isCurrent = setId === state.setId;
      const summary = set ? KobunSetProgress.summarize(set, progress) : null;
      const total = summary?.total || 0;
      const learned = summary?.learnedCount || 0;
      const percent = total > 0 ? Math.round((learned / total) * 100) : 0;
      list.appendChild(el("button", {
        class: `setOption${isCurrent ? " setOption--current" : ""}`,
        type: "button",
        "aria-current": isCurrent ? "true" : null,
        onclick: () => { if (isCurrent) return; switchSet(setId, details); },
      },
        el("span", { class: "setUnitNumber" }, String(index + 1).padStart(2, "0")),
        el("span", { class: "setUnitBody" },
          el("span", { class: "setOptionTop" },
            el("span", { class: "setOptionName" }, entry.label),
            el("span", { class: `setOptionState setOptionState--${summary ? summary.key : "untouched"}` }, summary ? summary.label : "未着手"),
          ),
          isCurrent ? el("span", { class: "setOptionCurrent" }, "選択中") : null,
          el("span", { class: "setOptionMeta" }, summary ? `文中回答済み ${summary.learnedCount} / ${summary.total}語・${summary.detail}` : "—"),
          el("span", { class: "setOptionProgress", "aria-hidden": "true" },
            el("span", { class: "setOptionProgressFill", style: `width:${percent}%` }),
          ),
        ),
        el("span", { class: "setUnitArrow", "aria-hidden": "true" }, "→"),
      ));
    });
    details.appendChild(list);
    return details;
  }

  function stat(value, total, label, opts = {}) {
    return el("div", { class: `stat${opts.secondary ? " stat--secondary" : ""}` },
      el("strong", {}, value, el("small", {}, ` / ${total}`)),
      el("span", {}, label),
    );
  }

  function createLearnSession(batchIndexOverride = null) {
    const ids = state.set.words.map((word) => word.id);
    const batchCount = Math.ceil(ids.length / BATCH_SIZE);
    let batchIndex;
    if (batchIndexOverride == null) {
      const firstUnlearned = ids.findIndex((id) => !unit(id).learned);
      batchIndex = firstUnlearned < 0 ? 0 : Math.floor(firstUnlearned / BATCH_SIZE);
    } else {
      batchIndex = Math.min(Math.max(batchIndexOverride, 0), Math.max(batchCount - 1, 0));
    }
    const batchIds = ids.slice(batchIndex * BATCH_SIZE, (batchIndex + 1) * BATCH_SIZE);
    return {
      mode: "learn", stage: "flash", order: ids, index: 0,
      batchIndex, batchCount,
      meaningOrder: shuffle(batchIds), meaningIndex: 0, meaningCorrect: 0,
      contextOrder: shuffle(ids.slice(batchIndex * BATCH_SIZE)), contextIndex: 0, contextCorrect: 0,
      wrongMeaningIds: [], reviewedIds: [], answered: false, choices: null,
    };
  }

  function startLearn(batchIndexOverride = null) {
    session = createLearnSession(batchIndexOverride);
    lastStepKey = stepKey();
    renderSession();
  }

  function startReview() {
    const ids = reviewIds();
    if (!ids.length) return renderHome();
    session = { mode: "review", stage: "context", contextOrder: ids, contextIndex: 0, contextCorrect: 0, answered: false, choices: null };
    lastStepKey = stepKey();
    renderSession();
  }

  function startMeaningReview() {
    const ids = shuffle(dueMeaningEntries())
      .sort((a, b) => (b.progress.items?.[b.word.id]?.wrongCount || 0) - (a.progress.items?.[a.word.id]?.wrongCount || 0))
      .slice(0, MEANING_SESSION_SIZE)
      .map((entry) => entry.key);
    if (!ids.length) return renderHome();
    session = {
      mode: "meaningReview", stage: "meaning", meaningOrder: ids, meaningIndex: 0,
      meaningCorrect: 0, wrongMeaningIds: [], reviewedIds: [], answered: false, choices: null,
    };
    lastStepKey = stepKey();
    renderSession();
  }

  // 思い出して書く復習。間隔復習（FSRS）とは独立で、期限に関係なく学習済みの語から出す。
  // 1回の問題数は今日のノルマの残り（達成後は追加の1回分）。記録は progress.recall に分けて持つ。
  // meaningOrder などの名前を流用するのは、wordForSession と renderWrongReview をそのまま使うため。
  function startRecallReview() {
    const size = recallRemaining() || RECALL_DAILY_QUOTA;
    const ids = KobunRecallGrade.pickWords(
      learnedMeaningEntries().map((entry) => ({ key: entry.key, stat: entry.progress.recall?.[entry.word.id] })),
      size,
    );
    if (!ids.length) return renderHome();
    session = {
      mode: "recallReview", stage: "recall", meaningOrder: ids, meaningIndex: 0, extraAfterQuota: recallRemaining() === 0,
      meaningCorrect: 0, wrongMeaningIds: [], reviewedIds: [], confidentMissIds: [],
      ...freshRecallQuestion(),
    };
    lastStepKey = stepKey();
    renderSession();
  }

  function freshRecallQuestion() {
    return {
      phase: "ask", confidence: null, hintUsed: false, typed: "", recallRating: null, confidentMiss: false, confidenceMs: null, askedAt: null,
      // Jev の自動採点。ai は判定結果、aiAutoGrade は自動採用して「次へ」で記録する予定の採点。
      aiPending: false, ai: null, aiFailed: false, aiAutoGrade: null, aiOverridden: false,
    };
  }

  const isPoolReview = () => session?.mode === "meaningReview" || session?.mode === "recallReview";

  function restoreSession() {
    session = JSON.parse(JSON.stringify(state.progress.resume));
    lastStepKey = stepKey();
    renderSession();
  }

  function renderSession() {
    saveResume();
    $(".wrap")?.classList.add("sessionActive");
    $("#homePanel").classList.add("hide");
    $("#wakaPanel")?.classList.add("hide");
    const panel = $("#sessionPanel");
    panel.classList.remove("hide");
    panel.innerHTML = "";

    const sessionHead = el("div", { class: "sessionHead" },
      el("div", {},
       el("p", { class: "label" }, sessionLabel()),
       el("h2", {}, stageTitle()),
      ),
    );
    if (session.stage !== "done") sessionHead.appendChild(el("button", { class: "ghost", onclick: () => { saveResume(); renderHome(); } }, "一覧へ戻る"));
    panel.appendChild(sessionHead);
    panel.appendChild(stepBar());

    if (session.stage === "flash") renderFlash(panel);
    else if (session.stage === "meaning") renderQuiz(panel, "meaning");
    else if (session.stage === "recall") renderRecall(panel);
    else if (session.stage === "wrongReview") renderWrongReview(panel);
    else if (session.stage === "context") renderQuiz(panel, "context");
    else renderDone(panel);
  }

  function sessionLabel() {
    if (session.stage === "flash") return `暗記カード ${session.index + 1} / ${currentBatchIds().length}・第${session.batchIndex + 1} / ${session.batchCount}ブロック`;
    if (session.stage === "meaning") {
      if (session.mode === "meaningReview") return `意味だけ復習 ${session.meaningIndex + 1} / ${session.meaningOrder.length}`;
      const block = session.mode === "learn" ? `・第${session.batchIndex + 1} / ${session.batchCount}ブロック` : "";
      return `意味確認 ${session.meaningIndex + 1} / ${session.meaningOrder.length}${block}`;
    }
    if (session.stage === "recall") return `思い出して復習 ${session.meaningIndex + 1} / ${session.meaningOrder.length}`;
    if (session.stage === "context") return `文中問題 ${session.contextIndex + 1} / ${session.contextOrder.length}`;
    if (session.stage === "wrongReview") {
      const total = session.wrongMeaningIds.length;
      return `誤答確認 ${Math.min(session.reviewedIds.length + 1, total)} / ${total}`;
    }
    return "学習結果";
  }

  function stageTitle() {
    if (session.mode === "review") return "間違えた語を解き直す";
    if (session.mode === "meaningReview") return session.stage === "done" ? "意味だけ復習完了" : session.stage === "wrongReview" ? "間違えた語を確認" : "意味だけ復習";
    if (session.mode === "recallReview") return session.stage === "done" ? "思い出して復習完了" : session.stage === "wrongReview" ? "間違えた語を確認" : "選択肢なしで思い出す";
    return {
      flash: `STEP 1　覚える（第${session.batchIndex + 1}ブロック）`,
      meaning: `STEP 2　確かめる（第${session.batchIndex + 1}ブロック）`,
      wrongReview: "間違えた語を確認",
      context: "STEP 3　文中で解く",
      done: "セット完了",
    }[session.stage];
  }

  function stepKey() {
    return `${session.mode}:${session.stage}:${session.batchIndex ?? ""}`;
  }

  function stepBar() {
    const steps = session.mode === "learn" ? ["flash", "meaning", "wrongReview", "context"]
      : session.mode === "meaningReview" ? ["meaning", "wrongReview"]
        : session.mode === "recallReview" ? ["recall", "wrongReview"]
          : ["context"];
    const block = session.mode === "learn" ? ` ${session.batchIndex + 1}/${session.batchCount}` : "";
    const labels = { flash: `1 覚える${block}`, meaning: session.mode === "meaningReview" ? "意味だけ復習" : `2 確かめる${block}`, wrongReview: "必要なら復習", context: "3 解く", recall: "思い出す" };
    const current = steps.indexOf(session.stage);
    const key = stepKey();
    const changed = key !== lastStepKey;
    lastStepKey = key;
    return el("div", { class: "stepBar", "aria-label": "学習ステップ" }, ...steps.map((step, index) => {
      const isActive = step === session.stage;
      const isCleared = !isActive && (index < current || session.stage === "done");
      return el("span", {
        class: `step ${isActive ? "active" : isCleared ? "cleared" : ""}${isActive && changed ? " is-settling" : ""}`,
        "aria-current": isActive ? "step" : null,
        "aria-label": isCleared ? `${labels[step]}・完了` : null,
      }, labels[step]);
    }));
  }

  function wordCard(word, { flashCounter = "" } = {}) {
    const wakaMeta = isWaka(word)
      ? el("span", { class: "wakaMeta" },
        el("span", { class: "wakaAuthor" }, `作者：${word.waka.author}`),
        el("span", { class: "wakaRef" }, `出典箇所：${wakaRefText(word)}`),
      )
      : null;
    return el("article", { class: "flashCard" },
      el("div", { class: "flashHead" },
        el("div", { class: "flashTitle" },
          el("span", { class: "headword" }, word.headword),
          el("span", { class: "kanji" }, `【${word.kanji}】`),
        ),
        flashCounter ? el("span", { class: "flashCounter" }, flashCounter) : null,
      ),
      el("div", { class: "flashBody" },
        el("section", {}, el("h3", {}, "意味"), ...word.meanings.map((meaning) => el("p", {}, meaning))),
        word.notes?.length
          ? el("section", { class: "flashNotes" }, el("h3", {}, "解説・補足"), el("ul", {}, ...word.notes.map((note) => el("li", {}, note))))
          : null,
        el("section", {},
          el("h3", {}, isWaka(word) ? "和歌　" : "例文　", `『${word.source}』`, wakaMeta),
          el("p", { class: exampleClass(word, "example") }, exampleBody(word)),
        ),
        el("section", {}, el("h3", {}, "例文の訳"), el("p", {}, word.translation)),
      ),
    );
  }

  function currentBatchIds() {
    const start = session.batchIndex * BATCH_SIZE;
    return session.order.slice(start, start + BATCH_SIZE);
  }

  function renderFlash(panel) {
    const batchIds = currentBatchIds();
    const word = wordById(batchIds[session.index]);
    panel.appendChild(wordCard(word, { flashCounter: `カード ${session.index + 1} / ${batchIds.length}・第${session.batchIndex + 1} / ${session.batchCount}ブロック` }));
    const last = session.index === batchIds.length - 1;
    panel.appendChild(el("div", { class: "actions" },
      el("button", { class: "ghost", disabled: !session.index, onclick: () => { if (session.index) { session.index--; renderSession(); } } }, "← 前の語"),
      el("button", { class: "cta", onclick: () => {
        if (last) {
          session.stage = "meaning";
          session.meaningOrder = shuffle(batchIds);
          session.meaningIndex = 0;
          session.answered = false;
          session.choices = null;
        }
        else session.index++;
        renderSession();
      } }, last ? "意味チェックへ →" : "次の語 →"),
    ));
  }

  /* 解答直後に、その問題の解答時間と前回までの平均を出す。
     間隔の伸び方が解答時間で変わるため、何が測られているかを見せる。
     測れなかった回（中断・再開で60秒超）は何も出さない。 */
  function responseTimeNote() {
    if (session.mode !== "meaningReview") return null;
    const elapsed = session.lastElapsedMs;
    if (!Number.isFinite(elapsed)) return null;
    const average = session.prevAvgMs;
    const compare = Number.isFinite(average) ? `（前回までの平均 ${(average / 1000).toFixed(1)} 秒）` : "";
    return el("p", { class: "hint responseTimeNote" }, `出題から ${(elapsed / 1000).toFixed(1)} 秒で解答${compare}`);
  }

  function renderQuiz(panel, kind) {
    const order = kind === "meaning" ? session.meaningOrder : session.contextOrder;
    const index = kind === "meaning" ? session.meaningIndex : session.contextIndex;
    const word = wordForSession(order[index]);
    const isMeaningExample = kind === "meaning";
    const correct = kind === "meaning" ? meaningText(word) : word.headword;
    if (!session.choices || (kind === "meaning" && !meaningChoicesAreSafe(word, session.choices))) {
      session.choices = choiceSet(word, kind);
    }

    const entryKey = `${session.mode}:${kind}:${order[index]}`;
    const isNewEntry = entryKey !== lastQuizEntryKey;
    lastQuizEntryKey = entryKey;
    // 解答時間の起点は「問題が出た瞬間」。同じ問題の再描画では測り直さない。
    if (!session.answered && isNewEntry) {
      session.askedAt = Date.now();
      // 前の問題の計測値をフィードバックへ持ち越さない。
      session.lastElapsedMs = null;
      session.prevAvgMs = null;
    }

    const box = el("section", { class: `quiz${session.answered ? " quiz--answered" : ""}${!session.answered && isNewEntry ? " is-entering" : ""}` },
      el("p", { class: "label" }, isMeaningExample ? "傍線部の意味として最も適当なものを選べ" : "空欄に入る語の基本形は？"),
      isMeaningExample ? el("p", { class: "questionSource" }, `出典：『${word.source}』`) : null,
      isMeaningExample
        ? el("p", { class: exampleClass(word, "meaningExample"), tabindex: "-1" }, exampleBody(word, { underline: true }))
        : el("p", { class: exampleClass(word, "cloze"), tabindex: "-1" }, exampleBody(word, { blank: true })),
      kind === "context" ? el("p", { class: "questionTranslation" }, `現代語訳：${word.translation}`) : null,
    );
    const choices = el("div", { class: "choices" });
    session.choices.forEach((choice, choiceIndex) => {
      const button = el("button", { class: "choice" },
        el("span", { class: "choiceNo" }, choiceIndex + 1),
        el("span", {}, choice),
      );
      if (session.answered) {
        button.disabled = true;
        if (choice === correct) button.classList.add("correct");
        else if (choice === session.picked) button.classList.add("wrong");
      }
      button.addEventListener("click", () => answerQuiz(kind, choice, correct));
      choices.appendChild(button);
    });
    box.appendChild(choices);
    if (session.answered) {
      const isCorrect = session.picked === correct;
      box.appendChild(el("div", { class: `feedback ${isCorrect ? "ok" : "ng"}`, role: "status", "aria-live": "polite", "aria-atomic": "true", tabindex: "-1" },
        el("div", { class: "feedbackSummary" },
          el("h3", {}, isCorrect ? "○ 正解" : "× 不正解"),
          el("p", {}, `${word.headword}【${word.kanji}】：${meaningText(word)}`),
        ),
        el("div", { class: "quizNextAction" },
          el("button", { class: "cta next", onclick: () => nextQuiz(kind) }, index === order.length - 1 ? "次へ →" : "次の問題 →"),
        ),
        el("div", { class: "feedbackDetails" },
          isMeaningExample ? el("p", { class: exampleClass(word, "meaningExample") }, exampleBody(word, { underline: true })) : null,
          isMeaningExample ? el("p", { class: "meaningExampleTranslation" }, `現代語訳：${word.translation}`) : null,
          kind === "context" ? el("p", { class: exampleClass(word, "example") }, exampleBody(word)) : null,
          responseTimeNote(),
        ),
      ));
    }
    panel.appendChild(box);
  }

  function answerQuiz(kind, picked, correct) {
    if (session.answered) return;
    session.answered = true;
    session.picked = picked;
    const isCorrect = picked === correct;
    const index = kind === "meaning" ? session.meaningIndex : session.contextIndex;
    const id = (kind === "meaning" ? session.meaningOrder : session.contextOrder)[index];

    if (kind === "meaning") {
      if (isCorrect) session.meaningCorrect++;
      else if (!session.wrongMeaningIds.includes(id)) session.wrongMeaningIds.push(id);
      if (session.mode === "meaningReview") {
        const entry = reviewEntryByKey(id);
        const progress = entry?.progress || state.progress;
        const wordId = entry?.word.id || id;
        progress.items = progress.items || {};
        // 中断・再開で伸びた計測は measuredMs が捨てる。中央値はその回の正解ぶんだけで作る。
        const elapsedMs = KobunSrs.measuredMs(Date.now() - (session.askedAt || 0));
        // 表示用。平均は record が更新する前の値（＝前回までの平均）を控える。
        session.lastElapsedMs = elapsedMs;
        session.prevAvgMs = KobunSrs.normalize(progress.items[wordId]).avgMs;
        progress.items[wordId] = KobunSrs.record(progress.items[wordId], isCorrect, new Date(), {
          elapsedMs,
          medianMs: KobunSrs.medianMs(session.rtLog || []),
        });
        if (isCorrect && elapsedMs !== null) (session.rtLog || (session.rtLog = [])).push(elapsedMs);
        appendHistory({ kind: "meaning", wordId, result: isCorrect ? "correct" : "wrong" }, progress);
        saveProgressFor(entry?.setId || state.setId, progress);
      }
    } else {
      if (isCorrect) session.contextCorrect++;
      const u = unit(id);
      u.learned = true;
      u.solvedCorrect = isCorrect;
      u.needsReview = !isCorrect;
      const answeredAt = new Date().toISOString();
      if (!isValidIsoDate(u.firstAnsweredAt)) u.firstAnsweredAt = answeredAt;
      u.lastAnsweredAt = answeredAt;
      appendHistory({ kind: "question", wordId: id, result: isCorrect ? "correct" : "wrong" });
      saveProgress();
    }
    renderSession();
    const feedback = $(".feedback");
    feedback?.focus({ preventScroll: true });
    feedback?.scrollIntoView({ block: "nearest" });
  }

  function nextQuiz(kind) {
    const order = kind === "meaning" ? session.meaningOrder : session.contextOrder;
    const indexKey = kind === "meaning" ? "meaningIndex" : "contextIndex";
    const last = session[indexKey] === order.length - 1;
    session.answered = false;
    session.picked = null;
    session.choices = null;
    if (!last) session[indexKey]++;
    else if (kind === "meaning" && session.mode === "learn" && session.batchIndex < session.batchCount - 1) {
      session.batchIndex++;
      session.index = 0;
      session.meaningIndex = 0;
      session.meaningOrder = shuffle(currentBatchIds());
      session.stage = "flash";
    } else if (kind === "meaning" && session.wrongMeaningIds.length) session.stage = "wrongReview";
    else if (kind === "meaning") session.stage = session.mode === "meaningReview" ? "done" : "context";
    else session.stage = "done";
    renderSession();
    $(".askWord, .meaningExample, .cloze")?.focus({ preventScroll: true });
  }

  const RECALL_CONFIDENCE = [
    ["sure", "言える（自信あり）"],
    ["maybe", "たぶん"],
    ["blank", "思い出せない"],
  ];
  const RECALL_SELF_GRADE = [
    ["correct", "合っていた"],
    ["partial", "一部だけ"],
    ["wrong", "違った"],
  ];
  const RECALL_RESULT = {
    good: "思い出せました。",
    hard: "あいまいでした。",
    again: "このあと誤答確認で読み直します。",
  };

  function recallChoiceButton(className, number, label, onclick) {
    return el("button", { class: `choice ${className}`, type: "button", onclick },
      el("span", { class: "choiceNo" }, number),
      el("span", {}, label),
    );
  }

  // 読み（見出し語）が同じ語が全セットに2語以上あるか。
  function isHomograph(word) {
    return reviewPoolEntries().filter((entry) => entry.word.headword === word.headword).length > 1;
  }

  function renderRecall(panel) {
    const key = session.meaningOrder[session.meaningIndex];
    const word = wordForSession(key);
    const entryKey = `recallReview:recall:${key}`;
    const isNewEntry = entryKey !== lastQuizEntryKey;
    lastQuizEntryKey = entryKey;
    // 解答時間の起点は問題が出た瞬間。同じ問題の再描画（ヒント表示など）では測り直さない。
    if (session.phase === "ask" && (isNewEntry || !session.askedAt)) session.askedAt = Date.now();

    const box = el("section", { class: `quiz recall${session.phase !== "ask" ? " quiz--answered" : ""}${session.phase === "ask" && isNewEntry ? " is-entering" : ""}` });
    if (session.phase === "ask") {
      box.appendChild(el("p", { class: "label" }, "この語の意味を思い出してください"));
      // 漢字表記は意味の手掛かりになりすぎるため、答えを見るまで出さない。
      box.appendChild(el("p", { class: "askWord recallHeadword", tabindex: "-1" }, word.headword));
      // 同じ読みの語がある語は、読みだけでは問いが決まらない。例文を最初から出し、ヒント扱いにはしない。
      const homograph = isHomograph(word);
      if (homograph) {
        box.appendChild(el("div", { class: "recallHint recallHomograph" },
          el("p", { class: "label" }, `同じ読みの語があります。この例文での意味を答えてください（『${word.source}』）`),
          el("p", { class: exampleClass(word, "meaningExample") }, exampleBody(word, { underline: true })),
        ));
      }
      const input = el("input", {
        class: "recallInput",
        type: "text",
        id: "recallInput",
        autocomplete: "off",
        placeholder: "書かずに思い浮かべるだけでもよい",
      });
      input.value = session.typed || "";
      input.addEventListener("input", () => { session.typed = input.value; });
      input.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" || event.isComposing || event.keyCode === 229) return;
        event.preventDefault();
        $(".recallConfidence .choice")?.focus();
      });
      box.appendChild(el("label", { class: "recallInputLabel", for: "recallInput" }, "意味を書いてみる（任意）"));
      box.appendChild(input);
      // 同じ読みの語は例文を見出し語の下に出しているので、ヒントの出し入れはしない。
      if (!homograph && session.hintUsed) {
        box.appendChild(el("div", { class: "recallHint" },
          el("p", { class: "label" }, `ヒント：『${word.source}』`),
          el("p", { class: exampleClass(word, "meaningExample") }, exampleBody(word, { underline: true })),
        ));
      } else if (!homograph) {
        box.appendChild(el("button", { class: "ghost recallHintButton", type: "button", onclick: () => {
          session.hintUsed = true;
          renderSession();
          $(".recallConfidence .choice")?.focus({ preventScroll: true });
        } }, "例文をヒントに見る"));
      }
      box.appendChild(el("p", { class: "recallPrompt" }, "答えを見る前に、どのくらい言えるかを選んでください。"));
      box.appendChild(el("div", { class: "choices recallConfidence" },
        ...RECALL_CONFIDENCE.map(([value, label], index) => recallChoiceButton("confidenceChoice", index + 1, label, () => chooseRecallConfidence(value))),
      ));
      panel.appendChild(box);
      return;
    }

    const answer = el("div", { class: "recallAnswer" });
    if (session.typed?.trim()) {
      answer.appendChild(el("p", { class: "recallTyped" }, el("span", { class: "label" }, "あなたの答え"), el("span", {}, session.typed.trim())));
    }
    answer.appendChild(wordCard(word));
    if (session.phase === "revealed") {
      // 途中保存から戻ったときは通信が残っていないので、採点中の表示を出さない。
      if (session.aiPending && recallAiToken !== recallToken()) session.aiPending = false;
      box.appendChild(el("p", { class: "label" }, "答え合わせ"));
      box.appendChild(answer);
      const aiNote = recallAiNote();
      if (aiNote) box.appendChild(aiNote);
      box.appendChild(el("p", { class: "recallPrompt" }, "自分の答えと比べて、当てはまるものを選んでください。"));
      box.appendChild(el("div", { class: "choices recallSelfGrade" },
        ...RECALL_SELF_GRADE.map(([value, label], index) => {
          const button = recallChoiceButton("selfGradeChoice", index + 1, label, () => answerRecall(value));
          if (session.ai?.grade === value) {
            button.classList.add("is-aiSuggested");
            button.appendChild(el("span", { class: "aiSuggestedTag" }, "Jev"));
          }
          return button;
        }),
      ));
      panel.appendChild(box);
      return;
    }

    // graded
    const isOk = session.recallRating !== "again";
    box.appendChild(el("div", { class: `feedback ${isOk ? "ok" : "ng"}`, role: "status", "aria-live": "polite", "aria-atomic": "true", tabindex: "-1" },
      el("div", { class: "feedbackSummary" },
        el("h3", {}, isOk ? (session.recallRating === "good" ? "○ 思い出せた" : "△ あいまい") : "× 思い出せなかった"),
        el("p", {}, RECALL_RESULT[session.recallRating] || RECALL_RESULT.again),
      ),
      session.confidentMiss
        ? el("p", { class: "recallConfidentMiss" }, "自信があったのに違った語です。解説をもう一度読みましょう。")
        : null,
      session.aiAutoGrade
        ? el("div", { class: "recallAiGraded" },
          el("p", {}, `Jev が「${recallSelfGradeLabel(session.aiAutoGrade)}」と採点しました。`),
          el("button", { class: "ghost recallRegrade", type: "button", onclick: overrideAiGrade }, "採点を直す"),
        )
        : null,
      el("div", { class: "quizNextAction" },
        el("button", { class: "cta next", onclick: nextRecall }, session.meaningIndex === session.meaningOrder.length - 1 ? "次へ →" : "次の問題 →"),
      ),
    ));
    box.appendChild(answer);
    panel.appendChild(box);
  }

  function chooseRecallConfidence(confidence) {
    if (session.phase !== "ask") return;
    session.confidence = confidence;
    session.confidenceMs = KobunSrs.measuredMs(Date.now() - (session.askedAt || 0));
    if (confidence === "blank") return answerRecall(null);
    const typed = session.typed?.trim() || "";
    // 「わからない」などは Jev に送らず、違った扱いで自動採点する。
    if (typed && KobunRecallGrade.isNoAnswer(typed)) {
      session.ai = { grade: "wrong", confidence: 1, source: "rule" };
      return applyAiAutoGrade("wrong");
    }
    session.phase = "revealed";
    if (typed) requestAiGrade(typed);
    renderSession();
    $(".recallSelfGrade .choice")?.focus({ preventScroll: true });
  }

  // --- Jev の自動採点（試験版の Worker `/api/grade-recall`。無い環境では自己採点のまま） ---
  const RECALL_GRADE_URL = "api/grade-recall";
  const RECALL_GRADE_TIMEOUT_MS = 6000;
  let recallAiToken = null;
  const recallToken = () => session ? `${session.meaningIndex}:${session.meaningOrder[session.meaningIndex]}` : null;
  const recallSelfGradeLabel = (value) => RECALL_SELF_GRADE.find(([key]) => key === value)?.[1] || value;

  function recallAiNote() {
    if (session.aiPending) return el("p", { class: "recallAiNote", role: "status" }, "Jev が採点しています…（先に自分で選んでもかまいません）");
    if (session.aiOverridden) return el("p", { class: "recallAiNote" }, "自分で採点し直してください。");
    if (session.ai) return el("p", { class: "recallAiNote" }, `Jev の判定は「${recallSelfGradeLabel(session.ai.grade)}」ですが、確信が低いため自分で選んでください。`);
    if (session.aiFailed) return el("p", { class: "recallAiNote" }, "自動採点が使えなかったため、自分で選んでください。");
    return null;
  }

  async function requestAiGrade(typed) {
    if (typeof fetch !== "function") return;
    const token = recallToken();
    const key = session.meaningOrder[session.meaningIndex];
    const wordId = reviewEntryByKey(key)?.word.id || wordForSession(key)?.id || key;
    recallAiToken = token;
    session.aiPending = true;
    let result = null;
    try {
      const response = await fetch(RECALL_GRADE_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wordId, answer: typed }),
        signal: typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(RECALL_GRADE_TIMEOUT_MS) : undefined,
      });
      if (response.ok) result = await response.json();
    } catch {
      result = null;
    }
    // 返ってくる前に次の語へ進んだ・自分で採点した場合は捨てる。
    if (recallAiToken !== token || recallToken() !== token || session.phase !== "revealed") return;
    recallAiToken = null;
    session.aiPending = false;
    const decision = KobunRecallGrade.decideAiGrade(result);
    if (!decision.selfGrade) {
      session.aiFailed = true;
      return renderSession();
    }
    session.ai = { grade: result.grade, confidence: result.confidence, probabilities: result.probabilities, model: result.model, source: "jev" };
    if (decision.auto) return applyAiAutoGrade(decision.selfGrade);
    renderSession();
  }

  // 自動採点は画面に出すだけにして、記録は「次へ」で行う。「採点を直す」で取り消しても FSRS を巻き戻さずに済む。
  function applyAiAutoGrade(selfGrade) {
    session.aiAutoGrade = selfGrade;
    showRecallGrade(gradeForRecall(selfGrade));
  }

  function overrideAiGrade() {
    if (session.phase !== "graded" || !session.aiAutoGrade) return;
    session.aiAutoGrade = null;
    session.aiOverridden = true;
    session.phase = "revealed";
    renderSession();
    $(".recallSelfGrade .choice")?.focus({ preventScroll: true });
  }

  function gradeForRecall(selfGrade) {
    return KobunRecallGrade.gradeRecall({ confidence: session.confidence, selfGrade, hintUsed: session.hintUsed });
  }

  function answerRecall(selfGrade) {
    if (session.phase === "graded") return;
    recallAiToken = null;
    session.aiPending = false;
    const grade = commitRecall(selfGrade, "self");
    showRecallGrade(grade);
  }

  function commitRecall(selfGrade, gradedBy) {
    const key = session.meaningOrder[session.meaningIndex];
    const grade = gradeForRecall(selfGrade);
    const entry = reviewEntryByKey(key);
    const progress = entry?.progress || state.progress;
    const wordId = entry?.word.id || key;
    // 間隔復習の記録（progress.items）には触れない。
    progress.recall = progress.recall && typeof progress.recall === "object" && !Array.isArray(progress.recall) ? progress.recall : {};
    progress.recall[wordId] = KobunRecallGrade.recordStat(progress.recall[wordId], grade, new Date());
    // 自動採点のしきい値を後で見直せるよう、Jev の判定と自己採点の食い違いも残す。
    const aiFields = session.ai ? {
      answer: session.typed?.trim() || "",
      gradedBy,
      selfGrade,
      aiGrade: session.ai.grade,
      aiConfidence: Math.round(session.ai.confidence * 1000) / 1000,
      aiSource: session.ai.source,
      overridden: session.aiOverridden === true,
    } : {};
    appendHistory({ kind: "recall", wordId, result: grade.rating, confidence: session.confidence, hintUsed: session.hintUsed === true, ...aiFields }, progress);
    saveProgressFor(entry?.setId || state.setId, progress);

    if (grade.rating !== "again") session.meaningCorrect++;
    if (grade.toWrongReview && !session.wrongMeaningIds.includes(key)) session.wrongMeaningIds.push(key);
    if (grade.confidentMiss && !session.confidentMissIds.includes(key)) session.confidentMissIds.push(key);
    return grade;
  }

  function showRecallGrade(grade) {
    session.recallRating = grade.rating;
    session.confidentMiss = grade.confidentMiss;
    session.phase = "graded";
    renderSession();
    const feedback = $(".feedback");
    feedback?.focus({ preventScroll: true });
    feedback?.scrollIntoView({ block: "nearest" });
  }

  function nextRecall() {
    if (session.aiAutoGrade) commitRecall(session.aiAutoGrade, "ai");
    const last = session.meaningIndex === session.meaningOrder.length - 1;
    Object.assign(session, freshRecallQuestion());
    if (!last) session.meaningIndex++;
    else session.stage = session.wrongMeaningIds.length ? "wrongReview" : "done";
    renderSession();
    $(last ? ".reviewCard, .doneBanner h2" : ".recallHeadword")?.focus({ preventScroll: true });
  }

  function handleRecallKeydown(event) {
    if (event.repeat || event.isComposing || event.keyCode === 229) return;
    if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
    // 入力欄の Enter は入力欄側で扱う。数字は入力に任せる。
    if (event.target instanceof Element && event.target.closest("input, textarea, select, a, [contenteditable]")) return;
    const sessionPanel = $("#sessionPanel");
    if (!sessionPanel || sessionPanel.classList.contains("hide")) return;
    if (session.phase === "graded") {
      if (event.key !== "Enter") return;
      if (event.target instanceof Element && event.target.closest("button")) return; // ボタン自身の Enter に任せる
      const next = $(".quiz .next");
      if (!next) return;
      event.preventDefault();
      pressFlash(next, () => next.click());
      return;
    }
    const index = { "1": 0, "2": 1, "3": 2 }[event.key];
    if (index == null) return;
    const group = session.phase === "ask" ? ".recallConfidence" : ".recallSelfGrade";
    const button = document.querySelectorAll(`${group} .choice`)[index];
    if (!button) return;
    event.preventDefault();
    pressFlash(button, () => button.click());
  }

  function confidentMissList(keys) {
    return el("section", { class: "card recallMissList" },
      el("p", { class: "label" }, "自信があったのに違った語"),
      el("ul", {}, ...keys.map((key) => {
        const word = wordForSession(key);
        return el("li", {}, `${word.headword}【${word.kanji}】：${meaningText(word)}`);
      })),
    );
  }

  function handleQuizKeydown(event) {
    if (!session) return;
    if (session.stage === "recall") return handleRecallKeydown(event);
    if (session.stage !== "meaning" && session.stage !== "context") return;
    if (event.repeat || event.isComposing || event.keyCode === 229) return;
    if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
    if (event.target instanceof Element && event.target.closest("input, textarea, select, button, a, [contenteditable]")) return;
    const sessionPanel = $("#sessionPanel");
    if (!sessionPanel || sessionPanel.classList.contains("hide")) return;

    if (!session.answered) {
      const index = { "1": 0, "2": 1, "3": 2, "4": 3 }[event.key];
      if (index == null) return;
      const choice = document.querySelectorAll(".quiz .choice:not(:disabled)")[index];
      if (!choice) return;
      event.preventDefault();
      pressFlash(choice, () => choice.click());
    } else if (event.key === "Enter") {
      const next = $(".quiz .next");
      if (!next || next.disabled) return;
      event.preventDefault();
      pressFlash(next, () => next.click());
    }
  }

  function renderWrongReview(panel) {
    panel.appendChild(el("p", { class: "lead" }, "間違えた語を読み直し、確認した語にチェックを付けてください。"));
    const total = session.wrongMeaningIds.length;
    const reviewedCount = session.reviewedIds.length;
    const remainingIds = session.wrongMeaningIds.filter((id) => !session.reviewedIds.includes(id));
    const nextId = remainingIds[0];
    const isFinalStage = isPoolReview();
    panel.appendChild(el("p", { class: "reviewProgress" }, `未確認 ${remainingIds.length} / 全${total}語・確認済み ${reviewedCount}語`));
    const list = el("div", { class: "reviewList" });
    if (nextId) {
      const entry = reviewEntryByKey(nextId);
      const word = wordForSession(nextId);
      const card = wordCard(word);
      card.classList.add("reviewCard");
      card.setAttribute("tabindex", "-1");
      const last = remainingIds.length === 1;
      const nextLabel = last
        ? (isFinalStage ? "確認した・結果を見る →" : "確認した・文中問題へ →")
        : "確認した・次の誤答へ →";
      card.appendChild(el("button", { class: "ghost", onclick: () => {
        if (!session.reviewedIds.includes(nextId)) {
          session.reviewedIds.push(nextId);
          appendHistory({ kind: "wrong-review", wordId: entry?.word.id || nextId, result: "viewed" }, entry?.progress || state.progress);
          saveProgressFor(entry?.setId || state.setId, entry?.progress || state.progress);
        }
        if (last) {
          session.stage = isFinalStage ? "done" : "context";
          session.answered = false;
          session.choices = null;
        }
        renderSession();
        const destination = last ? $(isFinalStage ? ".doneBanner h2" : ".askWord, .meaningExample, .cloze") : $(".reviewCard");
        if (destination) {
          if (!destination.hasAttribute("tabindex")) destination.setAttribute("tabindex", "-1");
          destination.focus({ preventScroll: true });
        }
      } }, nextLabel));
      list.appendChild(card);
    }
    panel.appendChild(list);
    if (!nextId) {
      panel.appendChild(el("button", { class: "cta", onclick: () => {
        session.stage = isFinalStage ? "done" : "context";
        session.answered = false;
        session.choices = null;
        renderSession();
      } }, isFinalStage ? "結果を見る →" : "文中問題へ →"));
    }
  }

  function recallDoneTitle() {
    if (session.extraAfterQuota) return "追加の思い出す復習が完了しました";
    return recallRemaining() ? "思い出して復習が完了しました" : "今日のノルマを達成しました";
  }

  function recallDoneHint() {
    const remaining = recallRemaining();
    return [
      remaining ? `今日 ${recallTodayCount()} / ${RECALL_DAILY_QUOTA}問・残り${remaining}問。` : `今日 ${recallTodayCount()}問（ノルマ${RECALL_DAILY_QUOTA}問）。`,
      "間隔復習の復習日は変わりません。",
    ].join("");
  }

  function renderDone(panel) {
    clearResume();
    const isMeaningReview = isPoolReview();
    const isRecall = session.mode === "recallReview";
    const score = isMeaningReview ? session.meaningCorrect : session.contextCorrect;
    const total = isMeaningReview ? session.meaningOrder.length : session.contextOrder.length;
    const cleared = !isMeaningReview && KobunSetProgress.summarize(state.set, state.progress).key === "cleared";
    panel.appendChild(el("section", { class: `doneBanner${cleared ? " doneBanner--success" : ""}` },
      el("p", { class: "label" }, "学習結果"),
      el("div", { class: "score" }, `${score} / ${total}`),
      el("h2", {}, isRecall ? recallDoneTitle() : isMeaningReview ? "意味だけ復習が完了しました" : cleared ? `${state.set.meta.title} CLEAR` : (session.mode === "review" ? "誤答復習が完了しました" : "通常学習が完了しました")),
      el("p", { class: "hint" }, isRecall ? recallDoneHint() : isMeaningReview ? "正解した語は次の復習日へ、誤答した語は要再確認へ戻りました。" : (reviewIds().length ? `復習対象があと${reviewIds().length}語あります。` : "全語の文中問題に正解しました。")),
    ));
    if (isRecall && session.confidentMissIds?.length) panel.appendChild(confidentMissList(session.confidentMissIds));
    const actions = el("div", { class: "actions doneActions" });
    if (!isMeaningReview && reviewIds().length) actions.appendChild(el("button", { class: "cta reviewCta", onclick: startReview }, `間違えた${reviewIds().length}語を復習する →`));
    else if (isRecall) {
      // ノルマが残っていれば続きを出す。達成後の追加はホームから。
      const size = Math.min(recallRemaining(), learnedMeaningEntries().length);
      if (size) actions.appendChild(el("button", { class: "cta reviewCta", onclick: startRecallReview }, `続けて${size}問を解く →`));
    }
    else if (isMeaningReview && dueMeaningEntries().length) actions.appendChild(el("button", { class: "cta reviewCta", onclick: startMeaningReview }, `要再確認の${Math.min(dueMeaningEntries().length, MEANING_SESSION_SIZE)}語をもう一度解く →`));
    else if (cleared) {
      const nextId = nextSetId(state.setId);
      if (nextId) {
        const nextIndex = Object.keys(state.manifest.sets).indexOf(nextId) + 1;
        actions.appendChild(el("button", { class: "cta reviewCta", onclick: () => switchSet(nextId) }, `第${nextIndex}セットへ進む →`));
      } else {
        const totalSets = Object.keys(state.manifest.sets).length;
        actions.appendChild(el("button", { class: "cta reviewCta", onclick: showAllSetsHome }, `全${totalSets}セットの学習状況を見る`));
      }
    }
    actions.appendChild(el("button", { class: "ghost", onclick: renderHome }, "一覧へ戻る"));
    panel.appendChild(actions);
  }

  async function loadSet(setId) {
    const entry = state.manifest.sets[setId];
    const set = await fetch(entry.dataUrl, { cache: "no-store" }).then((response) => {
      if (!response.ok) throw new Error(`set: HTTP ${response.status}`);
      return response.json();
    });
    const selectedSet = applyExampleSourcePriority(set);
    const progress = loadProgressFor(setId, selectedSet);
    state.setId = setId;
    state.set = selectedSet;
    state.progress = progress;
    localStorage.setItem(SET_KEY, setId);
  }

  async function switchSet(setId, picker) {
    if (!state.manifest.sets[setId] || setId === state.setId) return;
    if (picker) {
      picker.setAttribute("aria-busy", "true");
      picker.querySelectorAll(".setOption").forEach((button) => { button.disabled = true; });
    }
    setShareStatus("セットを読み込んでいます…", "syncing");
    try {
      session = null;
      await loadSet(setId);
      await loadReviewPool();
      migrateStudyPlanFirstAnswers();
      if (cloud) cloud.queueSave();
      setShareStatus("");
      renderHome();
    } catch (error) {
      console.error(error);
      setShareStatus("セットを読み込めませんでした。もう一度お試しください。", "ng");
      renderHome();
    }
  }

  async function mount() {
    document.addEventListener("keydown", handleQuizKeydown);
    try {
      state.manifest = await fetch(MANIFEST_URL, { cache: "no-store" }).then((response) => {
        if (!response.ok) throw new Error(`manifest: HTTP ${response.status}`);
        return response.json();
      });
      studyTime = KobunStudyTime.create({
        storageKey: STUDY_TIME_KEY,
        isActive: () => !$("#sessionPanel").classList.contains("hide"),
        onFlush: () => { if (cloud) cloud.queueSave(); },
      });
      cloud = createCloud({
        appId: APP_ID,
        getPatch: () => ({
          datasetId: state.setId,
          progress: state.progress,
          meta: cloudMeta(),
        }),
        applyLoaded: applyCloudProgress,
        onStatus: setShareStatus,
      });
      await cloud.init();
      const savedSetId = localStorage.getItem(SET_KEY);
      await loadSet(state.manifest.sets[savedSetId] ? savedSetId : state.manifest.defaultSetId);
      await loadReviewPool();
      migrateStudyPlanFirstAnswers();
      loadStudyPlan();
      renderHome();
    } catch (error) {
      const home = $("#homePanel");
      home.removeAttribute("aria-busy");
      home.innerHTML = "";
      const errorBox = el("div", { class: "error", role: "alert", tabindex: "-1" },
        el("p", {}, "データを読み込めませんでした。"),
        el("p", { class: "hint" }, "ローカルサーバー経由で開いているか確認してから、再読み込みしてください。"),
        el("button", { class: "ghost", onclick: () => location.reload() }, "再読み込み"),
      );
      home.appendChild(errorBox);
      errorBox.focus();
      console.error(error);
    }
  }

  return { mount };
})();
