#!/usr/bin/env node
// 2026-09-07 ルーブリック初回監査の指摘3件を反映する。
//   1. kv01-001 の章段取り違え（G1）と訳の脱落・誤訳
//   2. kv33-392 の出典具体化と、kv02-015 との訳の統一
//   3. 旧字体・踊り字・鉤括弧の正規化漏れ（11語＋2件）
// 値の文字列だけを raw テキスト上で置換する。JSON を作り直さないので、
// 既存の整形（1要素配列のインライン表記）と改行コードは保たれる。
// id・語順・headword・kanji・meanings・notes・meta・進捗キーは触らない。
// 再実行しても結果は変わらない（適用済みなら「変更なし」になる）。
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const DATA = 'data';
const FIELDS = ['example', 'cloze', 'translation', 'source'];

// 旧字体→新字体。台帳 L725「本文では旧字体を新字体に改め」の方針に合わせる。
const KYUJI = {
  '亂': '乱', '參': '参', '將': '将', '壓': '圧', '條': '条', '數': '数',
  '歸': '帰', '氣': '気', '燒': '焼', '聲': '声', '蟲': '虫', '貳': '弐',
  '辨': '弁', '錄': '録', '櫻': '桜',
};

const EDITS = {
  // --- 指摘1: 出典の章段が別の章段を指している ---
  'kv01-001': {
    // 底本『竹取物語 : 校註』(PID 1052421) の収録範囲は蓬莱の玉の枝 p.13-22 /
    // 龍の首の珠 p.30-38。台帳が採用箇所とする p.34 は龍の首の珠に当たる。
    // canvas24 の版面で大伴大納言の段であることを確認した。
    source: ['竹取物語（蓬莱の玉の枝）', '竹取物語（龍の首の珠）'],
    // 「とのたまひて」が未訳、「いとど」を「とても」と訳していた。
    translation: [
      '船に乗って、あちこちの海を移動しなさるうちに、とても遠い、筑紫の方の海に漕ぎ出しなさった。',
      '…とおっしゃって、船に乗って、あちこちの海を移動なさるうちに、いっそう遠くなって、筑紫の方の海に漕ぎ出しなさった。',
    ],
  },

  // --- 指摘2: 同一本文なのに訳と出典表記が揃っていない ---
  'kv02-015': {
    // 底本 PID 991353 夕顔 canvas31 は惟光の詞中の「消そこなど遣したりき」で、
    // 「遣はす」に尊敬・丁寧の標識はない。本文にない敬意を訳で足さない。
    translation: [
      'ちょっとした機会を作り出して、手紙などをお送りしていました。',
      'ちょっとした機会を作り出して、手紙などをおくった。',
    ],
  },
  'kv33-392': {
    // 同じ一文を kv02-015 が夕顔 canvas31 で確認済み。帖名まで揃える。
    source: ['源氏物語', '源氏物語（夕顔）'],
  },

  // --- 指摘3: 旧字体・踊り字・鉤括弧の正規化漏れ ---
  'kv03-030': { kyuji: true },
  'kv05-058': { kyuji: true },
  'kv08-085': { kyuji: true, subst: [['心あわたゞしく', '心あわただしく']] },
  'kv11-130': { kyuji: true },
  'kv11-132': { kyuji: true },
  'kv12-136': { kyuji: true },
  'kv15-170': { kyuji: true },
  'kv16-181': { kyuji: true },
  'kv16-188': { kyuji: true },
  'kv16-191': { kyuji: true },
  'kv19-218': { kyuji: true },
  'kv20-232': {
    // 閉じ「」」だけがあり、開きが落ちていた（kv18-205・kv17-195 と同型）。
    subst: [['さても、かばかり', '「さても、かばかり']],
  },
};

// 語オブジェクトの raw テキスト範囲を、"id": "kvNN-XXX" から波括弧を数えて取る。
function wordSlice(raw, id) {
  const marker = `"id": ${JSON.stringify(id)}`;
  const at = raw.indexOf(marker);
  if (at < 0) return null;
  let start = raw.lastIndexOf('{', at);
  let depth = 0;
  for (let i = start; i < raw.length; i += 1) {
    if (raw[i] === '{') depth += 1;
    else if (raw[i] === '}') {
      depth -= 1;
      if (depth === 0) return [start, i + 1];
    }
  }
  return null;
}

function rewriteFieldValues(block, edit, id, log) {
  const pattern = new RegExp(`("(?:${FIELDS.join('|')})":\\s*)"((?:[^"\\\\]|\\\\.)*)"`, 'g');
  let hitExpected = false;

  const next = block.replace(pattern, (whole, head, encoded) => {
    const field = head.match(/"(\w+)"/)[1];
    const before = JSON.parse(`"${encoded}"`);
    let after = before;

    const rule = edit[field];
    if (Array.isArray(rule)) {
      const [expected, replacement] = rule;
      if (after === expected) { after = replacement; hitExpected = true; }
      else if (after === replacement) hitExpected = true;
    }
    if (edit.kyuji) for (const [from, to] of Object.entries(KYUJI)) after = after.split(from).join(to);
    // subst は再実行しても二重適用されないよう、置換後の形が既にあれば飛ばす。
    if (edit.subst) {
      for (const [from, to] of edit.subst) {
        if (after.includes(to)) continue;
        after = after.split(from).join(to);
      }
    }

    if (after === before) return whole;
    log.push(`  ${id}.${field}\n    - ${before}\n    + ${after}`);
    return head + JSON.stringify(after);
  });

  for (const field of FIELDS) {
    if (Array.isArray(edit[field]) && !hitExpected) {
      throw new Error(`${id}.${field}: 想定した現行値も置換後の値も見つからない`);
    }
  }
  return next;
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
    const block = rewriteFieldValues(text.slice(span[0], span[1]), edit, word.id, log);
    text = text.slice(0, span[0]) + block + text.slice(span[1]);
  }

  if (text === raw) continue;

  // 書き出す前に、意図した語だけが・意図したフィールドだけ変わったことを確かめる。
  const after = JSON.parse(text);
  const byId = (doc) => Object.fromEntries(doc.words.map((w) => [w.id, w]));
  const [oldWords, newWords] = [byId(before), byId(after)];
  if (JSON.stringify(Object.keys(oldWords)) !== JSON.stringify(Object.keys(newWords))) {
    throw new Error(`${file}: 語IDまたは語順が変わった`);
  }
  if (JSON.stringify(before.meta) !== JSON.stringify(after.meta)) throw new Error(`${file}: meta が変わった`);
  for (const id of Object.keys(oldWords)) {
    const [o, n] = [oldWords[id], newWords[id]];
    for (const key of ['headword', 'kanji', 'meanings', 'notes', 'exampleForm']) {
      if (JSON.stringify(o[key]) !== JSON.stringify(n[key])) throw new Error(`${id}.${key} が変わった`);
    }
    if (!EDITS[id] && JSON.stringify(o) !== JSON.stringify(n)) throw new Error(`${id}: 対象外なのに変わった`);
    const [a, b] = [blankAnswer(o), blankAnswer(n)];
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
