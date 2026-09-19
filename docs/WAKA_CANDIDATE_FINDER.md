# 和歌候補探索

`scripts/find-waka-candidates.mjs` は、古文単語の見出し語を Hachidaishu の JSONL コーパスに照合し、和歌候補を調査用 JSON に出力する。候補の発見だけを行い、データ本体や `docs/waka-adoptions.json` は変更しない。

## コーパスのスキーマ

入力は Hachidaishu の実データと同じ小文字の token-level schema を使う。1行が1トークンで、次の7フィールドを必須とする。

```json
{
  "anthology": "Kokinshu",
  "poem": 797,
  "surface": "きよき",
  "lemma": "清し",
  "lemma_reading": "きよし",
  "kanji": "清き",
  "kanji_reading": "きよき"
}
```

`anthology` と `poem` が同じトークンを歌単位にまとめ、入力順を保ったまま `surface` と `kanji_reading ?? lemma_reading` を連結する。大文字の旧 schema や、歌全体を1行に詰めた phrase-level データは受け付けず、JSONL 読み込み時に `Hachidaishu schema mismatch` として停止する。

なお、2026-09-19 時点の upstream `main` の raw JSONL は先頭レコードから大文字 schema を返すため、この validator で停止する。小文字 schema の実データを取得できる状態、または別途承認された adapter が必要である。

語形照合は `lemma_reading`、`kanji_reading`、`lemma`、`kanji`、`surface` の順に行い、結果には一致した `field` と、フィールド全体との完全一致かどうかを示す `exact` を記録する。たとえば見出し語 `きよし` は、トークンの `surface: きよき` ではなく `lemma_reading: きよし` による完全一致として記録される。長い語形、読み・lemma の完全一致を優先し、同じ歌内での重複一致には減点する。

## 実行

初回実行時だけ、外部コーパスを `.cache/waka/hachidaishu.jsonl` に保存する。キャッシュと詳細結果は `.gitignore` 対象で、リポジトリや公開バンドルには入らない。

```powershell
node scripts/find-waka-candidates.mjs
```

絞り込みと出力先の指定もできる。

```powershell
node scripts/find-waka-candidates.mjs --set kobun-set-03 --top 10
node scripts/find-waka-candidates.mjs --id kv03-025 --output .cache/waka/kv03-025.json
node scripts/find-waka-candidates.mjs --collection 古今和歌集
```

通常実行では、既存の和歌例文（`exampleForm: "waka"`）を走査対象から除外する。`--id` を指定した場合だけ、既存例文も個別確認のため走査する。

標準出力は走査語数と候補語数に抑え、詳細は既定で `.cache/waka/candidates.json` に保存する。レポートには歌集、歌番号、表記、読み、語形一致箇所、`field`、`exact`、推定総モーラ数、短歌らしさの目安を含める。五句境界や本文の採否は自動確定せず、NDL 等の底本で確認してから `docs/waka-adoptions.json` へ登録する。

対象は八代集の次の8コレクションで、万葉集（Manyoshu）は対象外である。

- 古今和歌集（Kokinshu）
- 後撰和歌集（Gosenshu）
- 拾遺和歌集（Shuishu）
- 後拾遺和歌集（Goshuishu）
- 金葉和歌集（Kin'yoshu / Kin’yoshu）
- 詞花和歌集（Shikashu）
- 千載和歌集（Senzaishu）
- 新古今和歌集（Shinkokinshu）

Hachidaishu の JSONL は [yamagen/hachidaishu](https://github.com/yamagen/hachidaishu) のデータを使用し、ライセンス表示は同リポジトリの記載に従う。

外部取得を行わずに検査する場合は、合成 fixture を使う。

```powershell
node scripts/check-waka-candidates.mjs
```
