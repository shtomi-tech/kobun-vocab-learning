// 例文品質監査（2026-09-06・第3回）の反映スクリプト。
// 対象は第38〜50セット（前回監査 fde4a4d 以降に追加され、例文監査を通していない156語）。
// 直したのは、NDLのインターネット公開資料で本文を確かめられた誤りだけ。
// 語ID・語順・meanings・notes・dataVersion・進捗キーは変更しない。
// JSONを再整形すると既存の整形が崩れるため、値の文字列だけを置換する（第2回と同じ方式）。
import fs from "node:fs";
import path from "node:path";

const dataDir = "data";

// [語ID][フィールド] = [置換前, 置換後]。語直下と examples 候補の両方に当てる。
const contentFixes = {
  // 『源氏物語』若菜下の女三宮の描写。「かいらし」は近世語で平安の本文に現れない。
  // 『国文大観』（PID 991354）「人よりけにちひさく美しげにて唯御ぞのみある心ちす」、
  // 『源氏物語湖月抄』（PID 877467）「人よりけにちひさくうつくしげにて」で確認。
  "kv40-473": {
    example: ["小さくかいらしくして、", "小さくうつくしげにて、"],
    cloze: ["小さくかいらしくして、", "小さくうつくしげにて、"],
  },

  // 「ある人が、」は現代語の主格「が」。底本は「ある人の、」。
  // 出典も『十訓抄』ではなく『徒然草』第二十一段（「よろづの事は、月見るにこそ慰むものなれ」に続く一文）。
  // 『刪定徒然草』（PID 888777）「ある人の月ばかり、おもしろきものはあらじ。といひしに、また、ひとり、
  // 露こそあはれなれ。とあらそひしこそ、をかしけれ」で確認。同じ一文を使う3語すべてに当てる。
  "kv41-492": {
    example: ["ある人が、", "ある人の、"],
    cloze: ["ある人が、", "ある人の、"],
    source: ["十訓抄", "徒然草（第二十一段）"],
  },
  "kv42-494": {
    example: ["ある人が、", "ある人の、"],
    cloze: ["ある人が、", "ある人の、"],
    source: ["十訓抄", "徒然草（第二十一段）"],
    // 「知的で」は本文にない補いなので、kv41-492 と同じく括弧に入れる。
    translation: ["と言い争ったのが、知的でおもしろい。", "と言い争ったのが、（知的で）おもしろい。"],
  },
  "kv42-495": {
    example: ["ある人が、", "ある人の、"],
    cloze: ["ある人が、", "ある人の、"],
    source: ["十訓抄", "徒然草（第二十一段）"],
    translation: ["と言い争ったのが、知的でおもしろい。", "と言い争ったのが、（知的で）おもしろい。"],
  },

  // 例文中の補足はすべて漢字・仮名で書いている。ここだけ片仮名だった。
  "kv43-515": {
    example: ["（ツバメは）", "（燕は）"],
    cloze: ["（ツバメは）", "（燕は）"],
  },

  // 「女同士」は現代語。能因本系の本文は「女どち」。
  // 『群書類従』（PID 1879825）「男女をばいはじ女どちも」で確認。
  "kv47-562": {
    example: ["女同士も、", "女どちも、"],
    cloze: ["女同士も、", "女どちも、"],
  },

  // 「髭切が、あらぬ太刀が」では文が成立しない。並列の疑問「か」。現代語訳も「か」で訳している。
  // 『故実叢書』（PID 771995）・『武家名目抄稿』（PID 11607793）
  // 「ひけきりかあらぬ太刀か正直に申さるへし」で確認。
  "kv48-571": {
    example: ["「髭切が、あらぬ太刀が、", "「髭切か、あらぬ太刀か、"],
    cloze: ["「髭切が、（　）太刀が、", "「髭切か、（　）太刀か、"],
  },

  // 「おわび」は現代語。底本は「をこたり」（＝謝罪）。
  // 『国文大観』（PID 991355）「なくなくをこたりを言へど、いらへをだにせで泣くこと限なし」で確認。
  "kv49-584": {
    example: ["おわびを言へど、", "をこたりを言へど、"],
    cloze: ["おわびを言へど、", "をこたりを言へど、"],
    translation: ["お詫びを言っても、", "詫び言を言うけれど、"],
  },
};

// JSON文字列リテラルへのエスケープ
const esc = (s) => JSON.stringify(s).slice(1, -1);

let wordCount = 0;
let replaceCount = 0;
for (const file of fs.readdirSync(dataDir).filter((f) => /^set-\d+\.json$/u.test(f)).sort()) {
  const full = path.join(dataDir, file);
  let text = fs.readFileSync(full, "utf8");
  const data = JSON.parse(text);

  for (const word of data.words) {
    const fix = contentFixes[word.id];
    if (!fix) continue;
    let touched = false;
    for (const [field, [from, to]] of Object.entries(fix)) {
      for (const target of [word, ...(word.examples ?? [])]) {
        const before = target[field];
        if (typeof before !== "string" || !before.includes(from)) continue;
        const after = before.replace(from, to);
        const needle = `"${field}": "${esc(before)}"`;
        // 語直下と examples 候補で同じ値を共有することがあるため、置換済みなら読み飛ばす。
        if (!text.includes(needle)) continue;
        text = text.replaceAll(needle, `"${field}": "${esc(after)}"`);
        touched = true;
        replaceCount += 1;
      }
    }
    if (touched) wordCount += 1;
  }

  JSON.parse(text); // 置換後もJSONとして妥当か確かめる
  fs.writeFileSync(full, text, "utf8");
}
console.log(`content-fixed words: ${wordCount} / replacements: ${replaceCount}`);
