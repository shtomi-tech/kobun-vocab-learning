#!/usr/bin/env node
// NDLデジタルコレクションで底本の素性・収録範囲・本文を確かめるための小道具。
//
// 出典の誤りは「本文が違う」より先に「そもそもその作品はその頁に無い」で
// 出ることが多い。structures を先に見れば、頁や巻の食い違いは版面を1枚も
// 開かずに弾ける。
//
// 使い方:
//   node scripts/ndl.mjs info 1172432
//   node scripts/ndl.mjs search "その枝扇" 1172432
//   node scripts/ndl.mjs image 1172432 179 out.jpg
//   node scripts/ndl.mjs image 1172432 179 out.jpg 1750,400,950,2300

const [command, ...args] = process.argv.slice(2);

const die = (message) => { console.error(message); process.exit(2); };

async function info(pid) {
  if (!pid) die("使い方: ndl.mjs info <PID>");
  const response = await fetch(`https://dl.ndl.go.jp/api/iiif/${pid}/manifest.json`);
  if (!response.ok) die(`manifest を取得できない（HTTP ${response.status}）。インターネット公開でない可能性がある。`);
  const manifest = await response.json();

  console.log(`PID ${pid}  https://dl.ndl.go.jp/pid/${pid}`);
  for (const item of manifest.metadata ?? []) {
    if (["Title", "Creator", "Publisher", "Publication Date", "Access Restrictions"].includes(item.label)) {
      console.log(`  ${item.label}: ${item.value}`);
    }
  }
  const access = (manifest.metadata ?? []).find((item) => item.label === "Access Restrictions")?.value;
  // PDM = パブリックドメイン。これ以外は AUTHORING_STANDARD §2-2 の条件を満たさない。
  console.log(access === "PDM"
    ? "  → インターネット公開（保護期間満了）。底本に使える。"
    : `  → 公開区分が PDM ではない（${access ?? "不明"}）。底本にしない。`);

  const canvases = manifest.sequences?.[0]?.canvases ?? [];
  console.log(`  コマ数: ${canvases.length}`);

  const structures = manifest.structures ?? [];
  if (!structures.length) {
    console.log("  structures なし（収録範囲を機械的に確かめられない。目次のコマを開いて確認する）");
    return;
  }
  console.log("\n収録範囲（label の数字が開始ページ、-> がコマ番号）:");
  for (const structure of structures) {
    const canvas = structure.canvases?.[0]?.split("/").pop() ?? "?";
    console.log(`  ${structure.label} -> canvas ${canvas}`);
  }
  console.log("\n作品名と頁が食い違っていないかをここで確かめる。");
  console.log("例: 竹取物語 p.1 / 大和物語 p.37 と出ていれば、竹取物語の p.238 は存在しない。");
}

async function search(phrase, ...pids) {
  if (!phrase) die('使い方: ndl.mjs search "<固有性の高い連語>" [PID...]');
  const url = `https://lab.ndl.go.jp/dl/api/book/search?${new URLSearchParams({ keyword: phrase, size: "100" })}`;
  const response = await fetch(url);
  if (!response.ok) die(`全文検索に失敗（HTTP ${response.status}）`);
  const data = await response.json();
  const list = data.list ?? [];
  console.log(`"${phrase}" 総ヒット ${list.length}件`);

  if (!pids.length) {
    for (const book of list.slice(0, 10)) console.log(`  ${book.id} ${book.title} (${book.published})`);
    console.log("\nPIDを引数に足すと、その底本に当たっているかだけを見る。");
    return;
  }

  let found = false;
  for (const book of list) {
    if (!pids.includes(book.id)) continue;
    found = true;
    console.log(`\n● ヒット: ${book.id} ${book.title}`);
    for (const highlight of book.highlights ?? []) {
      console.log(`   ${highlight.replace(/<em>/g, "【").replace(/<\/em>/g, "】")}`);
    }
  }
  if (!found) {
    console.log(`\n指定した底本（${pids.join(", ")}）に当たらなかった。次のどれかを疑う。`);
    console.log("  1. 本文がその底本に無い（＝出典が誤っている）");
    console.log("  2. 連語が一般的すぎて他書に押し出された（書名やPIDで絞る手段は無い）");
    console.log("  3. 底本が全文索引の対象外（木版本・変体仮名は索引されない）");
    console.log("  1と2を切り分けるには、もっと固有性の高い連語で引き直す。旧字体で入力する。");
  }
  console.log("\nhighlights は底本の字面そのもの（踊り字は〓に化ける）。ここから本文を起こしてよい。");
}

async function image(pid, canvas, out, region = "full") {
  if (!pid || !canvas || !out) die("使い方: ndl.mjs image <PID> <canvas番号> <出力パス> [x,y,w,h]");
  const padded = String(canvas).padStart(7, "0");
  const url = `https://dl.ndl.go.jp/api/iiif/${pid}/R${padded}/${region}/2000,/0/default.jpg`;
  const response = await fetch(url);
  if (!response.ok) die(`画像を取得できない（HTTP ${response.status}）: ${url}`);
  const { writeFile } = await import("node:fs/promises");
  await writeFile(out, Buffer.from(await response.arrayBuffer()));
  console.log(`保存: ${out}`);
  console.log("Read ツールで開いて版面を読む。1コマ＝見開き2ページなので、");
  console.log("特定の柱（ページ）を詰めて読むときは region に x,y,w,h を渡して切り出す。");
  console.log("原寸は manifest の width/height（例 3800x2964）。右頁が後ろのページ番号。");
}

const commands = { info, search, image };
if (!commands[command]) die("使えるコマンド: info / search / image");
await commands[command](...args);
