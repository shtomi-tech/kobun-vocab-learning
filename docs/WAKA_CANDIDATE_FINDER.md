# 和歌候補探索

`scripts/find-waka-candidates.mjs` は、全600語の有効な見出し語を Hachidaishu のJSONLコーパスに照合し、和歌候補を調査用JSONへ出力する。候補の発見だけを行い、データ本体や `docs/waka-adoptions.json` は変更しない。

初回実行時だけ、次のコマンドが外部コーパスを `.cache/waka/hachidaishu.jsonl` に保存する。キャッシュと詳細結果は `.gitignore` 対象で、リポジトリや公開バンドルには入らない。

```powershell
node scripts/find-waka-candidates.mjs
```

絞り込みと出力先の指定もできる。

```powershell
node scripts/find-waka-candidates.mjs --set kobun-set-03 --top 10
node scripts/find-waka-candidates.mjs --id kv03-025 --output .cache/waka/kv03-025.json
node scripts/find-waka-candidates.mjs --collection 古今和歌集
```

標準出力は走査語数と候補語数だけに抑え、詳細は既定で `.cache/waka/candidates.json` に保存する。候補には歌集、歌番号、表記、読み、語形一致箇所、推定総モーラ数、短歌らしさの目安を含める。五句境界や本文の採否は自動確定せず、NDL等の底本で確認してから `docs/waka-adoptions.json` へ登録する。

Hachidaishu は古今和歌集から新古今和歌集までの八代集が対象で、万葉集は収録範囲外である。そのため、万葉集の候補が空でも欠損とは断定しない。HachidaishuのJSONLは [yamagen/hachidaishu](https://github.com/yamagen/hachidaishu) のデータを使用し、ライセンス表示は同リポジトリの記載に従う。

外部取得を行わずに検査する場合は、合成fixtureを使う。

```powershell
node scripts/check-waka-candidates.mjs
node scripts/find-waka-candidates.mjs --corpus scripts/fixtures/waka/hachidaishu.jsonl --id kv03-025
```
