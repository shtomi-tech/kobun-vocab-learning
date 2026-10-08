# RETENTION_PLAN_2026-09-23 — 定着コンテンツ（思い出して書く復習）

> 状態: T1〜T4 実装済み（2026-09-23、未コミット）。既定値 D1〜D3 のまま実装。
> 範囲: 思い出して書く復習（`recallReview`）だけ。誤訳を直す問題は今回は扱わない（§6）。
> 並列性: **SERIAL_ONLY**。T1→T2→T3→T4 の順に1レーンで進める。
> 原則: 既存の学習フロー・保存キー・`data/set-*.json`・`dataVersion`・クラウドのアプリID/RPC は変えない。新しい記録は既存の progress オブジェクトへフィールドを足すだけにする。

## 0. 目的と根拠

全セットを解いたあとに、次の弱点を補う。

| 弱点（現状の実測） | 対策 | 根拠（Dラボ） |
|---|---|---|
| 出題がすべて4択（意味確認・文中問題・意味だけ復習）。選択肢なしで思い出す場面がない | **思い出して書く復習と確信度**（`recallReview`） | 検索練習。選択式・短答・自由想起のどれでも効果はあるが、本番に近い形は自分で答えを作る形（「検索練習」再入門#4）。生成効果 |

## 1. 現況（実装者向けの前提）

| 対象 | 位置 | 要点 |
|---|---|---|
| 意味だけ復習の対象 | `static/mode-vocab.js` `learnedMeaningEntries` / `dueMeaningEntries`（271〜277行付近） | 全セット横断。キーは `${setId}::${wordId}`。期限判定は `KobunSrs.isDue(progress.items[wordId])` |
| 意味だけ復習の開始 | `startMeaningReview`（945行付近） | 誤答回数の多い順に最大 `MEANING_SESSION_SIZE`（20）語 |
| 解答の記録 | `answerQuiz`（1165行付近） | `KobunSrs.record(item, correct, now, { elapsedMs, medianMs })` → `appendHistory` → `saveProgressFor(setId, progress)` |
| FSRS | `static/srs.js` `record`（161行付近） | 誤答=Again、遅い正解=Hard、速い正解=Good。**Easy は使っていない**。`normalize`（77行付近）は**知らないフィールドを捨てる**ので、項目を足すときは `normalize` にも足す |
| 途中保存 | `saveResume`（226行付近） | `session` を丸ごと `state.progress.resume` へ複製する。`resumeDescription` / `sessionLabel` / `stageTitle` / `stepBar` が `session.mode` で分岐している |
| 誤答確認 | `renderWrongReview`（1262行付近） | `isFinalStage = session.mode === "meaningReview"` で終わり方を分けている |
| ホームの入口 | `meaningMission`（728行付近） | 意味だけ復習のカード。主ボタンは `startMeaningReview` |
| クラウド同期 | `static/cloud.js` `merge3` | 汎用の3方向マージ。progress にフィールドを足しても同期経路は変更不要。**`cloud.js` はこのリポジトリでは編集しない**（正本は portal 側） |
| 検査 | `scripts/check-all.mjs` | CI（`pages.yml`）も同じ一覧を実行する。検査を足したらここに1行足す |
| 配信 | `pages.yml` | `cp static/*.js` なので、`static/` 直下の新規JSは追加設定なしで配信される |

## 2. 仕様（`session.mode = "recallReview"`）

**対象と出題順:** 意味だけ復習と同じ `dueMeaningEntries()`、同じ並べ方、同じ上限20語。FSRS の記録（`progress.items[wordId]`）も共用する。どちらのモードで解いても、次回の期限は同じ値が進む。

**1問の流れ（stage `"recall"`）:**

1. **問う**: 見出し語だけを大きく表示する。漢字表記（`kanji`）・例文・訳は隠す。漢字は意味の手掛かりになりすぎるため（例: かち【徒歩】）。
   - 任意の入力欄「意味を書いてみる（書かずに思い浮かべるだけでもよい）」。採点はしない。
   - 補助ボタン「例文をヒントに見る」: 例文を傍線付きで出す（訳は出さない）。押した問題は `hintUsed = true`。
2. **確信度を選ぶ**（答えを見る前）: `言える（自信あり）` / `たぶん` / `思い出せない`。
   - `思い出せない` を選んだら、自己採点を飛ばして答えを表示し、Again で記録する。
3. **答えを見る**: 見出し語【漢字】・全意味・解説・例文・訳を表示する。入力した文字があれば「あなたの答え」として正解の横に並べる。
4. **自己採点**: `合っていた` / `一部だけ` / `違った`。押した時点で記録し、「次の問題 →」を出す。

**FSRS へ渡す評価（`static/recall-grade.js` の `gradeRecall`）:**

| 確信度 | 自己採点 | ヒント | rating | 誤答確認へ回す | 自信ありの取り違え |
|---|---|---|---|---|---|
| 思い出せない | （なし） | 問わない | Again | 回す | — |
| 問わない | 違った | 問わない | Again | 回す | 確信度が「自信あり」なら数える |
| 問わない | 一部だけ | 問わない | Hard | 回さない | — |
| たぶん | 合っていた | 問わない | Hard | 回さない | — |
| 自信あり | 合っていた | 使った | Hard | 回さない | — |
| 自信あり | 合っていた | 使っていない | Good | 回さない | — |

- Easy は使わない（`srs.js` の現方針を維持。§5 D1）。
- 解答時間は計測して表示するが、rating の判定には使わない（自己申告を優先する）。
- **自信ありで違った語**は、フィードバックに「自信があったのに違った語です」と表示し、解説（`notes`）を折りたたまずに出す。完了画面にもその語の一覧を出す。自信を持って間違えた答えは、訂正すると記憶に残りやすいため。

**記録:**
- `progress.items[wordId]` に `recallCount`（整数）、`confidentMissCount`（整数）を追加する。`srs.js` の `normalize` にも足す（足さないと次の記録で消える）。
- `appendHistory({ kind: "recall", wordId, result: "good"|"hard"|"again", confidence, hintUsed }, progress)`。
- 保存は既存と同じく `saveProgressFor(setId, progress)`。

**その後の段階:** `"recall"` → （Again があれば）`"wrongReview"` → `"done"`。誤答確認は既存の `renderWrongReview` をそのまま使う。

**入口:** `meaningMission` カードに、補助ボタン `選択肢なしで思い出す（最大20語）` を足す。主ボタン（4択）は変えない。期限の語が0なら無効化する。

**キーボード:** 問う段階は `Enter` で確信度へ進む（入力欄にフォーカスがあるときも `Enter` で進む）。確信度は `1`〜`3`、自己採点は `1`〜`3`、答えたあとは `Enter` で次へ。既存の `handleQuizKeydown` は stage が `meaning`/`context` のときだけ働くので、`recall` 用の分岐を足す。

## 3. タスク

| ID | 種別 | 内容 | depends_on |
|---|---|---|---|
| T1 | IMPLEMENT | `srs.js` に評価指定の記録APIを追加 | — |
| T2 | IMPLEMENT | `recall-grade.js`（評価の純粋ロジック） | T1 |
| T3 | IMPLEMENT | `recallReview` の画面・セッション・入口 | T1, T2 |
| T4 | VERIFY_ONLY | ブラウザ確認と README 更新 | T3 |

---

### T1. `srs.js` に評価指定の記録APIを追加

- **write_set:** `static/srs.js`、`scripts/check-srs.cjs`、`index.html`（`srs.js?v=` を上げる）
- **変更:**
  - `recordRating(value, rating, now = new Date(), options = {})` を追加する。`rating` は `"again" | "hard" | "good"`。FSRS 経路は `record` と同じ処理を、rating を外から受けて行う。FSRS 未読込時のフォールバックは、again を誤答、hard を遅い正解、good を速い正解として `record` の旧はしごと同じ扱いにする。`options.elapsedMs` があれば `lastMs`/`avgMs` を正解時と同じ規則で更新する（again のときは更新しない）。
  - 内部の共通部分は関数に切り出してよいが、**`record` の入出力は変えない**。
  - `normalize` に `recallCount`（既定0）、`confidentMissCount`（既定0）を追加する。
  - `recordRating` の `options.recall === true` のとき `recallCount++`、`options.confidentMiss === true` のとき `confidentMissCount++`。
  - 戻り値のオブジェクトに `recordRating` を足す。
- **検証:** `check-srs.cjs` に次を足す。
  - good/hard/again それぞれで `nextReviewAt` が `record` の同じ評価と一致する（同じ `now`・同じ初期状態。fuzz の影響を受けない比較方法は既存テストに合わせる）。
  - `recallCount`/`confidentMissCount` が `normalize` を通しても残る。
  - 既存の `record` のテストがすべて通る。
- **受入基準:** `node scripts/check-all.mjs` が通る。
- **コミット:** `Add rating-based record API to SRS for recall review`

### T2. `recall-grade.js`（評価の純粋ロジック）

- **write_set:** `static/recall-grade.js`（新規）、`scripts/check-recall-grade.cjs`（新規）、`scripts/check-all.mjs`（構文検査と検査一覧に1行ずつ）、`index.html`（`mode-vocab.js` より前に読み込む）
- **変更:** 既存の `choice-builder.js` と同じ形（IIFE、`window` グローバル `KobunRecallGrade`、`module.exports` 対応）。
  - `gradeRecall({ confidence, selfGrade, hintUsed })` → `{ rating, toWrongReview, confidentMiss }`。対応は §2 の表のとおり。
  - `confidence`: `"sure" | "maybe" | "blank"`、`selfGrade`: `"correct" | "partial" | "wrong" | null`。
  - 想定外の値は例外にせず Again として扱う（学習を止めない）。
- **検証:** `check-recall-grade.cjs` で表の全行と想定外の値を検査する。
- **受入基準:** `check-all` が通る。
- **コミット:** `Add recall grading logic`

### T3. `recallReview` の画面・セッション・入口

- **write_set:** `static/mode-vocab.js`、`static/styles.css`、`index.html`（`mode-vocab.js?v=`、`styles.css?v=` を上げる）、`scripts/check-vocab-runtime.cjs`
- **変更（`mode-vocab.js`）:**
  1. `startRecallReview()`: `startMeaningReview` と同じ抽出・並べ方で `session = { mode: "recallReview", stage: "recall", meaningOrder, meaningIndex: 0, meaningCorrect: 0, wrongMeaningIds: [], reviewedIds: [], phase: "ask", confidence: null, hintUsed: false, typed: "", confidentMissIds: [] }`。
     - `meaningOrder` / `meaningIndex` / `wrongMeaningIds` の名前を流用するのは、`renderWrongReview` と `wordForSession` をそのまま使うため。
  2. `renderRecall(panel)`: §2 の 1〜4 を `session.phase`（`"ask"` → `"revealed"` → `"graded"`）で描き分ける。答えの表示部分は `wordCard(word)` を再利用してよい。入力欄の値は `input` イベントで `session.typed` に保存し、再描画しても消えないようにする。
  3. `answerRecall(selfGrade)`: `KobunRecallGrade.gradeRecall` → `KobunSrs.recordRating(item, rating, new Date(), { elapsedMs, recall: true, confidentMiss })` → `appendHistory` → `saveProgressFor`。Again は `wrongMeaningIds` へ、自信ありの取り違えは `confidentMissIds` へ入れる。`思い出せない` のときは確信度の選択と同時にこの関数を `selfGrade = null` で呼ぶ。
  4. `nextRecall()`: 次の問題へ進むときは `phase` などを初期化する。最後の問題の後は、`wrongMeaningIds` があれば `"wrongReview"`、なければ `"done"`。
  5. 分岐の追加: `renderSession`（stage `"recall"`）、`sessionLabel`、`stageTitle`、`stepBar`（`["recall", "wrongReview"]`、ラベル「思い出す」「必要なら復習」）、`resumeDescription`（「思い出して復習」）、`renderWrongReview` の `isFinalStage` を `session.mode === "meaningReview" || session.mode === "recallReview"` に、`renderDone` の見出しと、`confidentMissIds` の一覧表示。
  6. `handleQuizKeydown`: stage `"recall"` のとき §2 のキーを扱う。入力欄にフォーカスがあるときは `Enter` だけを拾い、数字キーは入力に任せる。
  7. `meaningMission`: 補助ボタンを追加する。期限の語が0のときと、通常学習の途中保存があるときは既存の主ボタンと同じ規則で扱う（途中保存があれば両方とも補助扱いの見た目にする）。
- **変更（`styles.css`）:** 見出し語だけの問う画面、確信度・自己採点のボタン群（主要操作は高さ44px以上）、「あなたの答え」と正解の並び、自信ありの取り違えの強調。色は `DESIGN.md` の役割トークンに従う（取り違えの強調は `--color-accent`。`--color-danger` は不正解の表示だけに使う）。
- **検証（`check-vocab-runtime.cjs`）:** 既存の擬似DOMで次を確認する。
  - 期限の語があるとき、補助ボタンから `recallReview` が始まり、1問目で漢字表記が表示されていない。
  - 「自信あり→合っていた」で `items[wordId].fsrs` と `nextReviewAt` が更新され、`recallCount` が1になる。
  - 「思い出せない」で Again として記録され、誤答確認へ回る。
  - 途中で「一覧へ戻る」→再開したとき、同じ問題の同じ段階から再開できる。
- **受入基準:** `check-all` が通る。既存の意味だけ復習（4択）の検査が変更なしで通る。
- **コミット:** `Add recall review mode with confidence and self-grading`

### T4. ブラウザ確認と README 更新（VERIFY_ONLY ＋ 文書）

- **write_set:** `README.md`（「補助学習」の節に追記）
- `.claude/launch.json` の開発サーバー（無ければ README の `py -3 -m http.server 8062`）で開く。
- 確認項目（最小限）: 補助ボタンから1周（自信あり→合っていた／たぶん→一部だけ／思い出せない／自信あり→違った の4通り）、誤答確認、完了画面の取り違え一覧、途中再開1回、キーボードだけでの1問、375px幅での表示、コンソールエラーが無いこと。
- **受入基準:** 上記で不具合が無い。README の記述が実装と一致する。見つかった問題は T3 へ戻す。
- **コミット:** `Document recall review mode`

## 4. 提案とタスクの対応

| 提案の要素 | タスク |
|---|---|
| 選択肢なしで思い出す | T3 |
| 確信度を先に選ぶ | T2, T3 |
| 自己採点を FSRS の評価として渡す | T1, T2, T3 |
| 自信ありの取り違えを強調する | T2, T3 |
| ヒント（例文）を使ったら伸びを抑える | T2, T3 |
| 既存の保存・同期・データ契約を壊さない | T1（normalize）、T3（既存の意味だけ復習の検査を変えない） |
| 検証 | T4、各タスクの検査スクリプト |

## 5. 既定値を置いた判断（変える場合は実装前に指示）

| ID | 判断 | 既定値 | 理由 |
|---|---|---|---|
| D1 | Easy を使うか | 使わない | 自己申告は甘くなりやすい。上限180日の現方針と合わせる |
| D2 | 問う画面で漢字表記を隠すか | 隠す | 漢字が意味をほぼ示す語がある |
| D3 | 出題対象と FSRS の記録を意味だけ復習と共用するか | 共用する | 測っているのは同じ「語の意味」。別管理にすると同じ語が二重に出る |

## 6. 範囲外

- 誤訳を見つけて直す問題（提案2）。今回は見送り。再開するときは別計画にする。
- 入力した答えの自動採点（意味の文字列が長く、表記揺れが大きいため）。
- 例文の差し替え、`data/set-*.json` の変更。
- 似た語の識別ドリル・初めて見る文の問題（提案3・4）。
- デプロイ（別の明示依頼として扱う）。
