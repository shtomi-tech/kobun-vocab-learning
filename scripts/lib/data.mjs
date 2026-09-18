// 検査・反映スクリプト共通の読み込み。manifest から全セット・全語をたどる処理を一か所にまとめる。
// KOBUN_ROOT を指定すると、別のチェックアウト（検証用の複製など）を対象にできる。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = process.env.KOBUN_ROOT || fileURLToPath(new URL("../../", import.meta.url));
export const resolve = (relativePath) => path.join(root, relativePath);

// 改行コードはLFへ揃える。実装の字面を正規表現で見る検査が、CRLFの作業コピーでも同じ結果になる。
export const read = (relativePath) => fs.readFileSync(resolve(relativePath), "utf8").replace(/\r\n/g, "\n");
export const readJson = (relativePath) => JSON.parse(read(relativePath));

export const loadManifest = () => readJson("data/manifest.json");

/** manifest 順に { setId, dataUrl, data } を返す。data はセットJSON全体（meta と words）。 */
export function loadSets(manifest = loadManifest()) {
  return Object.entries(manifest.sets).map(([setId, entry]) => ({ setId, dataUrl: entry.dataUrl, data: readJson(entry.dataUrl) }));
}

export const loadWords = (manifest = loadManifest()) => loadSets(manifest).flatMap(({ data }) => data.words);

export const loadAdoptions = () => readJson("docs/waka-adoptions.json");
