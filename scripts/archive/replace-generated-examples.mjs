// 学習用作例を、NDLのインターネット公開資料で本文を確かめた古典本文へ置き換える（2026-09-06）。
// 語ID・語順・headword・kanji・meanings・notes・dataVersion・進捗キーは変更しない。
// 置き換えるのは example / translation / cloze / source の4フィールドだけ。
// JSONを再整形すると既存の整形が崩れるため、値の文字列だけを置換する。
import fs from "node:fs";
import path from "node:path";

const dataDir = "data";

// [語ID] = { 確認資料, before: {…}, after: {…} }
// before は現在値の全文一致で照合し、食い違えば異常終了する（取り違え防止）。
const replacements = {
  // 『平家物語』瀬尾最期。『平家物語.下卷』（PID 1176917）で確認。
  "kv23-268": {
    before: {
      example: "姫君の嘆きたまふこと、なのめならず。",
      cloze: "姫君の嘆きたまふこと、（　）。",
      source: "学習用作例",
    },
    after: {
      example: "倉光の三郎なのめならず喜び、手勢三十騎ばかり、瀬尾の太郎を相具して、備中の国へ馳せ下る。",
      translation: "倉光の三郎は並ひととおりでなく喜び、手勢三十騎ほどで、瀬尾の太郎を連れて、備中の国へ馬を馳せて下る。",
      cloze: "倉光の三郎（　）喜び、手勢三十騎ばかり、瀬尾の太郎を相具して、備中の国へ馳せ下る。",
      source: "平家物語",
    },
  },

  // 『源氏物語』桐壺。『源氏物語』［1］（PID 2591006 ほか）で確認。
  "kv23-273": {
    before: {
      example: "そこらの橘、さながら同じやうになむありける。",
      cloze: "（　）の橘、さながら同じやうになむありける。",
      source: "学習用作例",
    },
    after: {
      example: "さるべき契りこそはおはしましけめ。そこらの人のそしり恨みをも憚らせたまはず。",
      translation: "そうなるはずの前世からの因縁がおありだったのだろう。たくさんの人の非難や恨みをもおはばかりにならない。",
      cloze: "さるべき契りこそはおはしましけめ。（　）の人のそしり恨みをも憚らせたまはず。",
      source: "源氏物語（桐壺）",
    },
  },

  // 『竹取物語』。『竹取物語』（PID 1096853、既採用の底本）で確認。
  "kv27-319": {
    before: {
      example: "心あしき者の、友を欺きけり。",
      cloze: "心（　）者の、友を欺きけり。",
      source: "学習用作例",
    },
    after: {
      example: "翁、心地あしく苦しき時も、この子を見れば苦しきことも止みぬ。",
      translation: "翁は、気分が悪く苦しい時も、この子を見ると苦しいことも消えてしまった。",
      cloze: "翁、心地（　）苦しき時も、この子を見れば苦しきことも止みぬ。",
      source: "竹取物語",
    },
  },

  // 『徒然草』丹波の出雲の段。『徒然草』2巻（PID 2544702）で確認。
  // 同じ段の続きは kv38-449「さだめて」でも採っている。
  "kv28-326": {
    before: {
      example: "童の中に、ひとりおとなしき人あり。",
      cloze: "童の中に、ひとり（　）人あり。",
      source: "学習用作例",
    },
    after: {
      example: "上人なほゆかしがりて、おとなしく物知りぬべき顔したる神官を呼びて…。",
      translation: "上人はやはり知りたくて、年配で物を知っていそうな顔をした神官を呼んで…。",
      cloze: "上人なほゆかしがりて、（　）物知りぬべき顔したる神官を呼びて…。",
      source: "徒然草",
    },
  },

  // 『竹取物語』龍の首の玉。『竹取物語』（PID 877529）・『竹取物語講義』（PID 877629）で確認。
  "kv29-347": {
    before: {
      example: "いな、さもあらず。",
      cloze: "（　）、さもあらず。",
      source: "学習用作例",
    },
    after: {
      example: "いな、さもあらず。御まなこ二つに、すもものやうなる玉を添へていましたる。",
      translation: "いや、そうではない。御目二つに、すももの実のような玉を添えていらっしゃった。",
      cloze: "（　）、さもあらず。御まなこ二つに、すもものやうなる玉を添へていましたる。",
      source: "竹取物語",
    },
  },

  // 『源氏物語』夕顔（五条の家をのぞく場面）。『源氏物語』［4］（PID 2579512 ほか）で確認。
  "kv31-366": {
    before: {
      example: "忍びて出でたまふとて、御装束をことさらやつしたまふ。",
      cloze: "忍びて出でたまふとて、御装束をことさら（　）たまふ。",
      source: "学習用作例",
    },
    after: {
      example: "御車もいたうやつしたまへり。先も追はせたまはず、誰とか知らむとうちとけたまひて…。",
      translation: "御車もひどく目立たない粗末なものになさっている。先払いもおさせにならず、誰と分かろうかと気をゆるめなさって…。",
      cloze: "御車もいたう（　）たまへり。先も追はせたまはず、誰とか知らむとうちとけたまひて…。",
      source: "源氏物語（夕顔）",
    },
  },

  // 『伊勢物語』初冠。『国文大観』３（PID 991355）・『新訳伊勢物語』（PID 877582）で確認。
  "kv33-393": {
    before: {
      example: "奈良のふるさとは、今は人も住まず荒れにけり。",
      cloze: "奈良の（　）は、今は人も住まず荒れにけり。",
      source: "学習用作例",
    },
    after: {
      example: "思ほえず、ふるさとにいとはしたなくてありければ、心地まどひにけり。",
      translation: "思いがけず、旧都に不似合いなほど優美な姉妹がいたので、（男は）心が乱れてしまった。",
      cloze: "思ほえず、（　）にいとはしたなくてありければ、心地まどひにけり。",
      source: "伊勢物語（初冠）",
    },
  },

  // 『竹取物語』冒頭。『新制小学国語読本出典文抄』（PID 1438621）の引用で本文を確認。
  "kv40-470": {
    before: {
      example: "月の光いと明かくて、夜もすがら眺めゐたり。",
      cloze: "月の光（　）明かくて、夜もすがら眺めゐたり。",
      source: "学習用作例",
    },
    after: {
      example: "いとをさなければ、籠に入れて養ふ。",
      translation: "たいそう幼いので、籠に入れて育てる。",
      cloze: "（　）をさなければ、籠に入れて養ふ。",
      source: "竹取物語",
    },
  },

  // 『宇治拾遺物語』巻第一「児のそら寝」。『宇治拾遺物語』（PID 977875）で確認。
  "kv40-476": {
    before: {
      example: "いざ、かの花見にものせむ。",
      cloze: "（　）、かの花見にものせむ。",
      source: "学習用作例",
    },
    after: {
      example: "僧たち宵のつれづれに、「いざ、かいもちひせむ」と言ひけるを、この児心寄せに聞きけり。",
      translation: "僧たちが宵の退屈しのぎに、「さあ、ぼたもちを作ろう」と言ったのを、この児は期待して聞いた。",
      cloze: "僧たち宵のつれづれに、「（　）、かいもちひせむ」と言ひけるを、この児心寄せに聞きけり。",
      source: "宇治拾遺物語（巻第一）",
    },
  },

  // 『徒然草』。『教科新抄徒然草』（PID 1031171）の引用で本文を確認。
  "kv47-558": {
    before: {
      example: "これは天下の大事なり。",
      cloze: "これは天下の（　）なり。",
      source: "学習用作例",
    },
    after: {
      example: "大事を思ひ立たん人は、去りがたく心にかからん事の本意を遂げずして、さながら捨つべきなり。",
      translation: "重大事を思い立つような人は、捨てがたく心にかかるような事の望みを遂げないままに、そっくり捨ててしまうのがよい。",
      cloze: "（　）を思ひ立たん人は、去りがたく心にかからん事の本意を遂げずして、さながら捨つべきなり。",
      source: "徒然草",
    },
  },

  // 『源氏物語』桐壺冒頭。『源氏物語』［1］（PID 2567038）ほかで確認。
  // 第49セットの方針どおり、例文中の見出し語は仮名で収録する。
  "kv49-587": {
    before: {
      example: "低きかたの人は、いかにもきはのほど隠れなし。",
      cloze: "低きかたの人は、いかにも（　）のほど隠れなし。",
      source: "学習用作例",
    },
    after: {
      example: "いとやむごとなききはにはあらぬが、すぐれて時めきたまふありけり。",
      translation: "たいして高貴な身分ではない方で、格別に帝のご寵愛を受けていらっしゃる方があった。",
      cloze: "いとやむごとなき（　）にはあらぬが、すぐれて時めきたまふありけり。",
      source: "源氏物語（桐壺）",
    },
  },

  // 『源氏物語』帚木（雨夜の品定め）。『源氏物語講本』（PID 947711）の引用で本文を確認。
  "kv49-588": {
    before: {
      example: "人のしなに従ひて、装ひもおのづから変はるものなり。",
      cloze: "人の（　）に従ひて、装ひもおのづから変はるものなり。",
      source: "学習用作例",
    },
    after: {
      example: "人のしな高く生まれぬれば、人にもてかしづかれて、隠るることも多く、自然にそのけはひこよなかるべし。",
      translation: "人が身分高く生まれると、人に大切に世話をされて、欠点が隠れることも多く、自然とその感じは格別であるにちがいない。",
      cloze: "人の（　）高く生まれぬれば、人にもてかしづかれて、隠るることも多く、自然にそのけはひこよなかるべし。",
      source: "源氏物語（帚木）",
    },
  },

  // 『竹取物語』帝の使ひの段。『竹取物語 : 校訂標註』（PID 877627）で確認。
  "kv50-598": {
    before: {
      example: "都へ帰るよしを、文に書きて遣はす。",
      cloze: "都へ帰る（　）を、文に書きて遣はす。",
      source: "学習用作例",
    },
    after: {
      example: "この内侍帰り参りて、このよしを奏す。",
      translation: "この内侍は帰参して、この事の次第を（帝に）申しあげる。",
      cloze: "この内侍帰り参りて、この（　）を奏す。",
      source: "竹取物語",
    },
  },
};

const esc = (s) => JSON.stringify(s).slice(1, -1);

const seen = new Set();
let count = 0;
for (const file of fs.readdirSync(dataDir).filter((f) => /^set-\d+\.json$/u.test(f)).sort()) {
  const full = path.join(dataDir, file);
  let text = fs.readFileSync(full, "utf8");
  const data = JSON.parse(text);
  let dirty = false;

  for (const word of data.words) {
    const plan = replacements[word.id];
    if (!plan) continue;
    if (word.examples) throw new Error(`${word.id}: examples 候補を持つ語は対象外`);
    for (const [field, expected] of Object.entries(plan.before)) {
      if (word[field] !== expected) {
        throw new Error(`${word.id}.${field} が想定と違う:\n  現在: ${word[field]}\n  想定: ${expected}`);
      }
    }
    // "source": "学習用作例" のような値はファイル内で重複する。語の example 行を起点に
    // 前方一致で探し、同じ語のフィールドだけを置換する（example は全語で一意）。
    const anchor = text.indexOf(`"example": "${esc(word.example)}"`);
    if (anchor < 0) throw new Error(`${word.id}: example 行が見つからない`);
    for (const [field, value] of Object.entries(plan.after)) {
      const needle = `"${field}": "${esc(word[field])}"`;
      const at = text.indexOf(needle, field === "example" ? anchor : anchor);
      if (at < 0) throw new Error(`${word.id}.${field} の行が見つからない`);
      text = text.slice(0, at) + `"${field}": "${esc(value)}"` + text.slice(at + needle.length);
    }
    seen.add(word.id);
    dirty = true;
    count += 1;
  }

  if (!dirty) continue;
  JSON.parse(text); // 置換後もJSONとして妥当か確かめる
  fs.writeFileSync(full, text, "utf8");
}

const missing = Object.keys(replacements).filter((id) => !seen.has(id));
if (missing.length) throw new Error(`対象語が見つからない: ${missing.join(", ")}`);
console.log(`実出典へ置き換えた語: ${count}`);
