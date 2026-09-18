# REFACTOR_PLAN_2026-09-18 — リファクタリング計画

> 状態: 計画のみ（未着手）。作成 2026-09-18。
> 原則: 挙動・データ・保存キー・公開URLは変えない。各段階の後に全検査を通し、段階ごとにコミットする。

## 0. 現況（実測）

| 対象 | 行数 | 所見 |
|---|---|---|
| `static/mode-vocab.js` | 1480 | 1つのIIFEに、保存・学習計画の計算・出題・例文表示・画面描画・セッション制御が同居 |
| `static/cloud.js` | 496 | 正本は `portal/shared/cloud.js`（`sync-cloud.mjs` で配布）。**このリポジトリでは触らない** |
| `scripts/check-*.mjs` | 約25本 | `manifest.json` → 全語の読み込みを各スクリプトが個別に書いている |
| `scripts/fix-example-quality*.mjs` ほか | 8本 | 一度きりの移行スクリプト。docs から参照あり |

**検査の穴:** `.github/workflows/pages.yml` から次の8本が漏れている。前回のデプロイ失敗（check-set-03/13/14 を手元で実行していなかった）もこれが原因。

`check-context-choices.mjs` `check-set-03.mjs` `check-set-12.mjs`〜`check-set-16.mjs` `check-set-progress.cjs`

**テストの結合:** `check-vocab-runtime.cjs` と `check-study-plan.cjs` は `mode-vocab.js` の本文を文字列置換して `__test` を差し込み、内部関数を取り出している。`check-waka-display.mjs` と `check-meaning-example-ui.cjs` は本文の文字列を直接検査している。**ファイル分割は、これらの検査の書き換えとセットになる。**

## 1. 段階と順序

| 段階 | 内容 | リスク | 依存 |
|---|---|---|---|
| R1 | 検査の一本化 | 低 | なし |
| R2 | 検査スクリプトの共通ローダー | 低 | R1 |
| R3 | `mode-vocab.js` から純粋ロジックを分離 | 中 | R1 |
| R4 | 一度きりのスクリプトの整理 | 低（要判断） | なし |

### R1. 検査の一本化（最優先）

- `scripts/check-all.mjs` を追加する。CIが実行している検査と、漏れている8本をすべて順に実行し、最初の失敗で止まる。
- `pages.yml` の検査ステップを `node scripts/check-all.mjs` の1行に置き換える。手元とCIが同じ一覧を使う。
- 完了条件: 手元で `check-all` が通る。CI上でも同じ本数が実行される。

### R2. 検査スクリプトの共通ローダー

- `scripts/lib/data.mjs` に `loadManifest()` / `loadSets()` / `loadWords()` / `loadAdoptions()` を置く。
- 各 `check-*.mjs`・`apply-waka.mjs` の読み込み部分をこれに置き換える。検査の中身（アサーション）は変えない。
- 完了条件: 差分が読み込み部分だけ。`check-all` が通る。

### R3. `mode-vocab.js` から純粋ロジックを分離

既存の `set-progress.js` / `meaning-guard.js` と同じ形（`window` 上のグローバル、ビルドなし）で切り出す。DOMに触れない関数だけを対象にする。

| 新ファイル | 移す関数（現行の行） |
|---|---|
| `static/study-plan.js` | `isValidIsoDate`〜`vocabularyGoalForecast`、`migrateFirstAnsweredAt`（195〜283行付近） |
| `static/example-view.js` | `isWaka` `wakaRefText` `contextMoraCount` `exampleTargetPart` `wakaBlankPart` `exampleBody` `exampleClass`（66〜135行） |
| `static/choice-builder.js` | `choiceSet` `meaningChoicesAreSafe`（433〜494行）。`state` への依存は引数で渡す |

- `index.html` に読み込み順を追加し、`mode-vocab.js` の `?v=` を上げる（キャッシュ対策）。
- 検査の書き換え: `check-study-plan.cjs` と `check-vocab-runtime.cjs` の一部は、文字列置換による露出をやめて新ファイルを直接読み込む。`check-waka-display.mjs` と `check-meaning-example-ui.cjs` は、検査対象のファイル名を新ファイルへ移す。
- `pages.yml` の `cp static/*.js` は新ファイルも拾う（サブディレクトリではないため追加設定は不要）。
- 1ファイルずつ切り出してコミットする。画面描画・セッション制御は今回は分けない（状態の共有が多く、効果に対してリスクが大きい）。
- 完了条件: `check-all` が通る。ブラウザで、ホーム・学習（フラッシュ→4択）・和歌の文中問題・意味復習の各1周でコンソールエラーがない。

### R4. 一度きりのスクリプトの整理（判断が必要）

- `fix-example-quality*.mjs`（6本）・`replace-generated-examples.mjs`・`mark-prose.mjs` は実行済みの移行スクリプト。
- 選択肢: (a) `scripts/archive/` へ移し、docs の参照パスを直す ／ (b) 現状維持。
- 移動は参照パスの変更を伴うため、実施するかを確認してから行う。

## 2. 対象外

- `static/cloud.js`（正本は portal 側）
- データ（`data/*.json`）、localStorage のキー、Supabase の appId、公開URL
- 画面の見た目・文言の変更

## 3. 検証

- 各段階の後: `node scripts/check-all.mjs`（R1以降）
- R3の後: ブラウザで主要な流れを1周。push前に `pages.yml` と同じ手順が手元で通ることを確認する
