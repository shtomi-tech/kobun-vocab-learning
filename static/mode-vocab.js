"use strict";

const KobunVocabApp = (() => {
  const MANIFEST_URL = "data/manifest.json";
  const sharedStudentId = (() => {
    const params = new URLSearchParams(location.search);
    return (params.get("s") || params.get("student") || "").trim();
  })();
  const storageScope = sharedStudentId ? `_${encodeURIComponent(sharedStudentId)}` : "";
  const SET_KEY = `kobun_vocab_dataset${storageScope}`;
  const PROGRESS_PREFIX = `kobun_vocab_progress${storageScope}_`;
  const PASS_RATE = 0.8;
  const BATCH_SIZE = 4;
  const MEANING_SESSION_SIZE = 20;
  const HISTORY_LIMIT = 500;
  const APP_ID = "kobun-vocab-learning";

  const state = { manifest: null, setId: null, set: null, progress: null, reviewPool: [] };
  let session = null;
  let cloud = null;
  let homeIntroduced = false;
  let lastQuizEntryKey = null;
  let lastStepKey = null;
  let hideMeaningEnabled = false;
  let revealedFlashWordId = null;
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
  const passScore = () => Math.ceil(state.set.words.length * PASS_RATE);
  const meaningText = (word) => word.meanings.join("／");
  const wordById = (id) => state.set.words.find((word) => word.id === id);

  function loadProgressFor(setId, set) {
    try {
      const saved = JSON.parse(localStorage.getItem(progressKey(setId)));
      if (saved && typeof saved === "object") {
        const progress = { units: {}, finalCheck: {}, ...saved };
        const dataVersion = set.meta.dataVersion || 1;
        if (progress.dataVersion !== dataVersion) {
          progress.dataVersion = dataVersion;
          progress.finalCheck = {};
          delete progress.resume;
          localStorage.setItem(progressKey(setId), JSON.stringify(progress));
        }
        return progress;
      }
    } catch (_) { /* 壊れた記録は上書きせず、今回だけ空状態で表示する。 */ }
    return { units: {}, finalCheck: {}, dataVersion: set.meta.dataVersion || 1 };
  }

  function loadProgress() { return loadProgressFor(state.setId, state.set); }

  function saveProgressFor(setId, progress) {
    try { localStorage.setItem(progressKey(setId), JSON.stringify(progress)); } catch (_) { /* localStorageなしでも学習は続ける */ }
    if (cloud) cloud.queueSave({ datasetId: setId, progress, meta: { lastDatasetId: state.setId } });
  }

  function saveProgress() {
    saveProgressFor(state.setId, state.progress);
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

  function allSolved() {
    return state.set.words.every((word) => unit(word.id).solvedCorrect && !unit(word.id).needsReview);
  }

  function reviewIds() {
    return state.set.words.filter((word) => unit(word.id).needsReview).map((word) => word.id);
  }

  function itemState(id) {
    if (!state.progress.items) state.progress.items = {};
    state.progress.items[id] = KobunSrs.normalize(state.progress.items[id]);
    return state.progress.items[id];
  }

  function reviewPoolEntries() {
    const sources = (state.reviewPool.length ? state.reviewPool : [{ setId: state.setId, set: state.set, progress: state.progress }])
      .map((source) => source.setId === state.setId ? { ...source, progress: state.progress } : source);
    return sources.flatMap(({ setId, set, progress }) => {
      if (setId === state.setId) {
        set = state.set;
        progress = state.progress;
      }
      return set.words.map((word) => ({
        key: `${setId}::${word.id}`,
        setId,
        word,
        progress,
      }));
    });
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

  function applyCloudProgress(value) {
    if (!value || typeof value !== "object") return;
    const lastSetId = value._meta?.lastDatasetId;
    if (lastSetId && state.manifest.sets[lastSetId]) localStorage.setItem(SET_KEY, lastSetId);
    for (const [setId, progress] of Object.entries(value)) {
      if (state.manifest.sets[setId] && progress && typeof progress === "object") {
        localStorage.setItem(PROGRESS_PREFIX + setId, JSON.stringify(progress));
      }
    }
  }

  async function loadReviewPool() {
    const entries = await Promise.all(Object.entries(state.manifest.sets).map(async ([setId, entry]) => {
      if (setId === state.setId) return { setId, set: state.set, progress: state.progress };
      const set = await fetch(entry.dataUrl, { cache: "no-store" }).then((response) => {
        if (!response.ok) throw new Error(`set: HTTP ${response.status}`);
        return response.json();
      });
      return { setId, set, progress: loadProgressFor(setId, set) };
    }));
    state.reviewPool = entries;
  }

  function wordForSession(id) {
    return reviewEntryByKey(id)?.word || wordById(id);
  }

  const normalizeMeaning = (value) => value.replace(/[「」『』【】（）()、。・／\s]/g, "");
  const meaningParts = (value) => value.split(/[。／]/).map(normalizeMeaning).filter(Boolean);
  const meaningFamilies = [
    /死ぬ|亡くなる|死別|先立たれる|命|いなくなる/,
    /男女|夫婦|交際|結婚|求婚|言い寄|出会|対面|愛情|恋人|男女の縁|親しく言葉/,
    /泣|涙|悲し/,
    /出家|仏道修行|隠遁/,
    /歩く|徒歩|去る|行く|渡る|通る|移動|出歩く|遠ざかる|進む/,
    /連れる|伴う|連れ立つ|備える|持っていく/,
    /じっとしている|座る|ひざまずく|腰をおろす|居ずまい/,
    /書物|漢籍|漢詩|学問|漢学|学才|学識|芸能|技能/,
    /天皇|上皇|法皇|中宮|東宮|行幸|御幸|行啓|ご機嫌/,
    /前世|宿命|運命|約束|縁|契り|愛の誓い/,
    /茫然|前後不覚|正気を失|どうしてよいかわから|道理をわきまえない/,
    /言うまでもない|もちろん|不十分|言い尽くせない|ありきたり|表現できない|なんとも/,
    /異様|奇怪|度を超えてよくない|異常|普通ではない|普段とは異な|並々ではない/,
    /有名|評判|名声|名前/,
    /たいした|これといった|それほど|まったく|少しも|決して|けっして|滅多に|ほとんど/,
    /まさか|よもや/,
    /するな|してはいけない/,
    /いらっしゃる|おいでになる|おありになる|ていらっしゃる|でいらっしゃる/,
    /お与えになる|くださる|下賜/,
    /申しあげる/,
    /なさる|お〜になる|お召しになる|お乗りになる/,
  ];
  const hasMeaningFamilyOverlap = (word, other) => meaningFamilies.some((family) =>
    word.meanings.some((meaning) => family.test(meaning)) && other.meanings.some((meaning) => family.test(meaning))
  );
  const hasMeaningOverlap = (word, other) => word.meanings.some((meaning) =>
    other.meanings.some((candidate) => meaningParts(meaning).some((left) =>
      meaningParts(candidate).some((right) =>
        left === right || (Math.min(left.length, right.length) >= 4 && (left.includes(right) || right.includes(left)))
      )
    ))
  );

  function choiceSet(word, kind) {
    const correct = kind === "meaning" ? meaningText(word) : word.headword;
    const source = kind === "meaning" && session?.mode === "meaningReview"
      ? reviewPoolEntries().map((entry) => ({ key: entry.key, word: entry.word }))
      : state.set.words.map((other) => ({ key: other.id, word: other }));
    const currentKey = kind === "meaning" && session?.mode === "meaningReview"
      ? session.meaningOrder[session.meaningIndex]
      : word.id;
    const candidates = source.filter((other) => other.key !== currentKey);
    const distinctCandidates = candidates
      .filter(({ word: other }) => kind !== "meaning" || (!hasMeaningOverlap(word, other) && !hasMeaningFamilyOverlap(word, other)));
    const selectedCandidates = [];
    const addCandidates = (items) => {
      for (const candidate of shuffle(items)) {
        if (selectedCandidates.every(({ word: other }) => kind !== "meaning" ||
          (!hasMeaningOverlap(candidate.word, other) && !hasMeaningFamilyOverlap(candidate.word, other)))) {
          selectedCandidates.push(candidate);
        }
        if (selectedCandidates.length === 3) break;
      }
    };
    addCandidates(distinctCandidates);
    if (kind === "meaning" && selectedCandidates.length < 3 && session?.mode !== "meaningReview") {
      const currentIds = new Set(source.map(({ word: other }) => other.id));
      addCandidates(reviewPoolEntries()
        .filter(({ word: other }) => !currentIds.has(other.id))
        .map((entry) => ({ key: entry.key, word: entry.word }))
        .filter(({ word: other }) => !hasMeaningOverlap(word, other) && !hasMeaningFamilyOverlap(word, other)));
    }
    const pool = selectedCandidates
      .map(({ word: other }) => kind === "meaning" ? meaningText(other) : other.headword)
      .filter((value, index, values) => value !== correct && values.indexOf(value) === index);
    return shuffle([correct, ...shuffle(pool).slice(0, 3)]);
  }

  function meaningChoicesAreSafe(word, choices) {
    const correct = meaningText(word);
    if (!Array.isArray(choices) || choices.length !== 4 || new Set(choices).size !== 4 || !choices.includes(correct)) return false;
    const source = reviewPoolEntries().map((entry) => ({ key: entry.key, word: entry.word }));
    const currentKey = session?.mode === "meaningReview"
      ? session.meaningOrder[session.meaningIndex]
      : word.id;
    const selected = choices.map((choice) => choice === correct
      ? word
      : source.find(({ key, word: other }) => key !== currentKey && meaningText(other) === choice)?.word);
    if (!selected.every(Boolean)) return false;
    const distractors = selected.filter((item) => item !== word);
    return distractors.every((item) => !hasMeaningOverlap(word, item) && !hasMeaningFamilyOverlap(word, item)) &&
      selected.every((item, index) => selected.slice(index + 1).every((other) =>
        !hasMeaningOverlap(item, other) && !hasMeaningFamilyOverlap(item, other)
      ));
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

  function renderHome() {
    session = null;
    $(".wrap")?.classList.remove("sessionActive");
    $("#sessionPanel").classList.add("hide");
    const home = $("#homePanel");
    home.classList.remove("hide");
    home.removeAttribute("aria-busy");
    home.innerHTML = "";

    const summary = KobunSetProgress.summarize(state.set, state.progress);
    const total = state.set.words.length;
    const learned = summary.learnedCount;
    const solved = state.set.words.filter((word) => unit(word.id).solvedCorrect).length;
    const reviews = reviewIds();
    const final = state.progress.finalCheck || {};
    const resume = state.progress.resume;
    const isFirstReveal = !homeIntroduced;
    homeIntroduced = true;

    const card = el("section", { class: `card${isFirstReveal ? " is-entering" : ""}` },
      setPicker(),
      el("p", { class: "label" }, final.cleared ? "達成状況" : "今回の学習"),
      el("h2", {}, state.set.meta.title),
      el("p", { class: "lead" }, `${total}語を4語ずつ、覚える → 意味を確かめる、の順に進めてから文中問題を解きます。`),
    );

    let primary;
    if (resume) primary = ["続きから再開する", restoreSession, "保存した位置から再開します。"];
    else if (learned < total) primary = [`${total}語の学習を始める`, startLearn, "4語の暗記カードと意味確認を1ブロックとして進めます。"];
    else if (reviews.length) primary = [`間違えた${reviews.length}語を復習する`, startReview, "文中問題を解き直します。"];
    else if (!final.cleared) primary = ["最終チェックに挑戦する", startFinal, `${passScore()}/${total}問以上でCLEARです。`];
    else primary = ["このセットをもう一周する", startLearn, "暗記カードからもう一度確認します。"];

    card.appendChild(el("div", { class: "recommend" },
      el("p", { class: "label" }, "まずはここから"),
      el("button", { class: "cta", onclick: () => primary[1]() }, primary[0]),
      el("p", { class: "hint" }, primary[2]),
    ));

    card.appendChild(el("div", { class: "stats" },
      stat(learned, total, "文中回答済み"),
      stat(summary.reviewCount, total, "復習対象"),
      stat(solved, total, "正解確認済み", { secondary: true }),
      stat(summary.bestScore, total, "最終 BEST", { secondary: true }),
    ));
    home.appendChild(card);
    home.appendChild(learningBlockMap());
    home.appendChild(meaningMission());

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

    home.appendChild(recentHistory());

    home.appendChild(el("details", { class: "card utility" },
      el("summary", {}, "その他"),
      el("button", { class: "ghost", onclick: resetProgress }, "このセットの進捗をリセット"),
    ));
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
      el("p", { class: "lead" }, `全セットの文中問題まで回答した語を、1回最大${MEANING_SESSION_SIZE}語で復習します。正解すると1・3・7・14日後へ進みます。`),
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

  function recentHistory() {
    const details = el("details", { class: "card learningHistory" },
      el("summary", {}, "最近の学習履歴"),
    );
    const sources = (state.reviewPool.length ? state.reviewPool : [{ setId: state.setId, set: state.set, progress: state.progress }])
      .map((source) => source.setId === state.setId ? { ...source, progress: state.progress } : source);
    const events = sources.flatMap(({ setId, progress }) => (Array.isArray(progress.history) ? progress.history : []).map((event) => ({ ...event, datasetId: setId })))
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 10);
    if (!events.length) {
      details.appendChild(el("p", { class: "hint" }, "まだ学習履歴はありません。"));
      return details;
    }
    const descriptions = {
      question: "文中問題",
      meaning: "意味だけ復習",
      "wrong-review": "誤答確認",
      final: "最終チェック",
    };
    const list = el("ol", { class: "historyList" });
    events.forEach((event) => {
      const source = state.reviewPool.find((entry) => entry.setId === event.datasetId);
      const word = source?.set.words.find((item) => item.id === event.wordId) || wordById(event.wordId);
      const result = event.result === "correct" ? "正解" : event.result === "wrong" ? "不正解" : "確認";
      const date = new Date(event.at);
      list.appendChild(el("li", {},
        el("time", { datetime: event.at }, Number.isNaN(date.getTime()) ? "日時不明" : date.toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })),
        el("span", {}, `${word?.headword || "語句"}・${descriptions[event.kind] || "学習"}・${result}`),
      ));
    });
    details.appendChild(list);
    return details;
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

  function showAllSetsHome() {
    renderHome();
    const picker = $(".setPicker");
    if (picker) picker.open = true;
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

  function resetProgress(event) {
    const button = event?.currentTarget;
    if (button && button.dataset.confirmReset !== "yes") {
      button.dataset.confirmReset = "yes";
      button.textContent = "もう一度押すと進捗をリセット";
      return;
    }
    state.progress = { units: {}, finalCheck: {}, dataVersion: state.set.meta.dataVersion || 1 };
    saveProgress();
    renderHome();
  }

  function startLearn(batchIndexOverride = null) {
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
    session = {
      mode: "learn", stage: "flash", order: ids, index: 0,
      batchIndex, batchCount,
      meaningOrder: shuffle(batchIds), meaningIndex: 0, meaningCorrect: 0,
      contextOrder: shuffle(ids), contextIndex: 0, contextCorrect: 0,
      wrongMeaningIds: [], reviewedIds: [], answered: false, choices: null,
    };
    revealedFlashWordId = null;
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

  function startFinal() {
    const ids = shuffle(state.set.words.map((word) => word.id));
    session = {
      mode: "final", stage: "meaning", meaningOrder: ids, meaningIndex: 0,
      meaningCorrect: 0, wrongMeaningIds: [], reviewedIds: [], answered: false, choices: null,
    };
    lastStepKey = stepKey();
    renderSession();
  }

  function restoreSession() {
    session = JSON.parse(JSON.stringify(state.progress.resume));
    revealedFlashWordId = null;
    lastStepKey = stepKey();
    renderSession();
  }

  function stepShortLabel() {
    if (session.stage === "flash") return "覚える";
    if (session.stage === "meaning") return session.mode === "meaningReview" ? "意味だけ復習" : session.mode === "final" ? "最終チェック" : "確かめる";
    if (session.stage === "wrongReview") return "必要なら復習";
    if (session.stage === "context") return "解く";
    return "完了";
  }

  function currentCountLabel() {
    if (session.stage === "flash") return `${session.index + 1} / ${currentBatchIds().length}`;
    if (session.stage === "meaning") return `${session.meaningIndex + 1} / ${session.meaningOrder.length}`;
    if (session.stage === "context") return `${session.contextIndex + 1} / ${session.contextOrder.length}`;
    if (session.stage === "wrongReview") return `${session.reviewedIds.length} / ${session.wrongMeaningIds.length}`;
    return "";
  }

  function sessionProgressBar() {
    const parts = [];
    if (session.mode === "learn") parts.push(`第${session.batchIndex + 1}/${session.batchCount}ブロック`);
    parts.push(stepShortLabel());
    const count = currentCountLabel();
    if (count) parts.push(count);
    return el("div", { class: "sessionProgressBar" },
      el("button", { class: "ghost", type: "button", onclick: () => { saveResume(); renderHome(); } }, "一覧へ"),
      el("span", { class: "sessionProgressText" }, parts.join("・")),
    );
  }

  function renderSession() {
    saveResume();
    $(".wrap")?.classList.add("sessionActive");
    $("#homePanel").classList.add("hide");
    const panel = $("#sessionPanel");
    panel.classList.remove("hide");
    panel.innerHTML = "";

    const sessionHead = el("div", { class: "sessionHead" },
      el("div", {},
       el("p", { class: "label" }, sessionLabel()),
       el("h2", {}, stageTitle()),
       el("p", { class: "hint savedState" }, session.stage === "done" ? "次の学習を選べます。" : cloud?.isEnabled() ? "現在地はクラウドとこの端末に保存済み" : "現在地はこの端末に保存済み"),
      ),
    );
    if (session.stage !== "done") sessionHead.appendChild(el("button", { class: "ghost", onclick: () => { saveResume(); renderHome(); } }, "一覧へ戻る"));
    panel.appendChild(sessionHead);
    panel.appendChild(stepBar());
    if (session.stage !== "done") panel.appendChild(sessionProgressBar());

    if (session.stage === "flash") renderFlash(panel);
    else if (session.stage === "meaning") renderQuiz(panel, "meaning");
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
    if (session.stage === "context") return `文中問題 ${session.contextIndex + 1} / ${session.contextOrder.length}`;
    if (session.stage === "wrongReview") return `誤答確認 ${session.reviewedIds.length} / ${session.wrongMeaningIds.length}`;
    return "学習結果";
  }

  function stageTitle() {
    if (session.mode === "review") return "間違えた語を解き直す";
    if (session.mode === "meaningReview") return session.stage === "done" ? "意味だけ復習完了" : session.stage === "wrongReview" ? "間違えた語を確認" : "意味だけ復習";
    if (session.mode === "final") return session.stage === "done" ? "最終チェック完了" : "最終チェック";
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
        : [session.mode === "final" ? "meaning" : "context"];
    const block = session.mode === "learn" ? ` ${session.batchIndex + 1}/${session.batchCount}` : "";
    const labels = { flash: `1 覚える${block}`, meaning: session.mode === "final" ? "最終チェック" : session.mode === "meaningReview" ? "意味だけ復習" : `2 確かめる${block}`, wrongReview: "必要なら復習", context: "3 解く" };
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

  function wordCard(word, { hideMeaningEnabled = false, revealed = false, onReveal } = {}) {
    const meaningId = `flashMeaning-${word.id}`;
    const notesId = `flashNotes-${word.id}`;
    const translationId = `flashTranslation-${word.id}`;
    const showRevealButton = hideMeaningEnabled && !revealed;
    const justRevealed = hideMeaningEnabled && revealed;
    const controlledIds = [meaningId, ...(word.notes?.length ? [notesId] : []), translationId].join(" ");
    return el("article", { class: "flashCard" },
      el("div", { class: "flashTitle" },
        el("span", { class: "headword" }, word.headword),
        el("span", { class: "kanji" }, `【${word.kanji}】`),
      ),
      showRevealButton
        ? el("button", { class: "cta revealMeaning", type: "button", "aria-expanded": "false", "aria-controls": controlledIds, onclick: onReveal }, "意味を見る")
        : null,
      el("section", { id: hideMeaningEnabled ? meaningId : null, hidden: showRevealButton, class: justRevealed ? "is-entering" : null }, el("h3", {}, "意味"), ...word.meanings.map((meaning) => el("p", {}, meaning))),
      word.notes?.length
        ? el("section", { id: hideMeaningEnabled ? notesId : null, hidden: showRevealButton, class: `flashNotes${justRevealed ? " is-entering" : ""}` }, el("h3", {}, "解説・補足"), el("ul", {}, ...word.notes.map((note) => el("li", {}, note))))
        : null,
      el("section", {}, el("h3", {}, `例文　『${word.source}』`), el("p", { class: "example" }, word.example)),
      el("section", { id: hideMeaningEnabled ? translationId : null, hidden: showRevealButton, class: justRevealed ? "is-entering" : null }, el("h3", {}, "例文の訳"), el("p", {}, word.translation)),
    );
  }

  function currentBatchIds() {
    const start = session.batchIndex * BATCH_SIZE;
    return session.order.slice(start, start + BATCH_SIZE);
  }

  function renderFlash(panel) {
    const batchIds = currentBatchIds();
    const word = wordById(batchIds[session.index]);
    const revealed = revealedFlashWordId === word.id;
    panel.appendChild(el("button", {
      class: `ghost hideMeaningToggle${hideMeaningEnabled ? " is-active" : ""}`,
      type: "button",
      "aria-pressed": hideMeaningEnabled ? "true" : "false",
      onclick: () => { hideMeaningEnabled = !hideMeaningEnabled; revealedFlashWordId = null; renderSession(); },
    }, hideMeaningEnabled ? "意味を隠して覚える：オン" : "意味を隠して覚える"));
    panel.appendChild(wordCard(word, {
      hideMeaningEnabled, revealed,
      onReveal: () => { revealedFlashWordId = word.id; renderSession(); },
    }));
    const last = session.index === batchIds.length - 1;
    panel.appendChild(el("div", { class: "actions" },
      el("button", { class: "ghost", disabled: !session.index, onclick: () => { if (session.index) { session.index--; revealedFlashWordId = null; renderSession(); } } }, "← 前の語"),
      el("button", { class: "cta", onclick: () => {
        revealedFlashWordId = null;
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

  function renderQuiz(panel, kind) {
    const order = kind === "meaning" ? session.meaningOrder : session.contextOrder;
    const index = kind === "meaning" ? session.meaningIndex : session.contextIndex;
    const word = wordForSession(order[index]);
    const correct = kind === "meaning" ? meaningText(word) : word.headword;
    if (!session.choices || (kind === "meaning" && !meaningChoicesAreSafe(word, session.choices))) {
      session.choices = choiceSet(word, kind);
    }

    const entryKey = `${session.mode}:${kind}:${order[index]}`;
    const isNewEntry = entryKey !== lastQuizEntryKey;
    lastQuizEntryKey = entryKey;

    const box = el("section", { class: `quiz${session.answered ? " quiz--answered" : ""}${!session.answered && isNewEntry ? " is-entering" : ""}` },
      el("p", { class: "label" }, kind === "meaning" ? "次の語の意味は？" : "空欄に入る語の基本形は？"),
      kind === "meaning"
        ? el("p", { class: "askWord", tabindex: "-1" }, `${word.headword}【${word.kanji}】`)
        : el("p", { class: "cloze", tabindex: "-1" }, word.cloze),
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
        if (choice === correct) button.classList.add("correct", "is-settling");
        else if (choice === session.picked) button.classList.add("wrong", "is-shaking");
      }
      button.addEventListener("click", () => answerQuiz(kind, choice, correct));
      choices.appendChild(button);
    });
    box.appendChild(choices);
    if (!session.answered) box.appendChild(el("p", { class: "hint kbdHint" }, "キーボード: 1〜4で回答"));

    if (session.answered) {
      const isCorrect = session.picked === correct;
      box.appendChild(el("div", { class: `feedback ${isCorrect ? "ok" : "ng"}`, role: "status", "aria-live": "polite", "aria-atomic": "true", tabindex: "-1" },
        el("h3", {}, isCorrect ? "○ 正解" : "× 不正解"),
        el("p", {}, `${word.headword}【${word.kanji}】：${meaningText(word)}`),
      ));
      box.appendChild(el("p", { class: "hint kbdHint" }, "Enterで次の問題へ"));
      box.appendChild(el("div", { class: "quizNextAction" },
        el("button", { class: "cta next", onclick: () => nextQuiz(kind) }, index === order.length - 1 ? "次へ →" : "次の問題 →"),
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
        progress.items[wordId] = KobunSrs.record(progress.items[wordId], isCorrect);
        appendHistory({ kind: "meaning", wordId, result: isCorrect ? "correct" : "wrong" }, progress);
        saveProgressFor(entry?.setId || state.setId, progress);
      } else if (session.mode === "final") {
        appendHistory({ kind: "final", wordId: id, result: isCorrect ? "correct" : "wrong" });
      }
      if (session.mode === "final" && index === session.meaningOrder.length - 1) saveFinalResult();
    } else {
      if (isCorrect) session.contextCorrect++;
      const u = unit(id);
      u.learned = true;
      u.solvedCorrect = isCorrect;
      u.needsReview = !isCorrect;
      u.lastAnsweredAt = new Date().toISOString();
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
    else if (kind === "meaning") session.stage = (session.mode === "final" || session.mode === "meaningReview") ? "done" : "context";
    else session.stage = "done";
    renderSession();
    ($(".askWord") || $(".cloze"))?.focus({ preventScroll: true });
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
    const list = el("div", { class: "reviewList" });
    session.wrongMeaningIds.forEach((id, index) => {
      const entry = reviewEntryByKey(id);
      const word = wordForSession(id);
      const checked = session.reviewedIds.includes(id);
      if (checked) {
        list.appendChild(el("div", { class: "wordRow done" },
          el("span", { class: "wordNo" }, index + 1),
          el("span", { class: "wordName" }, `${word.headword}【${word.kanji}】`),
          el("span", { class: "wordStatus" }, "✓ 確認済み"),
        ));
        return;
      }
      const card = wordCard(word);
      card.classList.add("reviewCard");
      card.appendChild(el("button", { class: "ghost", onclick: () => {
        if (!session.reviewedIds.includes(id)) {
          session.reviewedIds.push(id);
          appendHistory({ kind: "wrong-review", wordId: entry?.word.id || id, result: "viewed" }, entry?.progress || state.progress);
          saveProgressFor(entry?.setId || state.setId, entry?.progress || state.progress);
        }
        renderSession();
      } }, "確認した"));
      list.appendChild(card);
    });
    panel.appendChild(list);
    const complete = session.reviewedIds.length === session.wrongMeaningIds.length;
    panel.appendChild(el("button", { class: "cta", disabled: !complete, onclick: () => {
      if (!complete) return;
      session.stage = (session.mode === "final" || session.mode === "meaningReview") ? "done" : "context";
      session.answered = false;
      session.choices = null;
      renderSession();
    } }, complete ? ((session.mode === "final" || session.mode === "meaningReview") ? "結果を見る →" : "文中問題へ →") : `残り${session.wrongMeaningIds.length - session.reviewedIds.length}語を確認`));
  }

  function saveFinalResult() {
    const final = state.progress.finalCheck || (state.progress.finalCheck = {});
    const wasCleared = Boolean(final.cleared);
    final.lastScore = session.meaningCorrect;
    final.bestScore = Math.max(final.bestScore || 0, session.meaningCorrect);
    final.lastTriedAt = new Date().toISOString();
    if (session.meaningCorrect >= passScore()) {
      final.cleared = true;
      final.clearedAt = new Date().toISOString();
    }
    session.firstClear = !wasCleared && final.cleared === true;
    saveProgress();
  }

  function renderDone(panel) {
    clearResume();
    const isFinal = session.mode === "final";
    const isMeaningReview = session.mode === "meaningReview";
    const score = (isFinal || isMeaningReview) ? session.meaningCorrect : session.contextCorrect;
    const total = (isFinal || isMeaningReview) ? session.meaningOrder.length : session.contextOrder.length;
    const passed = isFinal && score >= passScore();
    const finalCleared = state.progress.finalCheck?.cleared;
    const celebrateFirstClear = isFinal && passed && session.firstClear;
    panel.appendChild(el("section", { class: `doneBanner${passed ? " doneBanner--success" : ""}` },
      el("p", { class: "label" }, "学習結果"),
      el("div", { class: `score${celebrateFirstClear ? " is-settling" : ""}` }, `${score} / ${total}`),
      el("h2", {}, isFinal ? (passed ? `${state.set.meta.title} CLEAR` : "最終チェック完了") : isMeaningReview ? "意味だけ復習が完了しました" : (session.mode === "review" ? "誤答復習が完了しました" : "通常学習が完了しました")),
      celebrateFirstClear ? el("p", { class: "clearBadge" }, "✓ 初めてのCLEARです") : null,
      el("p", {}, isFinal ? `${passScore()}/${state.set.words.length}問以上でCLEAR` : isMeaningReview ? "正解した語は次の復習日へ、誤答した語は要再確認へ戻りました。" : (reviewIds().length ? `復習対象があと${reviewIds().length}語あります。` : "全語の文中問題に正解しました。")),
    ));
    const actions = el("div", { class: "actions" });
    if (!isMeaningReview && reviewIds().length) actions.appendChild(el("button", { class: "cta reviewCta", onclick: startReview }, `間違えた${reviewIds().length}語を復習する →`));
    else if (isMeaningReview && dueMeaningEntries().length) actions.appendChild(el("button", { class: "cta reviewCta", onclick: startMeaningReview }, `要再確認の${Math.min(dueMeaningEntries().length, MEANING_SESSION_SIZE)}語をもう一度解く →`));
    else if (!isFinal && allSolved() && !finalCleared) {
      actions.appendChild(el("p", { class: "hint actionHint" }, `意味${state.set.words.length}問のうち${passScore()}問以上でCLEAR`));
      actions.appendChild(el("button", { class: "cta reviewCta", onclick: startFinal }, "最終チェックへ →"));
    }
    else if (!isFinal && finalCleared) actions.appendChild(el("p", { class: "hint actionHint" }, "最終チェックは実施済みです。"));
    else if (isFinal && !passed) actions.appendChild(el("button", { class: "cta reviewCta", onclick: startFinal }, "もう一度挑戦する"));
    else if (isFinal && passed) {
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
    const progress = loadProgressFor(setId, set);
    state.setId = setId;
    state.set = set;
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
      cloud = KobunCloud.create({
        appId: APP_ID,
        getPatch: () => ({
          datasetId: state.setId,
          progress: state.progress,
          meta: { lastDatasetId: state.setId },
        }),
        applyLoaded: applyCloudProgress,
        onStatus: setShareStatus,
      });
      await cloud.init();
      const savedSetId = localStorage.getItem(SET_KEY);
      await loadSet(state.manifest.sets[savedSetId] ? savedSetId : state.manifest.defaultSetId);
      await loadReviewPool();
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
