#!/usr/bin/env node
// 2026-09-07 保留1〜3の解消。
//   保留2: 台帳に記録のない実出典11語の典拠確認に伴う本文・出典の訂正
//   保留6: kv12-134 の底本照合（枕草子説は否定。大鏡で確定）に伴う本文訂正
//   保留4: 90字超9語のうち、連続本文で90字以下へ短縮できる5語の短縮
// 値の文字列だけを raw テキスト上で置換する（fix-example-quality-4.mjs と同方式）。
// id・語順・headword・kanji・meanings・notes・meta・進捗キー・空欄の答えは変えない。
// 再実行しても結果は変わらない（適用済みなら「変更なし」になる）。
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const DATA = 'data';
const FIELDS = ['example', 'cloze', 'translation', 'source'];

// 各値は [現行値, 置換後] の全文一致。どちらにも一致しなければ例外で止める。
const EDITS = {
  // ── 本文の訂正（底本と食い違っていた） ──────────────────────────
  'kv12-134': {
    // 『大鏡』国民図書本(1032685)中巻p.104・canvas58、『大鏡 : 校定』(877414)、
    // 『大鏡』明治書院本(964404) の3本とも「のたまひける」。
    // 「宣へりける」はどの底本にも無い形だった。
    example: [
      '明順のぬしの、「庭火、いと猛なりや」と宣へりけるにこそ、万人えたへず笑ひ給ひにけれ。',
      '明順のぬしの、「庭火、いと猛なりや」と宣ひけるにこそ、万人えたへず笑ひ給ひにけれ。',
    ],
    cloze: [
      '明順の（　）の、「庭火、いと猛なりや」と宣へりけるにこそ、万人えたへず笑ひ給ひにけれ。',
      '明順の（　）の、「庭火、いと猛なりや」と宣ひけるにこそ、万人えたへず笑ひ給ひにけれ。',
    ],
  },
  'kv05-053': {
    // 『古文評釈』(877530) は「汗もしとゞになりて、われかのけしきなり」。
    // 「汗もしどに」は全文検索で0件＝どの資料にも無い形だった。
    example: ['汗もしどに成りて、われかのけしきなり。', '汗もしとどに成りて、われかのけしきなり。'],
    cloze: ['汗もしどに成りて、（　）なり。', '汗もしとどに成りて、（　）なり。'],
    // 右近・物おぢの場面で夕顔巻と特定できる。
    source: ['源氏物語', '源氏物語（夕顔）'],
  },
  'kv05-059': {
    // 『宇治拾遺物語』(877392)・『日本文学大系 : 校註』第10巻(1018049) とも「或は角生ひたり」。
    // 「あるものは角生ひたり」は全文検索で0件。
    example: [
      'あるものは角生ひたり、頭もえもいはず恐ろしげなる物どもなり。',
      '或は角生ひたり、頭もえもいはず恐ろしげなる物どもなり。',
    ],
    cloze: [
      'あるものは角生ひたり、頭も（　）恐ろしげなる物どもなり。',
      '或は角生ひたり、頭も（　）恐ろしげなる物どもなり。',
    ],
  },

  // ── 出典の具体化（本文自体が場面を特定できる語だけ） ────────────────
  'kv05-050': {
    // 桐壺更衣の死後に三位の位を追贈する場面。942776・991353 の両本で確認。
    source: ['源氏物語', '源氏物語（桐壺）'],
  },

  // ── 90字超の短縮（いずれも現行本文の連続した一部分） ──────────────
  'kv16-183': {
    shorten: true,
    example: [
      '家の様もおもしろうて、年頃経つる海面に覚えたれば、所かへたる心地もせず。昔のこと思ひ出でられて、哀なること多かり。作り添へたる廊など、故ある様に、水の流れもをかしうしなしたり。まだ細やかなるにはあらねども、住みつかば然てもありぬべし。',
      '作り添へたる廊など、故ある様に、水の流れもをかしうしなしたり。まだ細やかなるにはあらねども、住みつかば然てもありぬべし。',
    ],
    cloze: [
      '家の様もおもしろうて、年頃経つる海面に覚えたれば、所かへたる心地もせず。昔のこと思ひ出でられて、哀なること多かり。作り添へたる廊など、故ある様に、水の流れもをかしうしなしたり。まだ細やかなるにはあらねども、住みつかば（　）。',
      '作り添へたる廊など、故ある様に、水の流れもをかしうしなしたり。まだ細やかなるにはあらねども、住みつかば（　）。',
    ],
    translation: [
      '家の造りも趣深く、長年過ごした海辺に似ているので、場所を変えた気持ちもしない。昔のことが思い出されて、しみじみとすることが多い。建て増した渡り廊下なども由緒ありげで、水の流れも趣深く作ってある。まだ行き届いてはいないけれど、住みつけばそのままでも十分だろう。',
      '建て増した渡り廊下なども由緒ありげで、水の流れも趣深く作ってある。まだ行き届いてはいないけれど、住みつけばそのままでも十分だろう。',
    ],
  },
  'kv16-188': {
    shorten: true,
    example: [
      '御車に奉るほど、大殿より、何方ともなくておはしにける事とて、御迎の人々、君達などあまた参り給へり。頭中将、左中弁、さらぬ君達もしたひ聞えて、「かうやうの御供は仕う奉り侍らむ」と思ひ給ふるを、…',
      '頭中将、左中弁、さらぬ君達もしたひ聞えて、「かうやうの御供は仕う奉り侍らむ」と思ひ給ふるを、…',
    ],
    cloze: [
      '御車に奉るほど、大殿より、何方ともなくておはしにける事とて、御迎の人々、君達などあまた参り給へり。頭中将、左中弁、（　）君達もしたひ聞えて、「かうやうの御供は仕う奉り侍らむ」と思ひ給ふるを、…',
      '頭中将、左中弁、（　）君達もしたひ聞えて、「かうやうの御供は仕う奉り侍らむ」と思ひ給ふるを、…',
    ],
    translation: [
      'お車にお乗せ申し上げる時、殿から「どこへともなくお出かけになってしまったことだ」として、お迎えの人々や子息たちなどが大勢参上なさった。頭中将、左中弁、その他の君達もお慕い申し上げて、「このようなお供にはお仕えしましょう」と思っているのだが、…',
      '頭中将、左中弁、その他の君達もお慕い申し上げて、「このようなお供にはお仕えしましょう」と思っているのだが、…',
    ],
  },
  'kv17-196': {
    shorten: true,
    example: [
      '亀山殿の御池に、大井川の水をまかせられんとて、大井の土民におほせて、水車を作らせられけり。多くの銭を賜ひて、数日に営み出してかけたりけるに、大方めぐらざりければ、とかく直しけれども、終に廻らで、徒に立てりけり。',
      '多くの銭を賜ひて、数日に営み出してかけたりけるに、大方めぐらざりければ、とかく直しけれども、終に廻らで、徒に立てりけり。',
    ],
    cloze: [
      '亀山殿の御池に、大井川の水をまかせられんとて、大井の土民におほせて、水車を作らせられけり。多くの銭を賜ひて、数日に営み出してかけたりけるに、大方めぐらざりければ、（　）直しけれども、終に廻らで、徒に立てりけり。',
      '多くの銭を賜ひて、数日に営み出してかけたりけるに、大方めぐらざりければ、（　）直しけれども、終に廻らで、徒に立てりけり。',
    ],
    translation: [
      '亀山殿の御池に大井川の水を引き入れようとして、大井の土民に命じて水車を作らせなさった。多くの銭を与えて数日かけて作り上げ、据えつけたところ、まったく回らなかったので、あれこれ直したけれど、結局回らず、むなしく立っていた。',
      '多くの銭を与えて数日かけて作り上げ、据えつけたところ、まったく回らなかったので、あれこれ直したけれど、結局回らず、むなしく立っていた。',
    ],
  },
  'kv17-200': {
    shorten: true,
    example: [
      '御室にいみじき児のありけるを、いかで誘ひ出して遊ばんとたくむ法師どもありて、能あるあそび法師どもなんどかたらひて、風流の破籠やうのもの、ねんごろにいとなみ出でて、箱風情のものに認め入れて、双の岡の便よき所にうづみおきて、紅葉ちらしかけなんど、思ひよらぬさまにして、御所へ参りて、児をそそのかし出でにけり。',
      '御室にいみじき児のありけるを、いかで誘ひ出して遊ばんとたくむ法師どもありて、…',
    ],
    cloze: [
      '御室にいみじき児のありけるを、（　）誘ひ出して遊ばんとたくむ法師どもありて、能あるあそび法師どもなんどかたらひて、風流の破籠やうのもの、ねんごろにいとなみ出でて、箱風情のものに認め入れて、双の岡の便よき所にうづみおきて、紅葉ちらしかけなんど、思ひよらぬさまにして、御所へ参りて、児をそそのかし出でにけり。',
      '御室にいみじき児のありけるを、（　）誘ひ出して遊ばんとたくむ法師どもありて、…',
    ],
    translation: [
      '仁和寺にたいそうかわいらしい子どもがいたのを、どうにかして誘い出して遊ぼうと企てる法師たちがいて、芸のある遊び法師たちなどと相談し、風流な弁当箱のようなものを丁寧に作って箱めいた物に詰め入れ、双岡の都合のよい所に埋めておき、紅葉を散らしかけるなど思いがけない仕掛けをして、御所へ参上し、子どもをそそのかして連れ出した。',
      '仁和寺にたいそうかわいらしい子どもがいたのを、どうにかして誘い出して遊ぼうと企てる法師たちがいて、…',
    ],
  },
  'kv20-236': {
    shorten: true,
    example: [
      'かたちいとよく、心もをかしき人の、手もよう書き、歌をもあはれに詠みておこせなどするを、返事はさかしらにうちするものから、寄りつかず、らうたげにうち泣きて居たるを、見捨てて往きなどするは、あさましう、おほやけ腹立ちて…',
      'かたちいとよく、心もをかしき人の、手もよう書き、歌をもあはれに詠みておこせなどするを、返事はさかしらにうちするものから、寄りつかず、…',
    ],
    cloze: [
      'かたちいとよく、心もをかしき人の、手もよう書き、歌をもあはれに詠みておこせなどするを、返事は（　）にうちするものから、寄りつかず、らうたげにうち泣きて居たるを、見捨てて往きなどするは、あさましう、おほやけ腹立ちて…',
      'かたちいとよく、心もをかしき人の、手もよう書き、歌をもあはれに詠みておこせなどするを、返事は（　）にうちするものから、寄りつかず、…',
    ],
    translation: [
      '容貌がとてもよく、心も趣深い人が、文字も上手に書き、歌も情趣深く詠んでよこしたりするのに、返事は利口ぶって少しするだけで、近寄りもせず、かわいらしく泣いているのを見捨てて行く男は、あきれるほどひどく腹立たしい。',
      '容貌がとてもよく、心も趣深い人が、文字も上手に書き、歌も情趣深く詠んでよこしたりするのに、返事は利口ぶって少しするだけで、近寄りもせず、…',
    ],
  },
};

function wordSlice(raw, id) {
  const at = raw.indexOf(`"id": ${JSON.stringify(id)}`);
  if (at < 0) return null;
  const start = raw.lastIndexOf('{', at);
  let depth = 0;
  for (let i = start; i < raw.length; i += 1) {
    if (raw[i] === '{') depth += 1;
    else if (raw[i] === '}' && --depth === 0) return [start, i + 1];
  }
  return null;
}

function blankAnswer(word) {
  const i = word.cloze.indexOf('（　）');
  if (i < 0) return null;
  const pre = word.cloze.slice(0, i);
  const post = word.cloze.slice(i + 3);
  if (!word.example.startsWith(pre) || !word.example.endsWith(post)) return null;
  return word.example.slice(pre.length, word.example.length - post.length);
}

const log = [];
const seen = new Set();
let changedFiles = 0;

for (const file of readdirSync(DATA).filter((f) => /^set-\d+\.json$/.test(f)).sort()) {
  const full = path.join(DATA, file);
  const raw = readFileSync(full, 'utf8');
  const before = JSON.parse(raw);
  let text = raw;

  for (const word of before.words ?? []) {
    const edit = EDITS[word.id];
    if (!edit) continue;
    seen.add(word.id);

    // 短縮案は現行本文の連続した一部分であること。省略箇所をつないだ引用を作らない。
    if (edit.shorten) {
      const trimmed = edit.example[1].replace(/…$/u, '');
      if (!edit.example[0].includes(trimmed)) {
        throw new Error(`${word.id}: 置換後の example が現行本文の連続部分になっていない`);
      }
    }

    const span = wordSlice(text, word.id);
    if (!span) throw new Error(`${word.id}: raw テキスト上で語オブジェクトを特定できない`);
    let block = text.slice(span[0], span[1]);

    for (const field of FIELDS) {
      const rule = edit[field];
      if (!rule) continue;
      const [expected, next] = rule;
      const from = `"${field}": ${JSON.stringify(expected)}`;
      const to = `"${field}": ${JSON.stringify(next)}`;
      if (block.includes(from)) {
        if (expected !== next) log.push(`  ${word.id}.${field}\n    - ${expected}\n    + ${next}`);
        block = block.split(from).join(to);
      } else if (!block.includes(to)) {
        throw new Error(`${word.id}.${field}: 想定した現行値も置換後の値も見つからない`);
      }
    }
    text = text.slice(0, span[0]) + block + text.slice(span[1]);
  }

  if (text === raw) continue;

  const after = JSON.parse(text);
  const byId = (doc) => Object.fromEntries(doc.words.map((w) => [w.id, w]));
  const [o, n] = [byId(before), byId(after)];
  if (JSON.stringify(Object.keys(o)) !== JSON.stringify(Object.keys(n))) throw new Error(`${file}: 語IDか語順が変わった`);
  if (JSON.stringify(before.meta) !== JSON.stringify(after.meta)) throw new Error(`${file}: meta が変わった`);
  for (const id of Object.keys(o)) {
    for (const key of ['headword', 'kanji', 'meanings', 'notes', 'exampleForm']) {
      if (JSON.stringify(o[id][key]) !== JSON.stringify(n[id][key])) throw new Error(`${id}.${key} が変わった`);
    }
    if (!EDITS[id] && JSON.stringify(o[id]) !== JSON.stringify(n[id])) throw new Error(`${id}: 対象外なのに変わった`);
    const [a, b] = [blankAnswer(o[id]), blankAnswer(n[id])];
    if (b === null) throw new Error(`${id}: 空欄から example を復元できない`);
    if (a !== b) throw new Error(`${id}: 空欄の答えが変わった「${a}」→「${b}」`);
  }

  writeFileSync(full, text);
  changedFiles += 1;
}

const missing = Object.keys(EDITS).filter((id) => !seen.has(id));
if (missing.length) throw new Error(`データに見つからない語ID: ${missing.join(', ')}`);

console.log(log.length ? log.join('\n') : '変更なし（適用済み）');
console.log(`\n対象 ${Object.keys(EDITS).length}語 ／ 書き換えたフィールド ${log.length} ／ 更新ファイル ${changedFiles}`);
