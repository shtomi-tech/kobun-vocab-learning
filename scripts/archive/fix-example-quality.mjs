// 例文品質監査（2026-09-05 第2回）の反映スクリプト。
// 本文・現代語訳・空欄の明確な誤りと、出典欄に残っていた内部作業痕（NDLのコマ番号・底本頁）を直す。
// 語ID・語順・meanings・notes・dataVersion・進捗キーは変更しない。
// JSONを再整形すると既存の整形（短い配列の1行表記）が崩れるため、値の文字列だけを置換する。
import fs from "node:fs";
import path from "node:path";

const dataDir = "data";

// 1. 本文・訳・空欄の修正。[語ID][フィールド] = [置換前, 置換後]
const contentFixes = {
  // ザリは未然形接続。「聞きざり」は成立しないため「聞かざり」に直す。訳の口語も改める。
  "kv07-081": {
    example: ["え聞きざりけり。", "え聞かざりけり。"],
    translation: [
      "「あれま」と言ったけれど、雷が鳴る騒ぎで、（その悲鳴を）耳にすることができなかった。",
      "「ああ」と言ったけれど、雷が鳴る騒ぎで、（その声を）聞くことができなかった。",
    ],
    cloze: ["（　）聞きざりけり。", "（　）聞かざりけり。"],
  },
  // 会話の開き括弧が欠けていた。
  "kv18-205": {
    example: ["人近く聞かざらむは", "「人近く聞かざらむは"],
    cloze: ["人近く聞かざらむは", "「人近く聞かざらむは"],
  },
  // 開き括弧の欠落と、本文にない語（「ここにいる人々に昔の物語を」）の補入を解消する。
  "kv17-195": {
    example: ["さはいにしへの世は", "「さはいにしへの世は"],
    translation: [
      "「まあ、昔の世はこのようであったのだ」と、ここにいる人々に昔の物語を聞かせ申し上げよう、と言うので、…",
      "「それでは、昔の世はこのようであったのだと、聞かせ申し上げよう」と言うので、",
    ],
    cloze: ["さはいにしへの世は", "「さはいにしへの世は"],
  },
  // 空欄が活用語尾「ひ」を外に残していた。見出し語「あふ」の連用形「逢ひ」を一続きで問う。
  "kv02-021": {
    cloze: ["（　）ひける女、", "（　）ける女、"],
  },
  // 「くどく」は嘆きをくり返し述べる意。念仏を唱える意ではない。
  "kv30-354": {
    translation: [
      "仏を恨みながら、念仏を繰り返し唱え申し上げなさる様子は、とても頼もしい。",
      "仏を恨んで繰り返し嘆き申し上げなさる様子は、たいそう頼もしい。",
    ],
  },
  // 同じ竹取物語の一文を扱う kv09-100 の訳、および語義①「思案する」に合わせる。
  "kv35-410": {
    translation: [
      "子安貝を取ろうとお思いになるならば、工夫し申しあげよう。",
      "子安貝をお取りになろうとお思いになるならば、策を思案して申しあげましょう。",
    ],
  },
  // 「ひたすらどんどん」の重ねを整理する。
  "kv34-397": {
    translation: [
      "閉じ込めているところの戸は、すぐに、ひたすらどんどん開いた。",
      "閉じ込めていた所の戸は、たちまち、ひとりでにすっかり開いてしまった。",
    ],
  },
  // 「ご本人が自分で」の重言を解消する。
  "kv29-343": {
    translation: [
      "ご本人が自分で筆を取って、手紙をお書きになる。",
      "ご自身で筆をお取りになって、手紙をお書きになる。",
    ],
  },
  // 本文にない「者でございます」を落とし、本文の係り受けに合わせる。
  "kv11-121": {
    translation: [
      "ただ今参上した者でございます。お返事をいただきましょう。",
      "ただ今参上いたしました、その御返事をいただきましょう。",
    ],
  },
  // 語義（天皇のお怒り）と結びつくよう、故事の含意を訳に補う。
  "kv05-049": {
    translation: ["君主にもまた逆鱗がある。", "君主にもまた、（触れれば激しい怒りを招く）逆鱗がある。"],
  },
};

// 2. 出典表記の修正（旧表記→新表記）
const sourceFixes = new Map([
  // NDLビューアのコマ番号は内部作業用の情報で、学習者向けの出典ではない。
  ["十訓抄（canvas100）", "十訓抄"],
  ["十訓抄（canvas126）", "十訓抄"],
  ["宇治拾遺物語（巻第七・canvas65）", "宇治拾遺物語（巻第七）"],
  ["伊勢物語（上巻・canvas10）", "伊勢物語（上巻）"],
  // 「巻第五百二」は底本『続群書類従』の輯次で、松浦宮物語の巻ではない。
  ["松浦宮物語（巻第五百二）", "松浦宮物語"],
  // 版本名は底本の情報。SOURCE_EDITIONS.md に記録がある。
  ["土佐日記（宝永版本）", "土佐日記"],
  // 作品名＋（巻・段・章）の書式に揃える。
  ["韓非子・説難", "韓非子（説難）"],
  // 段番号は漢数字に統一する。
  ["徒然草（第38段）", "徒然草（第三十八段）"],
  ["徒然草（第44段）", "徒然草（第四十四段）"],
  ["徒然草（第53段）", "徒然草（第五十三段）"],
  ["徒然草（第137段）", "徒然草（第百三十七段）"],
  ["枕草子（第230段）", "枕草子（第二百三十段）"],
  ["枕草子（第268段「男こそ、なほいとありがたく」）", "枕草子（第二百六十八段）"],
  ["枕草子（大進生昌が家に・第8段）", "枕草子（大進生昌が家に）"],
]);

// 底本の頁番号は SOURCE_EDITIONS.md が正本。出典欄からは落とす。
function normalizeSource(source) {
  let s = sourceFixes.get(source) ?? source;
  s = s
    .replace(/添付資料p\.\d+/gu, "添付資料")
    .replace(/・p\.\d+/gu, "")
    .replace(/新註・/gu, "")
    .replace(/（p\.\d+）/gu, "")
    .replace(/（新註）/gu, "");
  return s;
}

// JSON文字列リテラルへのエスケープ（本データは制御文字・引用符を含まない前提でも安全側に）
const esc = (s) => JSON.stringify(s).slice(1, -1);

let wordCount = 0;
let sourceCount = 0;
for (const file of fs.readdirSync(dataDir).filter((f) => /^set-\d+\.json$/u.test(f)).sort()) {
  const full = path.join(dataDir, file);
  let text = fs.readFileSync(full, "utf8");
  const data = JSON.parse(text);

  for (const word of data.words) {
    const fix = contentFixes[word.id];
    if (!fix) continue;
    let touched = false;
    for (const [field, [from, to]] of Object.entries(fix)) {
      const targets = [word, ...(word.examples ?? [])];
      for (const t of targets) {
        const before = t[field];
        if (typeof before !== "string" || !before.includes(from)) continue;
        const after = before.replace(from, to);
        const needle = `"${field}": "${esc(before)}"`;
        // 語直下と examples 候補で同じ値を共有することがあるため、置換済みなら読み飛ばす。
        if (!text.includes(needle)) continue;
        text = text.replaceAll(needle, `"${field}": "${esc(after)}"`);
        touched = true;
      }
    }
    if (touched) wordCount += 1;
  }

  const sources = new Set();
  for (const word of data.words) {
    for (const t of [word, ...(word.examples ?? [])]) if (t.source) sources.add(t.source);
  }
  for (const src of sources) {
    const next = normalizeSource(src);
    if (next === src) continue;
    const needle = `"source": "${esc(src)}"`;
    if (!text.includes(needle)) throw new Error(`source の該当行が見つからない: ${src}`);
    text = text.replaceAll(needle, `"source": "${esc(next)}"`);
    sourceCount += 1;
  }

  JSON.parse(text); // 置換後もJSONとして妥当か確かめる
  fs.writeFileSync(full, text, "utf8");
}
console.log(`content-fixed words: ${wordCount} / normalized source labels: ${sourceCount}`);
