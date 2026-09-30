"use strict";

// 「歌の間」（試験公開）。各セットで例文として採用している和歌を一覧・鑑賞する画面。
// 学習フロー・保存データには触れず、読み込み済みのセットから和歌を集めて表示するだけ。
// 見た目は static/waka-gallery.css に閉じ込め、既存画面のデザインへ波及させない。
const KobunWakaGallery = (() => {
  const { isWaka, wakaRefText, wakaBlankPart } = KobunExampleParts;
  const KU_LABELS = ["初句", "二句", "三句", "四句", "結句"];
  const COLLECTION_ORDER = [
    "万葉集", "古今和歌集", "後撰和歌集", "拾遺和歌集", "後拾遺和歌集", "金葉和歌集",
    "詞花和歌集", "千載和歌集", "新古今和歌集", "続後撰和歌集", "新拾遺和歌集",
  ];
  const READING_KEY = "kobun_waka_gallery_reading";
  const POS_CLASS = {
    名詞: "noun", 動詞: "verb", 形容詞: "adj", 形容動詞: "adj", 副詞: "adv", 連体詞: "adv",
    接続詞: "adv", 感動詞: "adv", 助動詞: "aux", 助詞: "part", 連語: "phrase", 接頭語: "noun", 接尾語: "noun",
  };
  const posClass = (pos) => POS_CLASS[pos] || "noun";

  const el = (tag, attrs = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value === false || value == null) continue;
      if (key === "class") node.className = value;
      else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? "" : value);
    }
    for (const child of children.flat()) {
      if (child == null) continue;
      node.append(child.nodeType ? child : document.createTextNode(String(child)));
    }
    return node;
  };

  const readPref = () => {
    try { return localStorage.getItem(READING_KEY) === "1"; } catch { return false; }
  };
  const writePref = (value) => {
    try { localStorage.setItem(READING_KEY, value ? "1" : "0"); } catch { /* 保存できなくても表示は続ける */ }
  };

  // sources: [{ setId, set, label }]。例文として表示される（優先順位適用後の）和歌だけを集め、
  // 同じ歌を複数の語が使っていれば1首にまとめる。
  function collect(sources) {
    const poems = new Map();
    sources.forEach(({ setId, set, label }, setIndex) => {
      if (!set?.words) return;
      set.words.forEach((word) => {
        if (!isWaka(word)) return;
        let poem = poems.get(word.example);
        if (!poem) {
          poem = {
            key: word.example,
            phrases: word.waka.phrases,
            reading: word.waka.reading,
            author: word.waka.author,
            collection: word.waka.ref?.collection || word.source,
            refText: wakaRefText(word),
            translation: word.translation,
            order: setIndex,
            targets: [],
          };
          poems.set(word.example, poem);
        }
        poem.targets.push({
          id: word.id,
          headword: word.headword,
          kanji: word.kanji,
          meaning: (word.meanings || [])[0] || "",
          setId,
          setLabel: label,
          part: wakaBlankPart(word),
        });
      });
    });
    return [...poems.values()].sort((a, b) => a.order - b.order);
  }

  // 端末の日付ごとに同じ1首を選ぶ（ホームの「今日の一首」）。
  function dailyPick(poems, date = new Date()) {
    if (!poems.length) return null;
    const seed = date.getFullYear() * 372 + date.getMonth() * 31 + date.getDate();
    return poems[(seed * 2654435761 >>> 0) % poems.length];
  }

  // 句の中の見出し語部分に印を付ける。
  function phraseContent(poem, index) {
    const phrase = poem.phrases[index];
    const ranges = poem.targets
      .filter((target) => target.part?.index === index)
      .map((target) => target.part)
      .sort((a, b) => a.start - b.start);
    if (!ranges.length) return [phrase];
    const nodes = [];
    let cursor = 0;
    for (const range of ranges) {
      if (range.start < cursor) continue;
      if (range.start > cursor) nodes.push(phrase.slice(cursor, range.start));
      nodes.push(el("mark", { class: "wgTarget" }, phrase.slice(range.start, range.end)));
      cursor = range.end;
    }
    if (cursor < phrase.length) nodes.push(phrase.slice(cursor));
    return nodes;
  }

  // 句の中の問題の対象（最初に現れる箇所）に印を付ける。
  function highlightContent(phrase, text) {
    const start = text ? phrase.indexOf(text) : -1;
    if (start < 0) return [phrase];
    return [phrase.slice(0, start), el("mark", { class: "wgTarget" }, text), phrase.slice(start + text.length)];
  }

  // 縦書きの和歌本文。上の句（初句〜三句）と下の句（四句・結句）を段差を付けて並べる。
  // tokens を渡すと、見出し語の傍線の代わりに品詞分解（助動詞・助詞の印）で描く。
  // highlight（{ ku, text }）を渡すと、見出し語の代わりに問題の対象へ傍線を引く。
  function verse(poem, { size = "card", reading = false, tokens = null, selected = null, highlight = null } = {}) {
    const kuText = (index) => (tokens
      ? tokens[index].map((token, tokenIndex) => el("span", {
        class: `wgTok wgTok--${posClass(token.p)}${selected?.ku === index && selected?.i === tokenIndex ? " is-selected" : ""}`,
      }, token.t))
      : highlight ? highlightContent(poem.phrases[index], highlight.ku === index ? highlight.text : null)
        : phraseContent(poem, index));
    const lines = poem.phrases.map((_, index) => el("span", {
      class: `wgKu${index >= 3 ? " wgKu--shimo" : ""}`,
      style: `--ku:${index}`,
    },
    el("span", { class: "wgKuText" }, kuText(index)),
    reading ? el("span", { class: "wgKuYomi", "aria-hidden": "true" }, poem.reading[index]) : null,
    ));
    return el("p", {
      class: `wgVerse wgVerse--${size}`,
      lang: "ja",
      "aria-label": poem.phrases.join(" "),
    }, lines);
  }

  function wordChips(poem) {
    return el("ul", { class: "wgChips", role: "list" }, poem.targets.map((target) =>
      el("li", { class: "wgChip" }, target.headword),
    ));
  }

  // ---------- 今日の10首（和歌で文法） ----------
  // 文法解説のある歌から、端末の日付ごとに10首を選んで確認問題を解く。
  // 並びは本文から決まる固定順で、1日ごとに10首ずつ進むので、全首を一巡してから同じ歌に戻る。
  // 当日の進みは kobun_waka_daily に端末ごとに保存する（学習進捗・端末間同期の対象外）。
  const DAILY_KEY = "kobun_waka_daily";
  const DAILY_SIZE = 10;

  const dateKey = (date) => [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((n, i) => (i ? String(n).padStart(2, "0") : String(n))).join("-");
  const dayNumber = (date) => Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
  const hashKey = (text) => {
    let h = 2166136261;
    for (const ch of text) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0;
    return h;
  };

  function dailyPoems(poems, date = new Date(), size = DAILY_SIZE) {
    if (!poems.length) return [];
    const order = [...poems].sort((a, b) => hashKey(a.key) - hashKey(b.key) || (a.key < b.key ? -1 : 1));
    const n = Math.min(size, order.length);
    const start = (dayNumber(date) * n) % order.length;
    return Array.from({ length: n }, (_, i) => order[(start + i) % order.length]);
  }

  // 保存形：{ date, keys: [和歌本文], total, picked: [選んだ選択肢の番号] }。picked は問題の並び順。
  const readDaily = () => {
    try { return JSON.parse(localStorage.getItem(DAILY_KEY) || "null"); } catch { return null; }
  };
  const writeDaily = (value) => {
    try { localStorage.setItem(DAILY_KEY, JSON.stringify(value)); } catch { /* 保存できなくても解答は続ける */ }
  };

  // ホームの入口に出す当日の状況。未着手なら null。
  function dailyStatus(date = new Date()) {
    const saved = readDaily();
    if (!saved || saved.date !== dateKey(date) || !saved.picked?.length || !saved.total) return null;
    return { answered: saved.picked.length, total: saved.total, done: saved.picked.length >= saved.total };
  }

  // 「今日の10首」画面。grammar は歌の間と同じ { rules, byKey }。
  function renderDaily(panel, allPoems, { grammar, onClose, onOpenPoem, date = new Date() }) {
    const today = dateKey(date);
    const candidates = allPoems.filter((poem) => grammar?.byKey.has(poem.key));
    const byKey = new Map(candidates.map((poem) => [poem.key, poem]));
    const saved = readDaily() || {};
    // 同じ日のうちは、開いたときに選ばれた歌を保つ（データが増えても当日の出題は変えない）。
    const savedPoems = saved?.date === today ? (saved.keys || []).map((key) => byKey.get(key)).filter(Boolean) : [];
    const poems = savedPoems.length && savedPoems.length === (saved.keys || []).length ? savedPoems : dailyPoems(candidates, date);
    const items = poems.flatMap((poem, p) => grammar.byKey.get(poem.key).quiz.map((item, q) => ({ poem, p, q, item })));
    const sameSet = savedPoems === poems;
    const picked = sameSet && Array.isArray(saved.picked) ? saved.picked.slice(0, items.length) : [];
    const keys = poems.map((poem) => poem.key);
    const persist = () => writeDaily({ date: today, keys, total: items.length, picked });
    if (!sameSet) persist();
    renderGrammarLesson(panel, poems, {
      grammar,
      onClose,
      onHome: onClose,
      onOpenPoem,
      daily: true,
      initialPicked: picked,
      persist,
    });
  }

  function renderPoemLesson(panel, poem, { grammar, onClose, onHome }) {
    if (!poem || !grammar?.byKey.has(poem.key)) return;
    renderGrammarLesson(panel, [poem], {
      grammar,
      onClose,
      onHome,
      backLabel: "← 歌の間へ戻る",
    });
  }

  function renderGrammarLesson(panel, poems, {
    grammar,
    onClose,
    onHome = onClose,
    onOpenPoem = null,
    daily = false,
    initialPicked = [],
    persist = () => {},
    backLabel = "← ホームへ戻る",
  }) {
    const items = poems.flatMap((poem, p) => grammar.byKey.get(poem.key).quiz.map((item, q) => ({ poem, p, q, item })));
    // 解き直しは間違えた問題だけを並べ直して解く（保存はしない）。
    let retry = null;
    // 表示中の問題の位置。解答すると picked は先に伸びるので、「次へ」を押すまで位置は進めない。
    let picked = initialPicked;
    let pos = picked.length;
    let showReading = readPref();
    let order = null;
    let orderFor = -1;
    const save = () => { if (daily) persist(); };

    panel.innerHTML = "";
    panel.closest(".wrap")?.classList.add("wakaFocus");
    panel.classList.add("wgRoom");
    const body = el("div", { class: "wdBody" });
    panel.append(
      el("header", { class: "wgHeader wdHeader" },
        el("button", { class: "wgBack", type: "button", onclick: onClose }, backLabel),
        el("h2", { class: "wgTitle" }, daily ? "和歌で文法" : "この歌で文法を学ぶ"),
      ),
      body,
    );

    const current = () => (retry ? retry.list[retry.index] : items[pos]);

    function choiceOrder(item, index) {
      if (orderFor !== index || !order) {
        order = item.choices.map((_, i) => i);
        for (let i = order.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [order[i], order[j]] = [order[j], order[i]];
        }
        orderFor = index;
      }
      return order;
    }

    function progressBar(answered, total, label) {
      return el("div", { class: "wdProgress" },
        el("p", { class: "wdProgressText", role: "status", "aria-live": "polite", "aria-atomic": "true" }, label),
        el("div", {
          class: "wdBar",
          role: "progressbar",
          "aria-label": "解答の進み",
          "aria-valuemin": "0",
          "aria-valuemax": String(total),
          "aria-valuenow": String(answered),
        }, el("span", { style: `width:${total ? (answered / total) * 100 : 0}%` })),
      );
    }

    const reviewBadge = (item) => (item.review === "needs-check"
      ? el("span", { class: "wgReview" }, "要確認")
      : null);

    function grammarDetails(entry) {
      const tokenRows = (entry.tokens || []).map((tokens, ku) => el("li", {},
        el("span", { class: "wgYomiLabel" }, KU_LABELS[ku]),
        el("div", { class: "wdGrammarTokens" }, tokens.map((item) => el("details", { class: `wdGrammarToken wgPos wgPos--${posClass(item.p)}` },
          el("summary", {},
            el("span", { class: "wgPosText" }, item.t),
            el("span", { class: "wgPosName" }, item.p),
            reviewBadge(item),
          ),
          el("p", { class: "wdTokenDescription" }, item.d || "説明はありません。"),
        ))),
      ));
      return el("details", { class: "wdGrammarDetails" },
        el("summary", {}, "詳しい文法を見る"),
        el("div", { class: "wdGrammarBody" },
          el("p", { class: "wgDraftNote" }, el("span", { class: "wgReview" }, "試作"),
            "AIによる下書きです。解釈に確認が必要な箇所には「要確認」を付けています。"),
          tokenRows.length ? el("section", { class: "wgBlock" },
            el("h4", {}, "品詞分解・語の意味"),
            el("ol", { class: "wgParse" }, tokenRows),
          ) : null,
          entry.notes?.length ? el("section", { class: "wgBlock" },
            el("h4", {}, "文法メモ"),
            el("ul", { class: "wgNotes", role: "list" }, entry.notes.map((note) => el("li", { class: "wgNote" },
              el("span", { class: "wgNoteKind" }, note.kind, reviewBadge(note)),
              el("span", {}, note.text),
            ))),
          ) : null,
        ),
      );
    }

    // 問題を1問ずつ出す。answer が渡されていれば、その解答の結果と解説を出す。
    function drawQuestion({ answer = null, focus = ".wgChoice" } = {}) {
      const entry = current();
      const index = retry ? retry.index : pos;
      const total = retry ? retry.list.length : items.length;
      const { poem, item } = entry;
      const poemItems = items.filter((other) => other.poem === poem);
      const qInPoem = entry.q;
      const answered = answer != null;
      const lastInPoem = retry
        ? retry.index + 1 >= retry.list.length || retry.list[retry.index + 1].poem !== poem
        : qInPoem + 1 >= poemItems.length;
      const lastOverall = index + 1 >= total;
      const refParts = [poem.collection, poem.refText].filter(Boolean);
      const readingToggle = el("button", {
        class: "wdReadingToggle",
        type: "button",
        "aria-pressed": showReading ? "true" : "false",
        onclick: () => {
          showReading = !showReading;
          writePref(showReading);
          drawQuestion({ answer, focus: ".wdReadingToggle" });
        },
      }, "よみがなを添える");

      body.innerHTML = "";
      body.append(
        progressBar(answered ? index + 1 : index, total, retry
          ? `解き直し ${index + 1} / ${total}問`
          : daily
            ? `${entry.p + 1} / ${poems.length}首　問題 ${index + 1} / ${total}問`
            : `問題 ${index + 1} / ${total}問`),
        el("div", { class: "wdStage" },
          el("figure", { class: "wgShikishi wdPoem" },
            verse(poem, { size: "detail", reading: showReading, highlight: item.target }),
          ),
          el("div", { class: "wgInfo" },
            el("p", { class: "wdPoemMeta" }, [poem.author, ...refParts].filter(Boolean).join("　／　")),
            el("div", { class: "wdTools" }, readingToggle),
            el("section", { class: "wgBlock wgQuiz" },
              el("h4", {}, `確認問題 ${qInPoem + 1} / ${poemItems.length}`),
              el("p", { class: "wgQuizMeta" }, `${KU_LABELS[item.target.ku]}「${item.target.text}」`),
              el("p", { class: "wgQuizQuestion" }, item.question),
              el("div", { class: "wgChoices", role: "group", "aria-label": "選択肢" }, choiceOrder(item, `${retry ? "r" : ""}${index}`).map((choiceIndex) => {
                const mark = !answered ? "" : choiceIndex === item.answer ? "○" : choiceIndex === answer ? "×" : "";
                const state = !answered ? "" : choiceIndex === item.answer ? " is-correct" : choiceIndex === answer ? " is-wrong" : "";
                return el("button", {
                  class: `wgChoice${state}`,
                  type: "button",
                  disabled: answered,
                  onclick: () => {
                    if (retry) retry.picked[retry.index] = choiceIndex;
                    else { picked.push(choiceIndex); save(); }
                    drawQuestion({ answer: choiceIndex, focus: ".wgQuizFeedback" });
                  },
                }, el("span", { class: "wgChoiceMark", "aria-hidden": "true" }, mark), item.choices[choiceIndex]);
              })),
              answered ? feedback(item, answer) : null,
            ),
            answered && lastInPoem ? el("section", { class: "wgBlock" },
              el("h4", {}, "この歌の現代語訳"),
              el("p", { class: "wgTranslation" }, poem.translation),
            ) : null,
            answered ? el("div", { class: "wdNext" }, el("button", {
              class: "wgButton wgButton--gold",
              type: "button",
              onclick: () => {
                if (retry) retry.index++;
                else pos++;
                if (lastOverall) drawResult();
                else drawQuestion();
              },
            }, lastOverall ? "結果を見る" : lastInPoem ? "次の歌へ" : "次の問題")) : null,
            grammarDetails(grammar.byKey.get(poem.key)),
          ),
        ),
      );
      if (focus) body.querySelector(focus)?.focus();
    }

    function feedback(item, answer) {
      const ok = answer === item.answer;
      return el("div", { class: `wgQuizFeedback ${ok ? "is-ok" : "is-ng"}`, role: "status", "aria-live": "polite", "aria-atomic": "true", tabindex: "-1" },
        el("p", { class: "wgQuizResult" }, ok ? "○ 正解" : `× 不正解　正解は「${item.choices[item.answer]}」`),
        el("p", {}, item.explain),
        el("details", { class: "wgQuizRules" },
          el("summary", {}, "文法の根拠を見る"),
          el("p", {}, item.rules.map((rule) => grammar.rules[rule] || rule).join("／")),
        ),
      );
    }

    function drawResult() {
      const results = items.map((entry, i) => ({ ...entry, ok: picked[i] === entry.item.answer }));
      const score = results.filter((result) => result.ok).length;
      const wrong = results.filter((result) => !result.ok);
      const retryScore = retry ? retry.list.filter((entry, i) => retry.picked[i] === entry.item.answer).length : null;
      body.innerHTML = "";
      body.append(
        el("section", { class: "wdResult" },
          el("p", { class: "wgEyebrow" }, daily ? "今日の結果" : "この歌の結果"),
          el("p", { class: "wgQuizDone", tabindex: "-1" }, `${items.length}問中 ${score}問 正解`),
          retry ? el("p", { class: "wdRetryScore" }, `解き直し：${retry.list.length}問中 ${retryScore}問 正解`) : null,
          daily || poems.length > 1 ? el("details", { class: "wdResultDetails" },
            el("summary", {}, "歌ごとの結果を見る"),
            el("ol", { class: "wdResultList" }, poems.map((poem, p) => {
              const own = results.filter((result) => result.p === p);
              const okCount = own.filter((result) => result.ok).length;
              return el("li", { class: "wdResultItem" },
                el("span", { class: "wdResultMark", "aria-hidden": "true" }, okCount === own.length ? "○" : "×"),
                el("span", { class: "wdResultPoem" },
                  el("span", { class: "wdResultVerse" }, poem.phrases.join(" ")),
                  el("span", { class: "wdResultMeta" }, `${poem.author}　${okCount} / ${own.length}問 正解`),
                ),
                onOpenPoem ? el("button", { class: "wgButton wdResultOpen", type: "button", onclick: () => onOpenPoem(poem.key) }, "歌の間で見る") : null,
              );
            })),
          ) : null,
          el("div", { class: "wdResultActions" },
            wrong.length && !retry ? el("button", {
              class: "wgButton wgButton--gold",
              type: "button",
              onclick: () => {
                retry = { list: wrong, index: 0, picked: [] };
                drawQuestion();
              },
            }, `間違えた${wrong.length}問を解き直す`) : null,
            el("button", { class: `wgButton${wrong.length && !retry ? "" : " wgButton--gold"}`, type: "button", onclick: onHome }, "ホームへ戻る"),
          ),
        ),
      );
      body.querySelector(".wgQuizDone")?.focus();
    }

    if (!items.length) {
      body.append(el("p", { class: "wgLead" }, "出題できる和歌がありません。"));
      panel.querySelector(".wgBack")?.focus();
    } else if (picked.length >= items.length) drawResult();
    else {
      drawQuestion({ focus: null });
      panel.querySelector(".wgBack")?.focus();
    }
  }

  // ホームに置く入口カード。
  function teaserCard(poems, { onOpen, onDaily = null }) {
    const poem = dailyPick(poems);
    if (!poem) return null;
    const open = () => onOpen(poem.key);
    const status = onDaily ? dailyStatus() : null;
    return el("section", { class: "card wgTeaser", "aria-labelledby": "wgTeaserTitle" },
      el("div", { class: "wgTeaserBody" },
        el("div", { class: "wgTeaserText" },
          el("p", { class: "wgEyebrow" }, el("span", { class: "wgBadge" }, "試験公開"), "今日の一首"),
          el("h2", { id: "wgTeaserTitle" }, "歌の間"),
          el("p", { class: "wgTeaserLead" }, `例文で出会う和歌 ${poems.length}首を、縦書きで味わえます。`),
          el("p", { class: "wgTeaserMeta" },
            `${poem.author}　／　${poem.collection}`,
          ),
          wordChips(poem),
          onDaily ? el("p", { class: "wgTeaserDaily" },
            !status ? `和歌で文法：今日の${DAILY_SIZE}首に答えましょう。`
              : status.done ? `和歌で文法：今日の${DAILY_SIZE}首は完了しました。`
                : `和歌で文法：${status.total}問中 ${status.answered}問まで解答済み。`) : null,
          el("div", { class: "wgTeaserActions" },
            onDaily ? el("button", { class: "wgButton wgButton--gold", type: "button", onclick: onDaily },
              !status ? `今日の${DAILY_SIZE}首を始める` : status.done ? "今日の結果を見る" : `今日の${DAILY_SIZE}首を続ける`) : null,
            el("button", { class: `wgTextLink${onDaily ? "" : " wgTextLink--primary"}`, type: "button", onclick: () => onOpen(null) }, "和歌一覧を見る"),
          ),
        ),
        el("button", { class: "wgTeaserShikishi", type: "button", onclick: open, "aria-label": `今日の一首を詳しく見る：${poem.phrases.join(" ")}` },
          verse(poem, { size: "teaser" }),
        ),
      ),
    );
  }

  // 「歌の間」画面。panel に描画し、戻るときは onClose を呼ぶ。
  // grammar: { rules, byKey: Map<和歌本文, 文法解説> }。無ければ文法の層を出さない。
  function render(panel, poems, { onClose, initialKey = null, grammar = null, onLearnPoem = null }) {
    panel.closest(".wrap")?.classList.remove("wakaFocus");
    const grammarOf = (poem) => grammar?.byKey.get(poem.key) || null;
    const grammarCount = poems.filter(grammarOf).length;
    // 一部の歌だけに文法解説がある間は、しぼりこみと札の印で見分けられるようにする。
    const grammarPartial = grammarCount > 0 && grammarCount < poems.length;
    const collections = [...new Set(poems.map((poem) => poem.collection))]
      .sort((a, b) => {
        const ia = COLLECTION_ORDER.indexOf(a);
        const ib = COLLECTION_ORDER.indexOf(b);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      });
    let filter = "all";
    let showReading = readPref();
    let current = -1;
    let visible = poems;
    panel.innerHTML = "";
    panel.classList.add("wgRoom");

    const grid = el("ul", { class: "wgGrid", role: "list" });
    const count = el("p", { class: "wgCount", role: "status", "aria-live": "polite" });

    const filterButtons = [
      ["all", "すべて", poems.length],
      ...(grammarPartial ? [["grammar", "文法解説つき", grammarCount]] : []),
      ...collections.map((name) => [
      name, name, poems.filter((poem) => poem.collection === name).length,
    ])].map(([value, label, n]) => el("button", {
      class: "wgFilter",
      type: "button",
      "aria-pressed": value === filter ? "true" : "false",
      onclick: (event) => {
        filter = value;
        filterBar.querySelectorAll(".wgFilter").forEach((button) => button.setAttribute("aria-pressed", "false"));
        event.currentTarget.setAttribute("aria-pressed", "true");
        drawGrid();
      },
    }, label, el("span", { class: "wgFilterCount" }, n)));
    const filterBar = el("div", { class: "wgFilters", role: "group", "aria-label": "歌集でしぼりこむ" }, filterButtons);

    const readingToggle = el("button", {
      class: "wgButton wgButton--toggle",
      type: "button",
      "aria-pressed": showReading ? "true" : "false",
      onclick: () => {
        showReading = !showReading;
        writePref(showReading);
        readingToggle.setAttribute("aria-pressed", showReading ? "true" : "false");
        if (dialog.open) drawDetail();
      },
    }, "よみがなを添える");

    panel.append(
      el("header", { class: "wgHeader" },
        el("div", { class: "wgMoon", "aria-hidden": "true" }),
        el("button", { class: "wgBack", type: "button", onclick: onClose }, "← ホームへ戻る"),
        el("p", { class: "wgEyebrow" }, el("span", { class: "wgBadge" }, "試験公開"), "Waka Gallery"),
        el("h2", { class: "wgTitle" }, "歌の間"),
        el("p", { class: "wgLead" }, "学習セットの例文として採っている和歌を集めました。歌を選ぶと、訳と、その歌で学ぶ語を確かめられます。",
          grammarCount ? "文法の解説がある歌からは、その歌の確認問題にも進めます。" : ""),
      ),
      el("div", { class: "wgToolbar" }, filterBar, readingToggle),
      count,
      grid,
    );

    function drawGrid() {
      visible = filter === "all" ? poems
        : filter === "grammar" ? poems.filter(grammarOf)
          : poems.filter((poem) => poem.collection === filter);
      count.textContent = `${visible.length}首`;
      grid.innerHTML = "";
      visible.forEach((poem, index) => {
        grid.appendChild(el("li", { class: "wgItem", style: `--i:${Math.min(index, 18)}` },
          el("button", {
            class: "wgTanzaku",
            type: "button",
            "data-key": poem.key,
            "aria-label": `${poem.phrases.join(" ")}（${poem.author}）を詳しく見る`,
            onclick: () => openDetail(index),
          },
          grammarPartial && grammarOf(poem) ? el("span", { class: "wgSeal" }, "文法") : null,
          verse(poem, { size: "card" }),
          el("span", { class: "wgTanzakuFoot" },
            el("span", { class: "wgAuthor" }, poem.author),
            el("span", { class: "wgCollection" }, poem.collection),
          ),
          ),
          wordChips(poem),
        ));
      });
    }

    // 詳細は <dialog> で開く（フォーカスの閉じ込めと Esc での閉鎖をブラウザに任せる）。
    const dialog = el("dialog", { class: "wgDialog", "aria-labelledby": "wgDetailTitle" });
    dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft") { event.preventDefault(); step(1); }
      else if (event.key === "ArrowRight") { event.preventDefault(); step(-1); }
    });
    dialog.addEventListener("close", () => {
      const poem = visible[current];
      const card = poem && grid.querySelector(`[data-key="${CSS.escape(poem.key)}"]`);
      card?.focus();
    });
    panel.appendChild(dialog);

    function step(delta) {
      if (!visible.length) return;
      current = (current + delta + visible.length) % visible.length;
      drawDetail();
    }

    function openDetail(index) {
      current = index;
      drawDetail();
      if (!dialog.open) dialog.showModal();
      dialog.querySelector(".wgClose")?.focus();
    }

    function drawDetail({ focus = null } = {}) {
      const poem = visible[current];
      if (!poem) return;
      const entry = grammarOf(poem);
      dialog.innerHTML = "";
      const refParts = [poem.collection, poem.refText].filter(Boolean);
      const viewBlocks = [
        el("section", { class: "wgBlock" },
          el("h4", {}, "現代語訳"),
          el("p", { class: "wgTranslation" }, poem.translation),
        ),
        el("section", { class: "wgBlock" },
          el("h4", {}, "この歌で学ぶ語"),
          el("ul", { class: "wgWords", role: "list" }, poem.targets.map((target) => el("li", { class: "wgWord" },
            el("span", { class: "wgWordHead" }, target.headword, el("span", { class: "wgWordKanji" }, `【${target.kanji}】`)),
            el("span", { class: "wgWordMeaning" }, target.meaning),
            el("span", { class: "wgWordSet" }, target.setLabel),
          ))),
        ),
      ];
      // 縦書きは右から左へ読むので、「次の歌」を左側に置く。
      dialog.append(
        el("div", { class: "wgDetail" },
          el("div", { class: "wgDetailTop" },
            el("p", { class: "wgEyebrow" }, `${current + 1} / ${visible.length}`),
            el("button", { class: "wgClose", type: "button", onclick: () => dialog.close(), "aria-label": "閉じる" }, "×"),
          ),
          el("div", { class: "wgDetailBody" },
            el("figure", { class: "wgShikishi" },
              verse(poem, { size: "detail", reading: showReading }),
              el("figcaption", { class: "wgSignature" }, poem.author),
            ),
            el("div", { class: "wgInfo" },
              el("h3", { id: "wgDetailTitle", class: "wgInfoTitle" }, poem.author),
              el("p", { class: "wgRef" }, refParts.join("　")),
              ...viewBlocks,
              entry && onLearnPoem ? el("button", {
                class: "wgButton wgButton--gold wgPoemGrammarStart",
                type: "button",
                onclick: () => onLearnPoem(poem),
              }, "この歌で文法を学ぶ") : null,
            ),
          ),
          el("div", { class: "wgDetailNav" },
            el("button", { class: "wgButton", type: "button", onclick: () => step(1), "aria-label": "次の歌" }, "← 次の歌"),
            el("button", { class: "wgButton", type: "button", onclick: () => step(-1), "aria-label": "前の歌" }, "前の歌 →"),
          ),
        ),
      );
      if (focus) dialog.querySelector(focus)?.focus();
    }

    drawGrid();
    const initialIndex = initialKey ? visible.findIndex((poem) => poem.key === initialKey) : -1;
    if (initialIndex >= 0) openDetail(initialIndex);
    else panel.querySelector(".wgBack")?.focus();
  }

  return { collect, dailyPick, dailyPoems, dailyStatus, teaserCard, render, renderDaily, renderPoemLesson };
})();

if (typeof module !== "undefined") module.exports = KobunWakaGallery;
