#!/usr/bin/env node
// 2026-09-07 第30セットの典拠昇格（証拠段階 E1 → E2/E3）。
//   NDL全文検索と版面で本文を照合し、底本と食い違っていた本文と、
//   作品名までしか書けていなかった source を訂正する。
//   確認資料は docs/SOURCE_EDITIONS.md の第30セット節に記録する。
// 値の文字列だけを raw テキスト上で置換する（fix-example-quality-5.mjs と同方式）。
// id・語順・headword・kanji・meanings・notes・meta・進捗キー・空欄の答えは変えない。
// 再実行しても結果は変わらない（適用済みなら「変更なし」になる）。
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const DATA = 'data';
const FIELDS = ['example', 'cloze', 'translation', 'source'];

// 各値は [現行値, 置換後] の全文一致。どちらにも一致しなければ例外で止める。
const EDITS = {
  'kv30-349': {
    // 『平家物語.上巻』（山田孝雄校訂、岩波書店、昭和7）PID 1031664
    // 巻第三「御産」p.130・canvas67 の版面で
    // 「入道相國、二位殿、胸に手を置て、こはいかにせん、いかにせんとぞあきれ給ふ。」を確認。
    // 「ここは」は指示語「こは（此は）」の誤りで、どの底本にも無い形だった。
    example: [
      '「ここはいかにせん、いかにせん」とぞあきれたまふ。',
      '「こはいかにせん、いかにせん」とぞあきれたまふ。',
    ],
    cloze: [
      '「ここはいかにせん、いかにせん」とぞ（　）たまふ。',
      '「こはいかにせん、いかにせん」とぞ（　）たまふ。',
    ],
    translation: [
      '「これはどうしよう、どうしよう」と途方にくれなさる。',
      '「これはどうしよう、どうしよう」と途方にくれなさる。',
    ],
    source: ['平家物語', '平家物語（巻三・御産）'],
  },
  'kv30-351': {
    // 『枕草子』写本 PID 2541877、『まくらの草子 : 前田本 尊経閣叢刊』PID 1225906 とも
    // 「いひ〳〵のはてはみなうちとけてねぬるのちもはづかし」。
    // 『枕草子評釋』（金子元臣、明治書院、昭和15）PID 1886170 も本文を
    // 「うちとけて寢ぬるのち」と立項する。「寝るもいとはづかし」は0件だった。
    example: [
      '言ひ言ひの果ては、みなうちとけて寝るもいとはづかし。',
      '言ひ言ひの果ては、みなうちとけて寝ぬる後もはづかし。',
    ],
    cloze: [
      '言ひ言ひの果ては、みな（　）て寝るもいとはづかし。',
      '言ひ言ひの果ては、みな（　）て寝ぬる後もはづかし。',
    ],
    translation: [
      'さんざん話したあげく、みんながくつろいで寝てしまうのも、とても気が引ける。',
      '言い合ったあげくには、みなが気を許して寝てしまった後も、気が引ける。',
    ],
    source: ['枕草子', '枕草子（はづかしきもの）'],
  },
  'kv30-352': {
    // 『平家物語.下卷』（吉沢義則校、改造社、昭和9）PID 1176917 巻七「北国下向の事」に
    // 「大臣殿、「汝等は古い者なれば、軍のやうをもおきてよ」とて、今度北國へ向けられたり」。
    // 『国文大観.8 歴史部2雑』PID 991360、『平家物語講義.第４冊』PID 877646 も同文。
    // 「者どもなり」「戦の様」はどの底本にも無い形だった。
    example: [
      '「汝らは古い者どもなり。戦の様をもおきてよ」とて、北国へ向けられたり。',
      '「汝らは古い者なれば、軍のやうをもおきてよ」とて、今度北国へ向けられたり。',
    ],
    cloze: [
      '「汝らは古い者どもなり。戦の様をも（　）よ」とて、北国へ向けられたり。',
      '「汝らは古い者なれば、軍のやうをも（　）よ」とて、今度北国へ向けられたり。',
    ],
    translation: [
      '「おまえたちは老練な武士たちだ。戦の進め方を指図せよ」と言って、北国へ派遣された。',
      '「おまえたちは古参の者であるから、戦のやり方を指図せよ」と言って、今度は北国へ派遣された。',
    ],
    source: ['平家物語', '平家物語（巻七・北国下向の事）'],
  },
  'kv30-358': {
    // 『国文大観.5 物語部5 宇津保物語』PID 991357 に
    // 「かくあやしき人のいかで時めき給ふらむ。」。祐宗が忠こそを讒する場面で、
    // 『宇津保物語.上』（武笠三校、有朋堂書店、大正15）PID 1018114 の忠こそ巻に当たる。
    source: ['宇津保物語', '宇津保物語（忠こそ）'],
  },
  'kv30-359': {
    // 『国文大観.5 物語部5 宇津保物語』PID 991357 に「みかどは時めかし給ふこと限なし。」。
    // 『宇津保物語.上』PID 1018114 忠こそ p.167・canvas91 の版面で
    // 「帝時めかし給ふこと限りなし。」を確認した（国文大観本は「みかどは」）。
    source: ['宇津保物語', '宇津保物語（忠こそ）'],
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
    // examples 候補側の同じ値も直っていること。
    for (const cand of n[id].examples ?? []) {
      if (cand.example === o[id].example && n[id].example !== o[id].example) {
        throw new Error(`${id}: examples 候補が旧本文のまま残った`);
      }
    }
  }

  writeFileSync(full, text);
  changedFiles += 1;
}

const missing = Object.keys(EDITS).filter((id) => !seen.has(id));
if (missing.length) throw new Error(`データに見つからない語ID: ${missing.join(', ')}`);

console.log(log.length ? log.join('\n') : '変更なし（適用済み）');
console.log(`\n対象 ${Object.keys(EDITS).length}語 ／ 書き換えたフィールド ${log.length} ／ 更新ファイル ${changedFiles}`);
