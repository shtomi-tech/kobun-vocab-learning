# 和歌候補探索

`scripts/find-waka-candidates.mjs` は、古文単語の見出し語を Hachidaishu の JSONL コーパスに照合し、和歌候補を調査用 JSON に出力する。候補の発見だけを行い、データ本体や `docs/waka-adoptions.json` は変更しない。

## schema adapter

公開 `hachidaishu.jsonl` は、`Anthology`、`Poem`、`Surface`、`Lemma`、`LemmaReading`、`Kanji`、`KanjiReading` などの大文字キーを使う。`hachidaishu.py` の `to_json()` 系で得られる小文字 schema も受け付ける。

読み込み時に次の境界で公開形式を内部 canonical schema へ正規化する。

```text
External corpus format
        ↓
normalizeHachidaishuRecord()
        ↓
Canonical Hachidaishu record
        ↓
findCandidates()
```

canonical record の必須キーは次の7つである。

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

`Poem` / `poem` は数値へ統一する。`POS`、`UPosTag`、`WLSPH` など探索に使わない公開JSONLの追加フィールドは adapter で破棄する。不正な外部形式や必須フィールド欠損は、候補0件として扱わず `Hachidaishu schema mismatch` で停止する。

`anthology` と `poem` が同じ token を歌単位にまとめ、入力順を保ったまま `surface` と `kanji_reading ?? lemma_reading` を連結する。Hachidaishu は1行1 token のデータであり、歌全体を1行に詰めた phrase-level データは受け付けない。

語形照合は `lemma_reading`、`kanji_reading`、`lemma`、`kanji`、`surface` の順に行い、結果には一致した `field` と、フィールド全体との完全一致かどうかを示す `exact` を記録する。たとえば見出し語 `きよし` は、`surface: きよき` でも `lemma: 清し` でもなく、`lemma_reading: きよし` による完全一致として記録される。長い語形、読み・lemma の完全一致を優先し、同じ歌内の重複一致には減点する。

## 実行

初回実行時だけ、公開コーパスを `.cache/waka/hachidaishu.jsonl` に保存する。キャッシュと詳細結果は `.gitignore` 対象で、リポジトリや公開バンドルには入らない。

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

## 対象範囲

対象は八代集の次の8コレクションで、万葉集（Manyoshu）は対象外である。

- 古今和歌集（Kokinshu）
- 後撰和歌集（Gosenshu）
- 拾遺和歌集（Shuishu）
- 後拾遺和歌集（Goshuishu）
- 金葉和歌集（Kin'yoshu / Kin’yoshu）
- 詞花和歌集（Shikashu）
- 千載和歌集（Senzaishu）
- 新古今和歌集（Shinkokinshu）

万葉集は将来、別コーパス adapter として扱う。Hachidaishu の JSONL は [yamagen/hachidaishu](https://github.com/yamagen/hachidaishu) のデータを使用し、ライセンス表示は同リポジトリの記載に従う。

## 検証

外部取得を行わずに、canonical 小文字 schema と公開大文字 schema の両方を検査できる。

```powershell
node scripts/check-waka-candidates.mjs
```

実公開 JSONL をキャッシュなしで確認する場合は、次のようにキャッシュを削除してから実行する。

```powershell
Remove-Item .cache/waka/hachidaishu.jsonl -ErrorAction SilentlyContinue
node scripts/find-waka-candidates.mjs --top 5
```
