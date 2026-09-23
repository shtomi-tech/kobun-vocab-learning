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

  // 縦書きの和歌本文。上の句（初句〜三句）と下の句（四句・結句）を段差を付けて並べる。
  function verse(poem, { size = "card", reading = false } = {}) {
    const lines = poem.phrases.map((_, index) => el("span", {
      class: `wgKu${index >= 3 ? " wgKu--shimo" : ""}`,
      style: `--ku:${index}`,
    },
    el("span", { class: "wgKuText" }, phraseContent(poem, index)),
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

  // ホームに置く入口カード。
  function teaserCard(poems, { onOpen }) {
    const poem = dailyPick(poems);
    if (!poem) return null;
    const open = () => onOpen(poem.key);
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
          el("div", { class: "wgTeaserActions" },
            el("button", { class: "wgButton wgButton--gold", type: "button", onclick: () => onOpen(null) }, "歌の間をひらく"),
            el("button", { class: "wgButton", type: "button", onclick: open }, "この歌を詳しく見る"),
          ),
        ),
        el("button", { class: "wgTeaserShikishi", type: "button", onclick: open, "aria-label": `今日の一首を詳しく見る：${poem.phrases.join(" ")}` },
          verse(poem, { size: "teaser" }),
        ),
      ),
    );
  }

  // 「歌の間」画面。panel に描画し、戻るときは onClose を呼ぶ。
  function render(panel, poems, { onClose, initialKey = null }) {
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

    const filterButtons = [["all", `すべて`, poems.length], ...collections.map((name) => [
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
        el("p", { class: "wgLead" }, "学習セットの例文として採っている和歌を集めました。札を選ぶと、訳と、その歌で学ぶ語を確かめられます。"),
      ),
      el("div", { class: "wgToolbar" }, filterBar, readingToggle),
      count,
      grid,
    );

    function drawGrid() {
      visible = filter === "all" ? poems : poems.filter((poem) => poem.collection === filter);
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

    function drawDetail() {
      const poem = visible[current];
      if (!poem) return;
      dialog.innerHTML = "";
      const refParts = [poem.collection, poem.refText].filter(Boolean);
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
              el("section", { class: "wgBlock" },
                el("h4", {}, "現代語訳"),
                el("p", { class: "wgTranslation" }, poem.translation),
              ),
              el("section", { class: "wgBlock" },
                el("h4", {}, "句ごとのよみ"),
                el("ol", { class: "wgYomiList" }, poem.phrases.map((phrase, index) => el("li", {},
                  el("span", { class: "wgYomiLabel" }, KU_LABELS[index]),
                  el("span", { class: "wgYomiPhrase" }, phraseContent(poem, index)),
                  el("span", { class: "wgYomiKana" }, poem.reading[index]),
                ))),
              ),
              el("section", { class: "wgBlock" },
                el("h4", {}, "この歌で学ぶ語"),
                el("ul", { class: "wgWords", role: "list" }, poem.targets.map((target) => el("li", { class: "wgWord" },
                  el("span", { class: "wgWordHead" }, target.headword, el("span", { class: "wgWordKanji" }, `【${target.kanji}】`)),
                  el("span", { class: "wgWordMeaning" }, target.meaning),
                  el("span", { class: "wgWordSet" }, target.setLabel),
                ))),
              ),
            ),
          ),
          el("div", { class: "wgDetailNav" },
            el("button", { class: "wgButton", type: "button", onclick: () => step(1), "aria-label": "次の歌" }, "← 次の歌"),
            el("button", { class: "wgButton", type: "button", onclick: () => step(-1), "aria-label": "前の歌" }, "前の歌 →"),
          ),
        ),
      );
    }

    drawGrid();
    const initialIndex = initialKey ? visible.findIndex((poem) => poem.key === initialKey) : -1;
    if (initialIndex >= 0) openDetail(initialIndex);
    else panel.querySelector(".wgBack")?.focus();
  }

  return { collect, dailyPick, teaserCard, render };
})();

if (typeof module !== "undefined") module.exports = KobunWakaGallery;
