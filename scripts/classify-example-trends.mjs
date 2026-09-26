// 主例文（data/set-*.json の example）の傾向を TypeSafe Jev で分類する分析スクリプト。
// 使い方: TYPESAFE_API_KEY=... node scripts/classify-example-trends.mjs [--limit N] [--ids kv01-001,kv02-013]
// --ids は指定した語だけを判定し直し、既存の example-trends.json に上書きして集計を作り直す。
// 出力: docs/analysis/example-trends.json（生の判定）と docs/analysis/EXAMPLE_TRENDS.md（集計）
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const OUT_DIR = path.join(ROOT, 'docs', 'analysis');
const OUT_JSON = path.join(OUT_DIR, 'example-trends.json');
const OUT_MD = path.join(OUT_DIR, 'EXAMPLE_TRENDS.md');
const API = 'https://api.typesafe.ai/v1/systemone';
const KEY = process.env.TYPESAFE_API_KEY;
if (!KEY) throw new Error('TYPESAFE_API_KEY is not set');

const limitArg = process.argv.indexOf('--limit');
const LIMIT = limitArg > 0 ? Number(process.argv[limitArg + 1]) : Infinity;
const idsArg = process.argv.indexOf('--ids');
const IDS = idsArg > 0 ? new Set(process.argv[idsArg + 1].split(',')) : null;

const QUESTIONS = {
  theme: {
    type: 'choice',
    instructions: '古文の例文 `example`（現代語訳 `translation`）が描いている場面・話題として最も中心的なものはどれか。',
    criteria: {
      love: '恋愛・求婚・男女の贈答や逢瀬',
      court: '宮廷・貴族社会の行事、宮仕え、身分・官位、主従関係',
      family: '親子・夫婦・きょうだいなど家族や養育、身近な人間関係',
      religion_death: '仏道・出家・祈り、病・死・別れ、宿命',
      nature_season: '自然・季節・風景・天候の描写や鑑賞',
      travel: '旅・移動・住まいを離れること、道中',
      daily_life: '日常生活・衣食住・遊び・芸事・手紙のやりとり（恋愛以外）',
      reflection: '人生観・教訓・世の中や人物への批評、随想的な考察',
      tale_wonder: '説話・怪異・超自然・滑稽譚など出来事の面白さが中心の話',
      other: '上のどれにも当てはまらない',
    },
  },
  mode: {
    type: 'choice',
    instructions: '例文 `example` の語りの形式として最も近いものはどれか。`exampleForm` が waka なら和歌である。',
    criteria: {
      narration: '地の文による出来事・情景の叙述',
      speech: '登場人物の会話文・手紙の言葉・心中語が中心',
      essay: '書き手が自分の見解や感想を述べる随筆・評論的な文',
      waka: '和歌（詞書を含む場合も）',
    },
  },
  tone: {
    type: 'choice',
    instructions: '例文 `example`（現代語訳 `translation`）全体の感情的な調子として最も近いものはどれか。',
    criteria: {
      sorrow: '悲しみ・嘆き・寂しさ・無常感',
      anxiety: '不安・恐れ・困惑・気がかり',
      joy_praise: '喜び・感動・賞賛・美しさへの感嘆',
      criticism_humor: '非難・皮肉・あきれ・滑稽',
      affection: '恋しさ・慕わしさ・いとおしさ',
      neutral: '感情の色が薄い客観的・説明的な叙述',
    },
  },
  context_clue: {
    type: 'score',
    instructions:
      '見出し語 `headword` の意味 `meaning` を知らない学習者が、例文 `example` の前後の文脈だけからその意味を推測できる度合いはどれか。',
    criteria: [
      '文脈に手がかりがほとんどなく、語の意味を知らなければ推測できない',
      '文脈から大まかな方向（良い・悪いなど）は分かるが、意味の特定は難しい',
      '文脈の手がかりから意味をほぼ推測できる',
      '対句・言い換え・因果関係などで意味がはっきり示されており、容易に推測できる',
    ],
  },
  difficulty: {
    type: 'score',
    instructions: '高校生の古文学習者にとって、例文 `example` を読解する難しさはどの程度か（語彙・文法・省略・文の長さを総合して）。',
    criteria: [
      '短く平易で、見出し語以外に難所がほとんどない',
      '標準的な受験古文の水準で、少し注意すれば読める',
      '省略・敬語・複雑な構文があり、読解にかなり手間取る',
      '長く難解で、注釈なしでは主語や文意の把握が困難',
    ],
  },
};

function loadItems() {
  const files = fs.readdirSync(path.join(ROOT, 'data')).filter((f) => /^set-\d+\.json$/.test(f)).sort();
  const items = [];
  for (const f of files) {
    const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));
    for (const w of d.words) {
      items.push({
        set: f.replace('.json', ''),
        id: w.id,
        headword: w.headword,
        meaning: w.meanings[0],
        example: w.example,
        translation: w.translation,
        source: w.source,
        exampleForm: w.exampleForm,
      });
    }
  }
  return items;
}

async function judge(item) {
  const state = {
    headword: item.headword,
    meaning: item.meaning,
    example: item.example,
    translation: item.translation,
    source: item.source,
    exampleForm: item.exampleForm,
  };
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(API, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'jev-latest', state, questions: QUESTIONS }),
    });
    if (res.status === 429 || res.status === 529 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      continue;
    }
    if (!res.ok) throw new Error(`${item.id}: HTTP ${res.status} ${await res.text()}`);
    const body = await res.json();
    const a = body.answers;
    return {
      ...item,
      model: body.model,
      theme: a.theme.choice,
      themeConfidence: a.theme.confidence,
      themeProbabilities: a.theme.probabilities,
      mode: a.mode.choice,
      modeConfidence: a.mode.confidence,
      tone: a.tone.choice,
      toneConfidence: a.tone.confidence,
      contextClue: a.context_clue.score,
      difficulty: a.difficulty.score,
      usage: body.usage,
    };
  }
  throw new Error(`${item.id}: retries exhausted`);
}

async function runPool(items, size, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
        if ((i + 1) % 50 === 0) console.error(`${i + 1}/${items.length}`);
      }
    }),
  );
  return out;
}

const pct = (n, total) => `${((100 * n) / total).toFixed(1)}%`;
const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;

function table(rows, key, labels) {
  const counts = {};
  for (const r of rows) counts[r[key]] = (counts[r[key]] || 0) + 1;
  const lines = ['| 分類 | 件数 | 割合 |', '| --- | ---: | ---: |'];
  for (const [k, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${labels[k] ?? k} | ${n} | ${pct(n, rows.length)} |`);
  }
  return lines.join('\n');
}

function report(rows) {
  const L = (q) => Object.fromEntries(Object.entries(QUESTIONS[q].criteria).map(([k, v]) => [k, `${k}（${v.split('・')[0]}）`]));
  const lowConf = rows.filter((r) => r.themeConfidence < 0.5);
  const bySet = {};
  for (const r of rows) (bySet[r.set] ??= []).push(r);
  const setLines = ['| セット | 最多テーマ | 平均文脈手がかり(0-3) | 平均難度(0-3) |', '| --- | --- | ---: | ---: |'];
  for (const [s, rs] of Object.entries(bySet)) {
    const c = {};
    for (const r of rs) c[r.theme] = (c[r.theme] || 0) + 1;
    const [top, n] = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
    setLines.push(`| ${s} | ${top} (${n}/${rs.length}) | ${mean(rs.map((r) => r.contextClue)).toFixed(2)} | ${mean(rs.map((r) => r.difficulty)).toFixed(2)} |`);
  }
  const hardest = [...rows].sort((a, b) => a.contextClue - b.contextClue).slice(0, 15);
  return `# 主例文の傾向分類（TypeSafe Jev）

- 生成: \`node scripts/classify-example-trends.mjs\`（${new Date().toISOString().slice(0, 10)}、モデル ${rows[0]?.model}）
- 対象: data/set-*.json の主例文 ${rows.length} 件（\`example\` / \`translation\` / 見出し語・第1語義を入力）
- 判定は Jev の確率的判断であり正解ラベルではない。テーマ確信度 0.5 未満は ${lowConf.length} 件（${pct(lowConf.length, rows.length)}）。

## テーマ（場面・話題）

${table(rows, 'theme', L('theme'))}

## 語りの形式

${table(rows, 'mode', L('mode'))}

## 感情の調子

${table(rows, 'tone', L('tone'))}

## 文脈手がかり・読解難度（Score 0〜3）

- 文脈手がかり 平均 ${mean(rows.map((r) => r.contextClue)).toFixed(2)}（0=推測不能〜3=容易に推測可）
- 読解難度 平均 ${mean(rows.map((r) => r.difficulty)).toFixed(2)}（0=平易〜3=難解）

## セット別

${setLines.join('\n')}

## 文脈手がかりが最も乏しい例文（上位15）

| id | 見出し語 | 手がかり | 難度 | 出典 |
| --- | --- | ---: | ---: | --- |
${hardest.map((r) => `| ${r.id} | ${r.headword} | ${r.contextClue.toFixed(2)} | ${r.difficulty.toFixed(2)} | ${r.source} |`).join('\n')}
`;
}

const allItems = loadItems();
let rows;
if (IDS) {
  const fresh = new Map((await runPool(allItems.filter((item) => IDS.has(item.id)), 6, judge)).map((row) => [row.id, row]));
  const previous = new Map(JSON.parse(fs.readFileSync(OUT_JSON, 'utf8')).map((row) => [row.id, row]));
  rows = allItems.map((item) => fresh.get(item.id) ?? previous.get(item.id));
  if (rows.some((row) => !row)) throw new Error('example-trends.json に無い語がある。--ids なしで全件を判定し直す');
} else {
  rows = await runPool(allItems.slice(0, LIMIT), 6, judge);
}
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_JSON, JSON.stringify(rows, null, 1) + '\n');
fs.writeFileSync(OUT_MD, report(rows));
const tokens = rows.reduce((s, r) => s + (r.usage?.input_tokens ?? 0), 0);
console.error(`done: ${rows.length} items, input_tokens=${tokens}`);
