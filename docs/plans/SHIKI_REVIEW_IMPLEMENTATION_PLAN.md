# 実装計画: shiki レビュー対応 (2026-09-08)

## 計画状態

- `READY`（セルフレビュー済み・実装へ引き渡し可）

## 目標

shiki レビューで `CONFIRMED` とされた F-01〜F-04 を、既存の学習フロー、保存キー、URL構造、静的データ形式を変更せず修正する。修正後は、ブロック境界・終了時保存・壊れた進捗データ・初回ヒーローの4契約を自動検証できる状態にする。

## 入力

- 監査レポート: 本タスク入力の shiki 読み取り専用レビュー
- 監査種別: code-review 相当の読み取り専用レビュー
- 根拠の扱い: 下記 F-01〜F-04 はすべて shiki の `CONFIRMED`。未確認の実ブラウザ操作、Supabase実通信、公開版は実装計画の入力事実へ昇格させない。
- 依頼範囲: F-01〜F-04 の計画化のみ。コード実装、commit、push、deploy は実施しない。

## 対象範囲 / 対象外

- 対象: F-01, F-02, F-03, F-04
- 対象外: 新規監査、レビューにない改善、データJSONの変更、保存キー・URL・RPC名の変更、依存追加、コード修正、commit、push、deploy、公開版の実査

## 前提と未確認事項

- リポジトリ直下の `AGENTS.md`、`README.md`、`DESIGN.md` に従い、既存の学習フロー、暖色紙面のUI契約、保存キー、Supabase RPC契約は維持する。
- `static/mode-vocab.js` は、通常開始では未学習ブロックから始まり、全ブロックの意味確認後に文中問題へ進む現在の流れを維持する。
- F-01 の実装案は、開始した `batchIndex` より前の語を文中問題から除外し、開始ブロック以降の語を対象にする。これにより第3ブロックの直接開始は第3ブロックだけになり、第2ブロックの開始は第2・第3ブロックの既存進行を保てる。直接開始を常に第1未学習ブロックへ強制する案は採用しない。
- F-02 は `pagehide` から `flush` を呼ぶ方式を採用する。永続キュー、DBスキーマ、RPC名は追加・変更しない。ページ終了時の送信はブラウザの keepalive 対応に依存するため、Supabase実通信と公開版での到達性は実装後の追加確認事項として残す。
- F-03 の「形」は、トップレベル進捗がレコードであり、`units`・`finalCheck`・`items` がレコード、`history` が配列であることを指す。各語の値や未知のトップレベル項目を監査外の仕様として再設計しない。

## 変更方針

1. 学習セッション生成時に `contextOrder` の下限を `batchIndex` に合わせる。回答処理 `answerQuiz` の `unit(id).learned = true` は変更せず、誤ったIDをセッションへ渡さない。
2. クラウド保存の遅延タイマー処理を `flush` へ抽出し、通常保存と終了時保存が同じ pending 集約・再試行経路を使う。`pagehide` ではタイマーを取り消して未送信パッチを即時にキューへ移す。
3. ローカルおよびクラウドから到着した進捗を、利用箇所へ渡す直前に一つの `normalizeProgress` で整える。データバージョン不一致時の既存リセット処理は正規化後も維持する。
4. ヒーロー表示は `homeIntroduced` の初回判定だけを使い、`learned === 0` を表示条件から外す。

## 変更ファイルマップ

| ファイル | 新規/変更 | 責務 |
|---|---|---|
| `static/mode-vocab.js` | 変更 | セッション生成、進捗正規化、ホームの初回ヒーロー、`pagehide` からの flush 呼び出し |
| `static/cloud.js` | 変更 | 遅延保存の flush 抽出、終了時 keepalive 保存、失敗パッチの再キュー |
| `scripts/check-vocab-runtime.cjs` | 新規 | F-01/F-02/F-03/F-04 の最小ランタイム契約をNode VMとスタブで検証 |
| `.github/workflows/pages.yml` | 変更 | 新規ランタイム契約検査をPages前の検査列へ追加 |
| `docs/plans/SHIKI_REVIEW_IMPLEMENTATION_PLAN.md` | 作成済み | 本計画。実装対象外の計画書 |

生成物の直接編集は行わない。`static/*.js` はこのアプリの正本であり、`scripts/check-vocab-runtime.cjs` は検証コード、`.github/workflows/pages.yml` は検査登録である。

## 並列実装設計

- 実行方式: `SERIAL_ONLY`
- レーン数: `1`
- 起動条件: yuna は T1 から T4 を依存順に同一checkoutで実行し、各タスクの Gate A/B を通過させてから次へ進む。
- `YUNA-A`: なし。SERIAL_ONLY のため起動しない。
- `YUNA-B`: なし。SERIAL_ONLY のため起動しない。
- 共有読み取り: `AGENTS.md`、`README.md`、`DESIGN.md`、`static/set-progress.js`、既存 `scripts/check-*.cjs` / `scripts/check-*.mjs`、`.github/workflows/pages.yml`
- 競合条件: `static/mode-vocab.js`、`scripts/check-vocab-runtime.cjs`、`.github/workflows/pages.yml` のいずれかを複数タスクが変更するため並列化しない。既存の `AGENTS.md` の変更は保持し、計画書以外の既存変更を戻さない。
- 統合担当: 親Agent
- 統合検証: T1〜T4完了後、T5で `git diff --check`、変更ファイル確認、Node構文検査、新規契約検査、既存24本の検査を実行する。実ブラウザ、Supabase実通信、公開版は本計画の完了条件に含めない。

## タスク

### T1: 学習ブロック選択時の文中問題境界を修正する

- 種別: `IMPLEMENT`
- 対応する指摘: F-01
- 根拠の強さ: `CONFIRMED`（shiki、重大度 `高`）
- owner: `SERIAL`
- parallel_group: `なし`
- depends_on: `なし`
- write_set: `static/mode-vocab.js`, `scripts/check-vocab-runtime.cjs`, `.github/workflows/pages.yml`
- read_set: `static/set-progress.js`, `scripts/check-set-progress.cjs`, `README.md`
- conflicts: T2〜T4も `static/mode-vocab.js` または共有検査ファイルを変更するため、T1完了とGate A/B通過まで次タスクを開始しない。
- integration_owner: `親Agent`
- 対象ファイルと関数: `static/mode-vocab.js` の `startLearn`、追加する `createLearnSession`、`nextQuiz` の既存セッション遷移
- 具体的変更:
  - セッション生成を `createLearnSession` へ分離し、`ids`、`batchCount`、`batchIndex`、`batchIds` の計算を一か所へ集約する。
  - `order` と `meaningOrder` の現在契約は維持する。
  - `contextOrder` は `ids.slice(batchIndex * BATCH_SIZE)` を `shuffle` した配列にする。したがって通常の第1ブロック開始では全語、途中の第2ブロック開始では第2ブロック以降、第3ブロック直接開始では第3ブロックだけが文中問題の対象になる。
  - `answerQuiz("context", ...)`、`unit(id)`、保存処理、ブロックの意味確認遷移は変更しない。
  - Node VMから検証できるよう、既存の本番戻り値を変更せず、検査スクリプト側で `return { mount };` を文字列置換して `createLearnSession` と `state` をテストへ露出する。
- Gate A 検証: `node --check static/mode-vocab.js` と `node scripts/check-vocab-runtime.cjs`。期待結果は構文エラーなし、12語の配列で第3ブロック直接開始の `contextOrder` に第1・第2ブロックのIDが含まれず、途中開始の残り範囲も一致すること。
- Gate B 検証: 検査スクリプトで12語を3ブロックに分け、(1) `createLearnSession(2)`、(2) 第1・第2ブロックを `learned: true` にした `createLearnSession(null)` を実行する。期待結果は両方とも `contextOrder` の集合が第3ブロックの4語だけであり、直接開始で第1・第2ブロックの `learned` を増やす経路が存在しないこと。
- 受入基準: 第3ブロックを直接開始した文中問題が第3ブロック以外を出題せず、既存の通常開始（第1ブロックから全ブロックを進める）では12語の文中問題が維持される。回帰検査がCI列に登録されている。
- コミット: `fix: keep context questions within the selected learning range`
- 依存と未達時の扱い: Gate A失敗時はセッション生成と検査の契約を同時に見直し、T2へ進まない。Gate Bで前方IDが混入した場合はT1内で `contextOrder` の算出だけを修正する。ブラウザ実操作での確認は未実施として残し、T1を未完了とは扱わない。

### T2: 生徒別クラウド保存を終了時に flush する

- 種別: `IMPLEMENT`
- 対応する指摘: F-02
- 根拠の強さ: `CONFIRMED`（shiki、重大度 `中`）
- owner: `SERIAL`
- parallel_group: `なし`
- depends_on: `T1`
- write_set: `static/cloud.js`, `static/mode-vocab.js`, `scripts/check-vocab-runtime.cjs`, `.github/workflows/pages.yml`
- read_set: `README.md` の匿名利用・生徒別同期節、既存の `saveProgressFor` と `mount`
- conflicts: `queueSave`、`mount`、新規検査スクリプトを共有するため、T1の差分を保持したまま直列適用する。RPC名、引数名、保存キーを変更しない。
- integration_owner: `親Agent`
- 対象ファイルと関数: `static/cloud.js` の `rpc`、`queueSave`、追加する `flush`。`static/mode-vocab.js` の `mount`
- 具体的変更:
  - `static/cloud.js` の保存本体を `flush({ keepalive = false } = {})` へ抽出する。flush開始時にタイマーを解除し、`pending` の値をスナップショットしてから `pending.clear()` し、既存の `queue` Promiseへ順序どおり追加する。
  - 通常の600ms遅延保存は `setTimeout(() => flush(), 600)` から呼ぶ。
  - `rpc` はfetch初期化オプションを受け取り、`keepalive: true` が指定されたflushでは保存RPCのリクエストへ同値を渡す。RPC URL、HTTPメソッド、認証ヘッダー、ボディのキーは現在値を維持する。
  - 保存失敗時は、今回のスナップショットだけを `pending` へ戻し、既存と同じエラー状態表示を行う。成功時は既存の保存済み表示を行う。
  - 戻り値へ `flush` を追加する。`static/mode-vocab.js` の `mount` でcloud生成後に一度だけ `window.addEventListener("pagehide", () => cloud?.flush({ keepalive: true }))` を登録する。
  - `queueSave` は未有効・空パッチを無視する既存条件を維持し、ローカル保存の同期タイミングは変更しない。
- Gate A 検証: `node --check static/cloud.js`、`node --check static/mode-vocab.js`、`node scripts/check-vocab-runtime.cjs`。期待結果は構文エラーなし、cloud APIに `flush` があり、既存RPC契約の文字列検査が通ること。
- Gate B 検証: 検査スクリプトのfetchスタブで `init` を完了させ、`queueSave` 直後に `flush({ keepalive: true })` を呼ぶ。期待結果は600msタイマーを待たずに `app_save_progress_dataset` が1回送信され、保存fetchの初期化に `keepalive: true` が入り、成功後に pending が再送対象として残らないこと。実装後のローカルHTTP画面では、生徒別URLで回答直後に `pagehide` を発火させ、保存済み表示またはスタブでの送信を確認する。
- 受入基準: 操作直後に終了イベントが発生しても、終了イベント前に `pending` へ入った最新パッチがflushへ渡る。通常の600ms保存、保存失敗時の再キュー、RPCボディの既存キーが壊れない。
- コミット: `fix: flush pending student progress on pagehide`
- 依存と未達時の扱い: Gate Bでタイマー経由の二重送信、失敗パッチ消失、keepalive未指定が見つかった場合はT2内で `flush` と `queueSave` の共有経路を修正する。Supabase実通信で失敗した場合は `WAITING_FOR_EVIDENCE` と記録し、認証・権限・公開設定をコード修正へ拡張しない。

### T3: 壊れた進捗データを読み込み時に正規化する

- 種別: `IMPLEMENT`
- 対応する指摘: F-03
- 根拠の強さ: `CONFIRMED`（shiki、重大度 `中`）
- owner: `SERIAL`
- parallel_group: `なし`
- depends_on: `T2`
- write_set: `static/mode-vocab.js`, `scripts/check-vocab-runtime.cjs`, `.github/workflows/pages.yml`
- read_set: `static/set-progress.js`、`loadReviewPool`、`applyCloudProgress`、`unit`、`appendHistory`
- conflicts: `loadProgressFor`、`state.progress`、共有検査スクリプトを変更するため、T2の保存契約を通過した後に直列で実施する。進捗データのキー追加や移行マーカー追加は行わない。
- integration_owner: `親Agent`
- 対象ファイルと関数: `static/mode-vocab.js` の `loadProgressFor`、追加する `normalizeProgress`、`loadReviewPool` が使う読み込み経路、`applyCloudProgress`
- 具体的変更:
  - `normalizeProgress(candidate, set)` を追加し、トップレベルが配列・null・primitiveの場合は空のレコードとして扱う。
  - 戻り値の `units`、`finalCheck`、`items` は配列でないレコード、`history` は配列へ固定する。該当フィールドが欠けている場合も空値を設定し、未知のトップレベル項目は保持する。
  - `loadProgressFor` はJSON解析後、データバージョン判定と `unit()` 利用の前に必ず正規化する。データバージョン不一致時に `finalCheck` を空にし `resume` を削除する現在処理は維持する。
  - `loadReviewPool` の各セットと、cloud `applyLoaded` がローカルキャッシュへ入れる各セットが、最終的に `loadProgressFor` を通ることを検査で固定する。`applyCloudProgress` のRPCデータ構造や保存キーは変更しない。
  - Node VM検査へ `normalizeProgress` と `state` を露出し、`units: null`、`finalCheck: null`、`history: {}`、`items: null`、トップレベル配列、トップレベルnullを入力するケースを追加する。
- Gate A 検証: `node --check static/mode-vocab.js` と `node scripts/check-vocab-runtime.cjs`。期待結果は全ケースで例外なし、4コンテナが `units/finalCheck/items` はレコード、`history` は配列になること。
- Gate B 検証: `localStorage`スタブへ `units: null`、`finalCheck: null`、`history: {}`、`items: null` を含むJSONを保存し、`loadProgressFor` 相当の検査経路から `unit()`、`reviewIds()`、`appendHistory()` が例外なく利用できることを確認する。cloud `applyLoaded` 由来の同じデータも、次のセット読み込みで同じ正規化結果になることを確認する。
- 受入基準: 壊れたローカル保存またはcloud由来保存が、汎用エラー画面へ直行せず空の安全なコンテナとして起動する。正常な既存進捗、データバージョン不一致時のリセット、未知のトップレベル項目の保持が維持される。
- コミット: `fix: normalize malformed vocabulary progress`
- 依存と未達時の扱い: Gate A/Bでいずれかのコンテナがnullのまま残った場合はT3内で正規化の入口を修正する。Supabaseから実際に返る不正JSONの形式が入力記載と異なる場合は、確認できた形だけを追加し、推測でスキーマを広げない。

### T4: 初回ヒーローの表示条件を homeIntroduced に統一する

- 種別: `IMPLEMENT`
- 対応する指摘: F-04
- 根拠の強さ: `CONFIRMED`（shiki、重大度 `低`）
- owner: `SERIAL`
- parallel_group: `なし`
- depends_on: `T3`
- write_set: `static/mode-vocab.js`, `scripts/check-vocab-runtime.cjs`, `.github/workflows/pages.yml`
- read_set: `renderHome` の `learned` 集計、`homeIntroduced` 宣言、READMEの学習フロー
- conflicts: `renderHome` と共有検査スクリプトを変更するため、T3の正規化差分を含む同一checkoutで直列適用する。
- integration_owner: `親Agent`
- 対象ファイルと関数: `static/mode-vocab.js` の `renderHome`
- 具体的変更:
  - `const isFirstVisit = learned === 0` を削除し、ヒーローの条件を `if (isFirstReveal)` に変更する。
  - `homeIntroduced = true` の設定位置、`is-entering` のアニメーション判定、`learned` の統計・主CTA用途は維持する。
  - 検査スクリプトで `learned === 0` がヒーロー条件に残っていないこと、および `isFirstReveal` がヒーロー条件に使われることを固定する。
- Gate A 検証: `node --check static/mode-vocab.js` と `node scripts/check-vocab-runtime.cjs`。期待結果はヒーロー条件の契約検査が通り、`learned` は表示条件以外の既存用途で残ること。
- Gate B 検証: DOMスタブまたはローカルHTTP画面で `renderHome` 相当を2回実行する。1回目だけ `.hero` が存在し、学習語数を0へ戻した2回目も `.hero` が再表示されないことを確認する。
- 受入基準: 同一ページの一覧復帰・再描画でヒーローが再表示されず、初回の導入表示だけが維持される。学習語数0であること自体は再表示条件にならない。
- コミット: `fix: show vocabulary intro hero only once`
- 依存と未達時の扱い: Gate A/Bで2回目の再表示が確認された場合は、`homeIntroduced` の更新順序と条件の組合せだけをT4内で修正する。アニメーションのデザイン変更は今回対応しない。

### T5: 統合検証と変更境界を確認する

- 種別: `VERIFY_ONLY`
- 対応する指摘: F-01, F-02, F-03, F-04 の完了確認
- 根拠の強さ: `IMPLEMENT` 各タスクのGate A/B結果を統合した実装後証拠。新しい監査ではない。
- owner: `SERIAL`
- parallel_group: `なし`
- depends_on: `T1, T2, T3, T4`
- write_set: `なし（検証のみ）`
- read_set: `git diff`、`AGENTS.md`、`static/mode-vocab.js`、`static/cloud.js`、`scripts/check-vocab-runtime.cjs`、`.github/workflows/pages.yml`
- conflicts: 検証中にコードやデータを修正しない。失敗時は該当IMPLEMENTタスクへ戻し、T5から直接修正しない。
- integration_owner: `親Agent`
- Gate A 検証: `git diff --check`; `node --check static/mode-vocab.js`; `node --check static/cloud.js`; `node scripts/check-vocab-runtime.cjs`; `.github/workflows/pages.yml` に登録された既存24本の `scripts/check-*` を実行する。期待結果は全コマンド成功。
- Gate B 検証: ローカルHTTPで初回ホーム→第3ブロック直接開始→文中問題、保存スタブ付き生徒別URLの回答直後pagehide、壊れたlocalStorage、一覧復帰の4経路を一度ずつ確認する。期待結果は第3ブロック以外がlearnedにならず、終了時パッチがflushされ、起動不能にならず、ヒーローが再表示されないこと。
- Gate C / 外部確認: 実Supabase通信、公開版URL、複数ブラウザの終了動作は今回の読み取り専用レビューで未確認。実装後に別途実通信権限と公開版が揃った場合だけ確認し、未実施でもT5のコード統合検証を不合格にしない。
- 受入基準: F-01〜F-04がトレーサビリティ表の受入チェックを満たし、差分が計画のwrite_set内に収まり、既存の `AGENTS.md` 変更が保持される。
- コミット: `なし（検証のみ）`
- 依存と未達時の扱い: 既存検査が失敗した場合は原因ファイルを特定し、既存変更を戻さず該当タスクへ差し戻す。計画外ファイルが増えた場合は作業を止め、ファイル名と状態を報告する。ブラウザ・Supabase・公開版だけが未確認の場合は `WAITING_FOR_EVIDENCE` と記録する。

## トレーサビリティ

| 指摘ID | 重大度 | 根拠の強さ | 概要 | 対応タスク | 種別 | Gate A | Gate B / 受入チェック |
|---|---|---|---|---|---|---|---|
| F-01 | 高 | `CONFIRMED` | 第3ブロック直接開始でも `contextOrder` が全12語となり、前ブロックが `learned` になる | T1 | `IMPLEMENT` | 構文検査＋ランタイム契約検査 | 第3ブロック直接/途中開始で前方IDが混入しない。通常開始は全12語を維持 |
| F-02 | 中 | `CONFIRMED` | 600msタイマー前の終了・更新でpending保存が送信されない | T2 | `IMPLEMENT` | cloud/mode構文検査＋スタブ検査 | `pagehide` のkeepalive flushが直後パッチを送信し、失敗時だけ再キューする |
| F-03 | 中 | `CONFIRMED` | `units: null` 等の保存データで `unit()` が例外となり起動不能になる | T3 | `IMPLEMENT` | 正規化契約検査 | null/object/arrayの各破損形状で起動・unit・履歴利用が例外なく進む |
| F-04 | 低 | `CONFIRMED` | `learned === 0` のため一覧復帰時に初回ヒーローが再表示される | T4 | `IMPLEMENT` | 条件契約検査 | 同一ページで初回だけ `.hero` が表示され、再描画で再表示されない |

## 今回対応しない指摘と理由

- なし。shiki の4件すべてを実装タスクへ対応付けた。
- 実ブラウザ操作、Supabase実通信、公開版確認は「指摘」ではなく shiki 報告の未確認事項であり、T5のGate Cへ分離した。これらを完了済みの証拠として扱わない。

## リスクとロールバック

- F-01 は `contextOrder` の範囲変更が通常開始・途中再開へ影響する。T1のGate Bで第1・第2・第3ブロックの開始ケースを確認し、失敗時は `createLearnSession` の範囲計算だけを戻す。保存データは変更しない。
- F-02 は終了時の非同期fetchがブラウザ実装とネットワークに依存する。keepalive送信が使えない環境ではエラーをpendingへ戻し、永続キューへの拡張は別計画にする。
- F-03 は malformed progress を空コンテナへ寄せるため、未知のトップレベル項目は保持し、既存の正常データとデータバージョン処理を壊さない。問題があれば `normalizeProgress` の入口を局所的に戻す。
- F-04 はヒーローの表示回数だけを変更し、学習状態・保存状態・アニメーション状態を変更しない。
- 変更を戻す必要がある場合は、実装者が該当コミットを対象ファイルへ限定してrevertする。既存の `AGENTS.md` 変更、ユーザーの未コミット変更、データJSONは対象にしない。

## セルフレビュー

- [x] F-01〜F-04すべてをトレーサビリティ表へ対応付けた。
- [x] 各タスクに種別、対象ファイルと関数、具体的変更、Gate A/B、受入基準、コミット、依存、未達時の扱いを記載した。
- [x] 実装・検証・外部確認を分離し、未確認の実ブラウザ・Supabase・公開版を事実として扱っていない。
- [x] 共有ファイル・保存契約・テスト契約の重複を理由に `SERIAL_ONLY` とした。
- [x] 計画外のデータ、保存キー、URL、RPC、依存、公開操作を含めていない。
- [x] 生成物を直接編集する手順、破壊的なワークツリー操作、既存変更の巻き戻しを含めていない。
- [x] 計画状態を `READY` へ更新した。
