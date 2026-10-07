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
  const HOME_TAB_KEY = `kobun_vocab_home_tab_v1${storageScope}`;
  const WRITTEN_SIZE_KEY = `kobun_vocab_written_size_v1${storageScope}`;
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
        } else if (progress.resume?.mode === "final" || progress.resume?.mode === "recallReview") {
          // 最終チェック・選択肢なしで思い出す（毎日のノルマ）は廃止済み。旧データの途中位置は再開できないため破棄する。
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
    // 書く演習は短い回なので途中保存しない（途中保存は1枠のため、別の学習の続きを消さない）。
    if (session.mode === "writtenDrill") return;
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
    const title = state.set?.meta?.title || "このセット";
    const block = resume.mode === "learn"
      ? `・第${Number(resume.batchIndex || 0) + 1}/${resume.batchCount || 1}ブロック`
      : "";
    // resume.order はセット全語のIDなので、ブロック内の語数は currentBatchIds() と同じ切り出しで求める。
    const batchStart = Number(resume.batchIndex || 0) * BATCH_SIZE;
    const batchLength = (resume.order || []).slice(batchStart, batchStart + BATCH_SIZE).length || BATCH_SIZE;
    const stage = {
      flash: `STEP 1 覚える ${Number(resume.index || 0) + 1}/${batchLength}`,
      meaning: resume.mode === "meaningReview" ? "意味だけ復習" : "STEP 2 確かめる",
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
    $(".wrap")?.classList.remove("wakaFocus");
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
    const marks = [];
    const tabStart = (id) => marks.push({ id, from: home.children.length });

    tabStart("today");
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
    const dueCount = dueMeaningEntries().length;
    if (dueCount) {
      card.appendChild(el("button", { class: "ghost secondaryCta homeTabJump", type: "button", onclick: () => selectHomeTab("review", true) },
        `今日の復習へ（${dueCount}語）`));
    }
    card.appendChild(el("button", { class: "ghost secondaryCta homeTabJump", type: "button", onclick: () => selectHomeTab("sets", true) },
      "学習セット・単語一覧を見る"));

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

    tabStart("review");
    home.appendChild(meaningMission());

    tabStart("write");
    home.appendChild(writtenMission());

    tabStart("waka");
    const wakaTeaser = hasWakaGallery() ? KobunWakaGallery.teaserCard(wakaPoems(), { onOpen: openWakaGallery, onDaily: () => openWakaDaily() }) : null;
    if (wakaTeaser) home.appendChild(wakaTeaser);

    // セットはタブに出さず、今日の面の「学習セット・単語一覧を見る」から開く。
    tabStart("sets");
    home.appendChild(el("button", { class: "ghost homeTabBack", type: "button", onclick: () => selectHomeTab("today", true) }, "← 今日に戻る"));
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
    arrangeHomeTabs(home, marks, { review: dueCount });
  }

  /* ---- ホームのタブ ----
     1列に積んでいたホームを「今日・復習・書く・和歌」の4面に分ける。
     描画中に tabStart で区切りを付け、最後に arrangeHomeTabs で各面へ振り分ける。
     inBar: false の面（セット）はタブに出さず、今日の面のボタンから開く。 */
  const HOME_TABS = [
    { id: "today", label: "今日" },
    { id: "review", label: "復習" },
    { id: "write", label: "書く" },
    { id: "waka", label: "和歌" },
    { id: "sets", label: "セット", inBar: false },
  ];

  function storedHomeTab() {
    const fromHash = String(location.hash || "").replace(/^#/, "");
    if (HOME_TABS.some((tab) => tab.id === fromHash)) return fromHash;
    try {
      const stored = localStorage.getItem(HOME_TAB_KEY);
      if (HOME_TABS.some((tab) => tab.id === stored)) return stored;
    } catch (_) { /* localStorageなしでも表示は続ける */ }
    return "today";
  }

  function selectHomeTab(id, focus = false) {
    const bar = $(".homeTabs");
    if (!bar) return;
    try { localStorage.setItem(HOME_TAB_KEY, id); } catch (_) { /* 記憶できなくても切り替えは続ける */ }
    try { history.replaceState(null, "", `${location.pathname}${location.search}#${id}`); } catch (_) { /* file:// など */ }
    const buttons = Array.from(bar.querySelectorAll("[role=tab]"));
    const inBar = buttons.some((button) => button.dataset.tab === id);
    buttons.forEach((button, i) => {
      const selected = button.dataset.tab === id;
      button.setAttribute("aria-selected", String(selected));
      // タブに無い面（セット）を開いている間も、タブ列へキーボードで戻れるようにする。
      button.tabIndex = selected || (!inBar && i === 0) ? 0 : -1;
      if (selected && focus) button.focus();
    });
    document.querySelectorAll(".homeTabPanel").forEach((panel) => {
      panel.hidden = panel.dataset.tab !== id;
    });
    if (!inBar && focus) $(`#homeTabPanel-${id}`)?.querySelector("button, a, [tabindex]")?.focus();
    if (bar.getBoundingClientRect().top < 0) bar.scrollIntoView({ block: "start" });
  }

  function arrangeHomeTabs(home, marks, badges = {}) {
    if (!marks.length) return;
    const panels = Object.fromEntries(HOME_TABS.map((tab) => [tab.id, el("div", {
      class: "homeTabPanel",
      id: `homeTabPanel-${tab.id}`,
      role: "tabpanel",
      "aria-labelledby": `homeTab-${tab.id}`,
      "data-tab": tab.id,
    })]));
    Array.from(home.children).forEach((node, index) => {
      let id = marks[0].id;
      marks.forEach((mark) => { if (index >= mark.from) id = mark.id; });
      panels[id].appendChild(node);
    });
    const filled = HOME_TABS.filter((tab) => panels[tab.id].children.length);
    const tabs = filled.filter((tab) => tab.inBar !== false);
    if (!tabs.length) return;
    const stored = storedHomeTab();
    const active = filled.some((tab) => tab.id === stored) ? stored : tabs[0].id;
    const bar = el("div", { class: "homeTabs", role: "tablist", "aria-label": "ホームの表示" });
    tabs.forEach((tab, i) => {
      const badge = Number(badges[tab.id]) || 0;
      const button = el("button", {
        class: "homeTab",
        id: `homeTab-${tab.id}`,
        type: "button",
        role: "tab",
        "aria-controls": `homeTabPanel-${tab.id}`,
        "data-tab": tab.id,
        onclick: () => selectHomeTab(tab.id),
      }, el("span", {}, tab.label), badge
        ? el("span", { class: "homeTabBadge", "aria-label": `復習の期限 ${badge}語` }, String(badge))
        : null);
      button.addEventListener("keydown", (event) => {
        const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
        if (!step) return;
        event.preventDefault();
        selectHomeTab(tabs[(i + step + tabs.length) % tabs.length].id, true);
      });
      bar.appendChild(button);
    });
    home.appendChild(bar);
    filled.forEach((tab) => home.appendChild(panels[tab.id]));
    selectHomeTab(active);
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

  // --- 意味を書く演習（ホームの「書く」タブ）。段階と再出題の決め方は static/written-drill.js。 ---
  // 学習済みの語から出し、書いた答えを Jev（/api/grade-recall）で採点する。Worker が無い・失敗した・
  // 確信度が低いときは自己採点に戻す。記録は履歴（kind: "written"）だけで、FSRS とノルマには混ぜない。
  const WRITTEN_OUTCOME_LABELS = { learned: "見出し語だけで正解", shaky: "例文で正解", notLearned: "答えを確認" };
  const WRITTEN_GRADE_TIMEOUT_MS = 10000;

  function writtenPoolKeys() {
    return learnedMeaningEntries().filter(({ word }) => word.example).map((entry) => entry.key);
  }

  function readWrittenSize() {
    try { return localStorage.getItem(WRITTEN_SIZE_KEY); } catch (_) { return null; }
  }

  function writtenMission() {
    const pool = writtenPoolKeys();
    const section = el("section", { class: "card writtenMission", "aria-labelledby": "writtenMissionTitle" },
      el("p", { class: "label" }, "書いて覚える"),
      el("h2", { id: "writtenMissionTitle" }, "古文単語の意味を書く"),
      el("p", { class: "lead" }, "選択肢なしで、見出し語を見て意味を自分の言葉で書きます。言い回しが違っても、意味が合っていれば正解です。"),
      el("ol", { class: "writtenSteps" },
        el("li", {}, el("strong", {}, "見出し語だけ"), el("span", {}, "まず何も見ずに書く")),
        el("li", {}, el("strong", {}, "例文ヒント"), el("span", {}, "わからなければ例文を見てもう一度")),
        el("li", {}, el("strong", {}, "答えを確認"), el("span", {}, `${KobunWrittenDrill.REASK_GAP}問ほどあとに見出し語だけでもう一度`)),
      ),
    );
    if (!pool.length) {
      section.appendChild(el("p", { class: "hint" }, "通常学習で文中問題まで解いた語が対象になります。"));
      section.appendChild(el("button", { class: "cta writtenCta", type: "button", disabled: true }, "出題できる語はまだありません"));
      return section;
    }
    const choices = KobunWrittenDrill.sizeChoices(pool.length);
    let size = KobunWrittenDrill.preferredSize(choices, readWrittenSize());
    const startButton = el("button", { class: "cta writtenCta", type: "button", onclick: () => startWrittenDrill(size) });
    const sizeButtons = choices.map((choice) => el("button", {
      class: "writtenSizeChoice",
      type: "button",
      onclick: () => {
        size = choice;
        try { localStorage.setItem(WRITTEN_SIZE_KEY, String(choice)); } catch (_) { /* 記憶できなくても選択は続ける */ }
        sync();
      },
    }, `${choice}語`));
    function sync() {
      sizeButtons.forEach((button, i) => button.setAttribute("aria-pressed", String(choices[i] === size)));
      startButton.textContent = `書きはじめる（${size}語）`;
    }
    sync();
    section.appendChild(el("div", { class: "writtenSizeRow" },
      el("span", { class: "writtenSizeLabel", id: "writtenSizeLabel" }, "1回の語数"),
      el("div", { class: "writtenSizeChoices", role: "group", "aria-labelledby": "writtenSizeLabel" }, ...sizeButtons),
    ));
    section.appendChild(startButton);
    section.appendChild(el("p", { class: "hint" },
      `出題できる語：${pool.length}語（学習済みの語から毎回ランダム）。採点は Jev が意味の近さで行い、判定が難しいときは自分で判定します。間隔復習の復習日には影響しません。`));
    return section;
  }

  function startWrittenDrill(size = KobunWrittenDrill.SESSION_SIZE) {
    const picked = shuffle(writtenPoolKeys()).slice(0, size);
    if (!picked.length) return renderHome();
    session = {
      mode: "writtenDrill",
      stage: "written",
      writtenSize: size,
      writtenKeys: picked,
      // 出題順。{ key, reask }。あやふや・未習得の語は reask: true で後ろへ差し込む。
      writtenQueue: picked.map((key) => ({ key, reask: false })),
      writtenPos: 0,
      // 語ごとの結果。{ key, outcome, answers, reaskResult }
      writtenResults: [],
      ...freshWrittenTurn(),
    };
    lastStepKey = stepKey();
    renderSession();
    $(".writtenInput")?.focus({ preventScroll: true });
  }

  function freshWrittenTurn() {
    // step: word → example（初回の誤答・わからない）。phase: input → grading → self → result | answer
    return { writtenStep: "word", writtenPhase: "input", writtenAnswer: "", writtenAnswers: [], writtenAi: null, writtenGradedBy: null, writtenOutcome: null };
  }

  // 歌の間（試験公開）。読み込み済みの全セットから、例文として表示される和歌を集める。
  // 試験機能なので、モジュールや表示先が無い環境（検査用の擬似DOMなど）では入口を出さない。
  const hasWakaGallery = () => typeof KobunWakaGallery !== "undefined" && Boolean($("#wakaPanel"));

  // grammar を渡すと、文法解説の側だけに本文を持つ歌（百人一首）も後ろに足す。
  function wakaPoems(grammar = null) {
    return KobunWakaGallery.withGrammarPoems(KobunWakaGallery.collect(setSources()
      .filter((source) => source.set)
      .map((source) => ({ setId: source.setId, set: source.set, label: source.entry.label }))), grammar);
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

  async function openWakaGallery(initialKey = null, focusGrammar = false) {
    const grammar = await loadWakaGrammar();
    $("#homePanel").classList.add("hide");
    $("#sessionPanel").classList.add("hide");
    const panel = $("#wakaPanel");
    panel.classList.remove("hide");
    KobunWakaGallery.render(panel, wakaPoems(grammar), {
      initialKey,
      grammar,
      onLearnPoem: (poem) => openWakaPoemLesson(poem.key),
      onClose: () => {
        renderHome();
        selectHomeTab("waka");
        $("#homePanel .wgTeaser")?.scrollIntoView({ block: "center" });
        $("#homePanel .wgTeaser .wgButton--gold")?.focus({ preventScroll: true });
      },
    });
    if (focusGrammar) panel.querySelector(".wgPoemGrammarStart")?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }

  async function openWakaPoemLesson(key) {
    const grammar = await loadWakaGrammar();
    const poem = wakaPoems(grammar).find((item) => item.key === key);
    if (!grammar || !poem) {
      openWakaGallery(key);
      return;
    }
    $("#homePanel").classList.add("hide");
    $("#sessionPanel").classList.add("hide");
    const panel = $("#wakaPanel");
    panel.classList.remove("hide");
    KobunWakaGallery.renderPoemLesson(panel, poem, {
      grammar,
      onClose: () => openWakaGallery(key, true),
      onHome: () => {
        renderHome();
        selectHomeTab("waka");
        $("#homePanel .wgTeaser")?.scrollIntoView({ block: "center" });
        $("#homePanel .wgTeaser .wgButton--gold")?.focus({ preventScroll: true });
      },
    });
    window.scrollTo({ top: 0 });
  }

  // 今日の10首（和歌で文法）。文法解説が読めなければ歌の間をそのまま開く。
  async function openWakaDaily() {
    const grammar = await loadWakaGrammar();
    if (!grammar) {
      openWakaGallery();
      return;
    }
    $("#homePanel").classList.add("hide");
    $("#sessionPanel").classList.add("hide");
    const panel = $("#wakaPanel");
    panel.classList.remove("hide");
    KobunWakaGallery.renderDaily(panel, wakaPoems(grammar), {
      grammar,
      onOpenPoem: (key) => openWakaGallery(key),
      onClose: () => {
        renderHome();
        selectHomeTab("waka");
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

  const isPoolReview = () => session?.mode === "meaningReview";

  function restoreSession() {
    session = JSON.parse(JSON.stringify(state.progress.resume));
    lastStepKey = stepKey();
    renderSession();
  }

  function renderSession() {
    saveResume();
    $(".wrap")?.classList.remove("wakaFocus");
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
    else if (session.stage === "written") renderWritten(panel);
    else if (session.stage === "writtenDone") renderWrittenDone(panel);
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
    if (session.stage === "written") return `意味を書く ${session.writtenPos + 1} / ${session.writtenQueue.length}`;
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
    if (session.mode === "writtenDrill") return session.stage === "writtenDone" ? "意味を書く・完了" : "見出し語を見て意味を書く";
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
        : session.mode === "writtenDrill" ? ["written"]
          : ["context"];
    const block = session.mode === "learn" ? ` ${session.batchIndex + 1}/${session.batchCount}` : "";
    const labels = { flash: `1 覚える${block}`, meaning: session.mode === "meaningReview" ? "意味だけ復習" : `2 確かめる${block}`, wrongReview: "必要なら復習", context: "3 解く", written: "書く" };
    const current = steps.indexOf(session.stage);
    const key = stepKey();
    const changed = key !== lastStepKey;
    lastStepKey = key;
    return el("div", { class: "stepBar", "aria-label": "学習ステップ" }, ...steps.map((step, index) => {
      const isActive = step === session.stage;
      const isCleared = !isActive && (index < current || session.stage === "done" || session.stage === "writtenDone");
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

  const WRITTEN_SELF_GRADE_LABELS = { correct: "合っていた", partial: "一部だけ", wrong: "違った" };
  // 書いた答えの採点（試験版の Worker `/api/grade-recall`。無い環境では自己採点のまま）。
  const RECALL_GRADE_URL = "api/grade-recall";

  function selfGradeButton(number, label, onclick) {
    return el("button", { class: "choice selfGradeChoice", type: "button", onclick },
      el("span", { class: "choiceNo" }, number),
      el("span", {}, label),
    );
  }

  // 読み（見出し語）が同じ語が全セットに2語以上あるか。
  function isHomograph(word) {
    return reviewPoolEntries().filter((entry) => entry.word.headword === word.headword).length > 1;
  }

  const currentWrittenEntry = () => session.writtenQueue[session.writtenPos];
  // 同じ読みの語は見出し語だけでは問いが決まらないので、最初から例文を出す。
  // 答えの確認では例文が単語カードに入るので、ここでは出さない。
  const writtenExampleShown = (word) => session.writtenPhase !== "answer" && (session.writtenStep === "example" || isHomograph(word));

  function renderWritten(panel) {
    const entry = currentWrittenEntry();
    const word = wordForSession(entry.key);
    const box = el("section", { class: `quiz written${session.writtenPhase === "result" || session.writtenPhase === "answer" ? " quiz--answered" : ""}` });
    if (entry.reask) box.appendChild(el("p", { class: "writtenReaskBadge" }, "もう一度"));
    box.appendChild(el("p", { class: "askWord recallHeadword", tabindex: "-1" }, word.headword));
    if (writtenExampleShown(word)) {
      const label = session.writtenStep === "example" ? `ヒント：『${word.source}』` : `この例文での意味を答えてください（『${word.source}』）`;
      box.appendChild(el("div", { class: "recallHint writtenHint" },
        el("p", { class: "label" }, label),
        el("p", { class: exampleClass(word, "meaningExample") }, exampleBody(word, { underline: true })),
      ));
    }
    const firstTry = session.writtenAnswers.filter((a) => a.step === "word").pop();
    if (session.writtenStep === "example" && session.writtenPhase !== "answer" && firstTry) {
      box.appendChild(el("p", { class: "hint writtenPrevious" }, `1回目の答え：${firstTry.answer}　→ 例文をヒントにもう一度書いてください。`));
    }
    if (["input", "grading", "self"].includes(session.writtenPhase)) box.appendChild(writtenForm(word, entry));
    if (session.writtenPhase === "grading") {
      box.appendChild(el("p", { class: "recallAiNote", role: "status", "aria-live": "polite" }, "Jev が採点しています…"));
    } else if (session.writtenPhase === "self") {
      box.appendChild(writtenSelfGrade(word));
    } else if (session.writtenPhase === "result") {
      box.appendChild(writtenCorrectFeedback(entry, word));
    } else if (session.writtenPhase === "answer") {
      box.appendChild(writtenAnswerReveal(entry, word));
    }
    panel.appendChild(box);
  }

  function writtenForm(word, entry) {
    const input = el("input", {
      class: "recallInput writtenInput",
      type: "text",
      id: "writtenInput",
      maxlength: String(KobunWrittenDrill.MAX_ANSWER_LENGTH),
      autocomplete: "off",
      placeholder: "例：出歩く",
    });
    input.value = session.writtenAnswer || "";
    input.addEventListener("input", () => { session.writtenAnswer = input.value; });
    // 変換確定の Enter で送信しない。
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && (event.isComposing || event.keyCode === 229)) event.preventDefault();
    });
    const submit = el("button", { class: "cta", type: "submit" }, "採点する");
    const unknown = el("button", { class: "ghost", type: "button" },
      session.writtenStep === "word" && !entry.reask && !isHomograph(word) ? "わからない（例文を見る）" : "わからない（答えを見る）");
    const form = el("form", { class: "writtenForm" },
      el("label", { class: "recallInputLabel", for: "writtenInput" },
        session.writtenStep === "example" ? `例文の下線部「${word.headword}」の意味を書いてください` : `「${word.headword}」の意味を書いてください`),
      el("div", { class: "writtenInputRow" }, input, submit),
      el("div", { class: "writtenFormSub" }, unknown),
    );
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      submitWrittenAnswer(input.value);
    });
    unknown.addEventListener("click", () => {
      if (session.writtenPhase !== "input") return;
      session.writtenAnswer = "わからない";
      applyWrittenGrade("wrong", "local");
    });
    if (session.writtenPhase !== "input") {
      input.disabled = true;
      submit.disabled = true;
      unknown.disabled = true;
    }
    return form;
  }

  async function submitWrittenAnswer(raw) {
    const answer = String(raw || "").trim().slice(0, KobunWrittenDrill.MAX_ANSWER_LENGTH);
    if (!answer || session?.writtenPhase !== "input") return;
    const entry = currentWrittenEntry();
    const word = wordForSession(entry.key);
    session.writtenAnswer = answer;
    // 「わからない」などは Jev に送らず違った扱い、意味と表記ゆれ程度で一致すれば正解にする。
    if (KobunRecallGrade.isNoAnswer(answer)) return applyWrittenGrade("wrong", "local");
    if (KobunWrittenDrill.localMatch(answer, word.meanings)) return applyWrittenGrade("correct", "local");
    session.writtenPhase = "grading";
    renderSession();
    const current = session;
    const result = await requestWrittenGrade(reviewEntryByKey(entry.key)?.word.id || word.id, answer);
    // 採点待ちの間に一覧へ戻った・別の演習を始めたときは結果を捨てる。
    if (session !== current || session.writtenPhase !== "grading") return;
    session.writtenAi = result;
    const decision = KobunRecallGrade.decideAiGrade(result);
    if (decision.auto) return applyWrittenGrade(decision.selfGrade, "ai");
    session.writtenPhase = "self";
    renderSession();
    $(".writtenSelfGrade .choice")?.focus({ preventScroll: true });
  }

  async function requestWrittenGrade(wordId, answer) {
    if (typeof fetch !== "function") return null;
    try {
      const response = await fetch(RECALL_GRADE_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wordId, answer }),
        signal: typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(WRITTEN_GRADE_TIMEOUT_MS) : undefined,
      });
      return response.ok ? await response.json() : null;
    } catch {
      return null;
    }
  }

  function applyWrittenGrade(grade, gradedBy) {
    const entry = currentWrittenEntry();
    const word = wordForSession(entry.key);
    const safeGrade = KobunWrittenDrill.grades.includes(grade) ? grade : "wrong";
    session.writtenGradedBy = gradedBy;
    session.writtenAnswers.push({ step: session.writtenStep, answer: session.writtenAnswer, grade: safeGrade, gradedBy });
    const step = KobunWrittenDrill.nextStep(session.writtenStep, entry.reask, safeGrade, { exampleShown: isHomograph(word) });
    if (step.next === "example") {
      Object.assign(session, { writtenStep: "example", writtenPhase: "input", writtenAnswer: "", writtenAi: null });
      renderSession();
      $(".writtenInput")?.focus({ preventScroll: true });
      return;
    }
    recordWrittenResult(entry, step);
    session.writtenPhase = step.next;
    renderSession();
    const feedback = $(".written .feedback");
    feedback?.focus({ preventScroll: true });
    feedback?.scrollIntoView({ block: "nearest" });
  }

  function recordWrittenResult(entry, step) {
    if (entry.reask) {
      const result = session.writtenResults.find((r) => r.key === entry.key);
      if (result) result.reaskResult = step.reaskResult;
    } else {
      session.writtenOutcome = step.outcome;
      session.writtenResults.push({ key: entry.key, outcome: step.outcome, answers: session.writtenAnswers.slice(), reaskResult: null });
      const at = KobunWrittenDrill.reaskIndex(step.outcome, session.writtenPos, session.writtenQueue.length);
      if (at >= 0) session.writtenQueue.splice(at, 0, { key: entry.key, reask: true });
    }
    const poolEntry = reviewEntryByKey(entry.key);
    const progress = poolEntry?.progress || state.progress;
    const last = session.writtenAnswers[session.writtenAnswers.length - 1];
    // 自動採点のしきい値を後で見直せるよう、Jev の判定も残す。
    const aiFields = session.writtenAi && KobunRecallGrade.selfGrades.includes(session.writtenAi.grade) ? {
      aiGrade: session.writtenAi.grade,
      aiConfidence: Math.round(Number(session.writtenAi.confidence) * 1000) / 1000,
    } : {};
    appendHistory({
      kind: "written",
      wordId: poolEntry?.word.id || entry.key,
      result: entry.reask ? `reask-${step.reaskResult}` : step.outcome,
      hintUsed: session.writtenAnswers.some((a) => a.step === "example"),
      answer: last?.answer || "",
      gradedBy: session.writtenGradedBy,
      ...aiFields,
    }, progress);
    saveProgressFor(poolEntry?.setId || state.setId, progress);
  }

  function writtenSelfGrade(word) {
    const decision = KobunRecallGrade.decideAiGrade(session.writtenAi);
    return el("div", { class: "feedback writtenFeedback", role: "status", "aria-live": "polite" },
      el("h3", {}, "答え合わせ"),
      el("p", {}, `あなたの答え：${session.writtenAnswer}`),
      el("p", {}, `${word.headword}【${word.kanji}】：${meaningText(word)}`),
      el("p", { class: "recallAiNote" }, decision.selfGrade
        ? `Jev の判定は「${WRITTEN_SELF_GRADE_LABELS[decision.selfGrade]}」ですが、確信が低いため自分で判定してください。`
        : "自動採点が使えなかったため、自分で判定してください。"),
      el("div", { class: "choices writtenSelfGrade" },
        selfGradeButton(1, "合っていた", () => applyWrittenGrade("correct", "self")),
        selfGradeButton(2, "違った", () => applyWrittenGrade("wrong", "self")),
      ),
    );
  }

  function writtenNextButton(label) {
    return el("div", { class: "quizNextAction" },
      el("button", { class: "cta next", type: "button", onclick: advanceWritten }, label));
  }

  const writtenIsLast = () => session.writtenPos >= session.writtenQueue.length - 1;

  function writtenCorrectFeedback(entry, word) {
    const heading = entry.reask
      ? "○ 今度は見出し語だけで思い出せました"
      : session.writtenOutcome === "learned" ? "○ 見出し語だけで思い出せました" : "○ 例文を手がかりに思い出せました";
    return el("div", { class: "feedback ok", role: "status", "aria-live": "polite", tabindex: "-1" },
      el("h3", {}, heading),
      el("p", {}, `あなたの答え：${session.writtenAnswer}`),
      el("p", {}, `${word.headword}【${word.kanji}】：${meaningText(word)}`),
      !entry.reask && session.writtenOutcome === "shaky" ? el("p", { class: "hint" }, "まだあやふやなので、最後にもう一度見出し語だけで出します。") : null,
      session.writtenGradedBy === "ai" && session.writtenAi
        ? el("p", { class: "recallAiNote" }, `Jev が意味の近さで採点しました（確信度 ${Math.round(Number(session.writtenAi.confidence) * 100)}%）。`)
        : null,
      writtenNextButton(writtenIsLast() ? "結果を見る →" : "次の問題 →"),
    );
  }

  // 答えを例文・解説と並べて確認させる。確認ボタンを押すまで次へ進めない。
  function writtenAnswerReveal(entry, word) {
    const box = el("div", { class: "feedback ng", role: "status", "aria-live": "polite", tabindex: "-1" },
      el("h3", {}, "× 答えを確認しましょう"),
      ...session.writtenAnswers.map((a) => el("p", {}, `${a.step === "word" ? "見出し語だけ" : "例文あり"}の答え：${a.answer}`)),
      el("p", { class: "hint" }, entry.reask
        ? "下の意味と解説を読んでから進んでください。"
        : `下の意味と解説を読んでから進んでください。${KobunWrittenDrill.REASK_GAP}問ほどあとに、もう一度見出し語だけで出します。`),
      writtenNextButton("確認した →"),
    );
    const answer = el("div", { class: "recallAnswer" }, wordCard(word));
    return el("div", {}, box, answer);
  }

  function advanceWritten() {
    if (writtenIsLast()) session.stage = "writtenDone";
    else {
      session.writtenPos++;
      Object.assign(session, freshWrittenTurn());
    }
    renderSession();
    $(session.stage === "writtenDone" ? ".doneBanner h2" : ".writtenInput")?.focus({ preventScroll: true });
  }

  function renderWrittenDone(panel) {
    const summary = KobunWrittenDrill.summarize(session.writtenResults);
    const total = session.writtenKeys.length;
    panel.appendChild(el("section", { class: "doneBanner" },
      el("p", { class: "label" }, "学習結果"),
      el("div", { class: "score" }, `${summary.learned} / ${total}`),
      el("h2", { tabindex: "-1" }, "見出し語だけで思い出せた語"),
      el("p", { class: "hint" }, `例文で正解 ${summary.shaky}・答えを確認 ${summary.notLearned}${summary.reasked
        ? `・再出題で正解 ${summary.reaskCorrect} / ${summary.reasked}` : ""}。間隔復習の復習日は変わりません。`),
    ));
    panel.appendChild(el("section", { class: "card writtenResultList" },
      el("ul", {}, ...session.writtenResults.map((r) => {
        const word = wordForSession(r.key);
        const reask = r.reaskResult ? `／再出題：${r.reaskResult === "correct" ? "正解" : "不正解"}` : "";
        return el("li", { class: `writtenResult writtenResult--${r.outcome}` },
          el("strong", {}, `${WRITTEN_OUTCOME_LABELS[r.outcome]}　${word.headword}【${word.kanji}】`),
          el("span", {}, `${meaningText(word)}${reask}`),
        );
      })),
    ));
    const size = Math.min(session.writtenSize, writtenPoolKeys().length);
    panel.appendChild(el("div", { class: "actions doneActions" },
      size ? el("button", { class: "cta reviewCta", type: "button", onclick: () => startWrittenDrill(session.writtenSize) }, `続けて書く（${size}語）`) : null,
      el("button", { class: "ghost", type: "button", onclick: renderHome }, "一覧へ戻る"),
    ));
  }

  function handleQuizKeydown(event) {
    if (!session) return;
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

  function renderDone(panel) {
    clearResume();
    const isMeaningReview = isPoolReview();
    const score = isMeaningReview ? session.meaningCorrect : session.contextCorrect;
    const total = isMeaningReview ? session.meaningOrder.length : session.contextOrder.length;
    const cleared = !isMeaningReview && KobunSetProgress.summarize(state.set, state.progress).key === "cleared";
    panel.appendChild(el("section", { class: `doneBanner${cleared ? " doneBanner--success" : ""}` },
      el("p", { class: "label" }, "学習結果"),
      el("div", { class: "score" }, `${score} / ${total}`),
      el("h2", {}, isMeaningReview ? "意味だけ復習が完了しました" : cleared ? `${state.set.meta.title} CLEAR` : (session.mode === "review" ? "誤答復習が完了しました" : "通常学習が完了しました")),
      el("p", { class: "hint" }, isMeaningReview ? "正解した語は次の復習日へ、誤答した語は要再確認へ戻りました。" : (reviewIds().length ? `復習対象があと${reviewIds().length}語あります。` : "全語の文中問題に正解しました。")),
    ));
    const actions = el("div", { class: "actions doneActions" });
    if (!isMeaningReview && reviewIds().length) actions.appendChild(el("button", { class: "cta reviewCta", onclick: startReview }, `間違えた${reviewIds().length}語を復習する →`));
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
