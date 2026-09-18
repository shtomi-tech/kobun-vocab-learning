#!/usr/bin/env node
// 2026-09-07 前回の監査で「新しく見つかった課題」として残した2件のうち、
// `kv05-056` の帖の特定を反映する。
// （`kv04-042` の和歌化は出題側の制約で見送った。理由は
//  docs/ALL_SET_EXAMPLE_REVIEW_PLAN.md の追補に記録した。）
// 値の文字列だけを raw テキスト上で置換する（fix-example-quality-4/5 と同方式）。
// 再実行しても結果は変わらない（適用済みなら「変更なし」になる）。
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const DATA = 'data';
const FIELDS = ['example', 'cloze', 'translation', 'source'];

const EDITS = {
  'kv05-056': {
    // 底本『源氏物語.下』(NDL PID 942777) は宇治十帖だけを収める。全文検索の当たった本文
    // 「行ひもいとよくして、法華經はさらなり、こと法文などもいと多く讀み給ふ。
    //  雪深く降り積み、人目絕えたる頃ぞ、げに思ひやる方なかりける。年もかへりぬ。」
    // は、同書 structures の手習（p.112〜166、canvas63〜89）の中に入る。
    // canvas72（p.130／秋の描写）と canvas76（p.138／「この春初瀬に詣でて」）の柱が
    // どちらも「手習」で、冬から年明けを述べるこの本文はその間に位置する。
    // canvas84（p.154）も柱は「手習」。
    source: ['源氏物語', '源氏物語（手習）'],
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
  }

  writeFileSync(full, text);
  changedFiles += 1;
}

const missing = Object.keys(EDITS).filter((id) => !seen.has(id));
if (missing.length) throw new Error(`データに見つからない語ID: ${missing.join(', ')}`);

console.log(log.length ? log.join('\n') : '変更なし（適用済み）');
console.log(`\n対象 ${Object.keys(EDITS).length}語 ／ 書き換えたフィールド ${log.length} ／ 更新ファイル ${changedFiles}`);
