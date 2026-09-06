# 実装計画: グラフィックデザイン監査・UX摩擦監査対応 (2026-09-06)

## 目標

確認済みのモバイルレイアウト3件と主要UX摩擦2件を、既存の学習フロー・保存データ・同期契約を変えずに閉じる。条件付きのCLEAR後導線は実操作で成立条件を確認してから実装し、利用者行動が根拠にない3件は観察ゲートを越えるまで仕様化しない。

## 入力

- 監査レポート: 会話添付の chao「Web UI グラフィックデザイン監査」と hisui「UX摩擦監査」
- 監査種別: `design-layout-audit` / `ux-friction-audit`
- 対象利用者: 高校生
- 依頼範囲: `DESIGN-01`〜`DESIGN-03`、`UX-01`〜`UX-06`の計画化。監査の再実施、実装、コミット、push、デプロイは本計画作成作業に含めない。

## 照合した正本とコード境界

- `AGENTS.md`: Graftを初期探索に使い、実コードで確認する。生成物を手編集せず、既存差分を保持する。
- `README.md`: 通常学習は「覚える → 意味を確かめる → 文中で解く → 誤答復習 → 最終チェック」。進捗と途中位置はlocalStorageへ保存し、生徒別URLだけ既存経路でクラウド同期する。
- `DESIGN.md`: 学習フロー・文言の意味・データ形式・保存キー・URL構造を維持する。モバイルは1列、補助ghostは内容幅、4択の次CTAは640px以下でインライン表示、現在セット行は`aria-current="true"`付きbuttonで無反応とする現行規定がある。
- Graft: `graft check`は同期済み、`graft map`と3件の`graft ask "<query>" --source`で該当経路を確認した。根拠は下記の実コード範囲でも照合済み。
- 開始時の`git status --short`、`git diff --name-status`、`git diff --stat`: すべて出力なし。既存未コミット差分なし。

## 指摘の正規化

| 内部ID | 監査ID | 確度 | 重大度 / 評価 | 根拠と対象 |
|---|---|---|---|---|
| F-01 | DESIGN-01 | 確認済み | 中 | 320/375pxで`.flashCard`本体と`.flashHead`・各sectionに18pxが重なる。`static/styles.css:191,261,328-348`、`static/mode-vocab.js:1072-1099`。 |
| F-02 | DESIGN-02 | 確認済み | 中 | 375pxで`.sessionHead`のclientWidth 340pxに対しscrollWidth 347px。`static/styles.css:255,336-337`、`renderSession()`。原因候補のgrid子最小幅は監査上の推測であり、実装後のDOM実測で成否を判定する。 |
| F-03 | DESIGN-03 | 確認済み | 低〜中 | 320px完了画面で主CTAとghostがともに300px。補助ghostを内容幅にする`DESIGN.md`規則と不一致。`static/styles.css:341`、`renderDone()`。 |
| F-04 | UX-01 | 確認済み | 影響4/5・負荷2/5 | 390x844回答直後、feedback下端839.8px、次CTA上端855.8px。`renderQuiz()`、`answerQuiz()`、`.quizNextAction`。 |
| F-05 | UX-02 | 確認済み | 影響4/5・負荷3/5 | 11誤答時に長い11カードを全展開し、確認後の次項目フォーカス移動なし。`renderWrongReview()`、`.reviewList`。 |
| F-06 | UX-03 | 条件付き | 影響3/5・負荷2/5 | `renderDone()`では次セットCTA、`renderHome()`のCLEAR済み・resumeなし分岐では「このセットをもう一周する」。CLEAR後再訪の実操作は未確認。 |
| F-07 | UX-04 | 確認済み（摩擦の発生条件は要観察） | 影響3/5・負荷3/5 | 50セットをmanifest順で全件表示、検索・要復習フィルタなし。探索時間・誤選択の利用者観察なし。`setPicker()`、`.setList`。 |
| F-08 | UX-05 | 確認済み（変更仕様は未決定） | 影響2/5・負荷1/5 | 現在セットもbuttonで、`onclick`は即return。`DESIGN.md:212-214`がこの構造を明示しており、状態表示への変更は監査だけでは決められない。`setPicker()`、`switchSet()`。 |
| F-09 | UX-06 | 確認済み（利用者影響は要観察） | 影響2/5・負荷1/5 | 誤答復習の見出しは「間違えた語を解き直す」だが、`stepBar()`は「3 解く」。誤認の利用者観察なし。 |

## 対象範囲 / 対象外

- 確定実装: F-01〜F-05。
- 実操作ゲート後に実装可: F-06。
- 利用者観察ゲート後に実装可: F-09。
- 今回は検証・判断記録まで: F-07、F-08。検索・フィルタ追加と現在セットbuttonの非操作要素化は実装しない。
- 対象外: 学習順、採点、80%合格条件、データJSON、manifest順、保存キー、進捗スキーマ、履歴形式、`APP_ID`、Supabase設定・RPC、クラウド同期経路、URL、依存関係、公開、無関係な整形・リファクタリング。

## 実装前の安全境界

1. 各実装タスク開始時に`git status --short`と`git diff --name-status`を確認し、計画外の差分は変更も復元もしない。
2. UI確認は専用の一時ブラウザプロファイルと`http://127.0.0.1:8062/`を使う。通常利用プロファイル、生徒別URL、実データのクラウド同期を使わない。
3. `localStorage`の既存キー名・値構造を変えない。テスト前後で対象originのキー名一覧を比較し、新規キーがないことを確認する。
4. F-06はT4の昇格条件を満たした場合だけT5を行う。F-09はT6の昇格条件を満たした場合だけT7を行う。
5. 各タスクのコミットメッセージは実装時の提案である。この計画書作成ではcommitしない。

## 変更方針

- F-01〜F-03はモバイル共通CSSと完了画面actionsの識別子に束ね、レール・grid最小幅・補助操作幅を一度に整合させる。
- F-04はモバイルを固定CTAへ戻さない。`renderQuiz()`内で「正誤見出し＋語義」の要約直後に次CTAを置き、例文・現代語訳の詳細はその下へ置く。回答後のフォーカス先はfeedbackのままとする。
- F-05は折りたたみを採用せず、未確認カードの先頭1件だけを描画する。確認押下で履歴保存後に次の未確認カードへ進み、未確認数と確認済み数を常時表示する。
- F-06はCLEAR後再訪が監査記載どおり再現した場合だけ、manifest上で現在セットより後ろにある最初の未CLEARセットを主CTAにする。もう一周は副CTAへ下げる。
- F-07〜F-09は利用者の探索・クリック・現在地説明を観察する。監査の評価を利用者事実へ読み替えない。

## 変更ファイルマップ

| ファイル | 新規/変更 | 責務 |
|---|---|---|
| `static/styles.css` | 変更 | モバイルカード内側レール、session見出し幅、完了actions、回答後要約・CTA、1件式誤答確認の配置。正本。 |
| `static/mode-vocab.js` | 変更 | 完了actionsの識別、回答後feedbackのDOM順、1件式誤答確認、条件付きのCLEAR後CTA、条件付きの誤答復習ステップ名。正本。 |
| `index.html` | 変更 | 実装したCSS/JSのキャッシュバスター更新。公開エントリの正本。 |

`data/`、生成物、`README.md`、`DESIGN.md`、既存テストは変更しない。F-08を実装する場合は`DESIGN.md`との仕様衝突があるため、本計画の対象外として別途ユーザー判断を得る。

## タスク

### T1: モバイルのカードレール・見出し幅・完了ghost幅を揃える

- 対応する指摘: F-01（DESIGN-01）、F-02（DESIGN-02）、F-03（DESIGN-03）
- 対象ファイル:
  - `static/styles.css`（`.card, .flashCard, .quiz`、`.flashCard`、`.flashHead`、`.flashCard section`、`.sessionHead`、`.actions > button`、640px以下media query）
  - `static/mode-vocab.js`（`renderDone()`の`.actions`生成箇所）
- 変更内容:
  1. 640px以下の一括padding規則から`.flashCard`を外し、`.flashCard`のcomputed paddingを0pxのまま維持する。`.flashHead`と`.flashCard section`だけ左右`var(--card-padding)`=18pxを持つ。
  2. 640px以下で`.sessionHead > div`へ`min-width: 0`を設定する。固定`br`、`white-space: nowrap`、文字列短縮は追加しない。
  3. `renderDone()`のactionsへ`doneActions`クラスを追加し、640px以下の`.doneActions > .ghost`を`flex: 0 0 auto; width: auto`にする。主CTAは既存の伸長を維持する。
- 検証:
  - `node --check static/mode-vocab.js`
  - 一時ブラウザで暗記カードを320x800・375x800、学習見出しを375x800、通常学習完了を320x800・375x800で表示する。
  - DevToolsでcomputed styleと`getBoundingClientRect()`、`scrollWidth/clientWidth`を記録する。
  - 期待結果: `.flashCard` paddingは0px、`.flashHead`左端はカード左端、`.example`左端はカード左端+18px。375pxの`.sessionHead.scrollWidth === .sessionHead.clientWidth`で340/340px。`documentElement.scrollWidth <= clientWidth`。完了ghostは約114pxの内容幅、主CTAは1行かつ高さ48px以上。
- 受入基準: 5画面幅・状態で期待結果を満たし、320/375pxに横スクロールがなく、デスクトップの`.quizNextAction`と通常の`.actions`幅が変わらない。
- コミット: `fix(ui): align mobile learning rails and completion actions`

### T2: モバイル回答後に要約フィードバックと次CTAを同時表示する

- 対応する指摘: F-04（UX-01）
- 依存: T1
- 対象ファイル:
  - `static/mode-vocab.js`（`renderQuiz()`、`answerQuiz()`）
  - `static/styles.css`（`.feedback`、`.quizNextAction`、640px以下media query）
- 変更内容:
  1. `renderQuiz()`の回答後DOMを、`.feedback`内の`.feedbackSummary`（正誤見出しと「見出し語【漢字】：意味」）、`.quizNextAction`、`.feedbackDetails`（例文・現代語訳）の順にする。
  2. 641px以上では既存どおり`.quizNextAction`を画面下部固定とする。640px以下では`.feedbackSummary`直後のインライン要素とし、幅100%の次CTAを表示する。詳細解説はCTAの後ろに残し、省略・折りたたみをしない。
  3. `answerQuiz()`は`.feedback`へフォーカスし、`scrollIntoView({ block: "nearest" })`する既存挙動を維持する。CTAへの自動フォーカスは行わない。Enterによる`handleQuizKeydown()`も維持する。
- 検証:
  - `node --check static/mode-vocab.js`
  - 390x844と320x800で意味確認と文中問題を各1問回答し、回答直後・追加スクロール前に`.feedbackSummary`と`.quizNextAction`のrectを測る。
  - 1280x720で回答し、`.quizNextAction`が画面下部固定のまま、Enterで次問へ進むことを確認する。
  - 期待結果: モバイルでは要約上端が0以上、次CTA下端が`window.innerHeight`以下で、両方が同時に見える。詳細解説はCTA下に全文残る。デスクトップCTAは固定、コンソールエラー0件。
- 受入基準: 意味確認・文中問題の両方でモバイルの追加スクロールなしに正誤要約を読み次CTAを押せ、詳細解説・キーボード操作・正誤記録が失われない。
- コミット: `fix(ux): keep mobile quiz feedback action in view`

### T3: 誤答確認を1件ずつ進める

- 対応する指摘: F-05（UX-02）
- 依存: T2
- 対象ファイル:
  - `static/mode-vocab.js`（`sessionLabel()`、`renderWrongReview()`、`wordCard()`の既存出力利用）
  - `static/styles.css`（`.reviewList`、`.reviewCard`、新規`.reviewProgress`）
- 変更内容:
  1. `renderWrongReview()`は`session.wrongMeaningIds`から`reviewedIds`にない先頭IDだけを選び、`.reviewCard`を常に最大1件描画する。確認済みカード一覧は描画しない。
  2. カード前に`未確認 N / 全M語・確認済み K語`を`.reviewProgress`で常時表示する。
  3. 確認ボタンは最後以外を`確認した・次の誤答へ →`、最後を通常学習では`確認した・文中問題へ →`、最終チェック/意味だけ復習では`確認した・結果を見る →`とする。
  4. 押下時は現行と同じ`wrong-review`履歴を1件だけ追加し、同じ`saveProgressFor()`経路で保存する。最後以外は再描画して次カードへ、最後は現行の次stageへ遷移する。再描画後は次の`.reviewCard`、最後は遷移先の主要見出しへプログラムフォーカスする。
  5. `wrongMeaningIds`、`reviewedIds`、履歴の`kind/result`、保存関数、stage順は変更しない。
- 検証:
  - `node --check static/mode-vocab.js`
  - 一時ブラウザで意味問題を11件誤答し、誤答確認へ入る。各押下前後に`.reviewCard`件数、表示ID、`.reviewProgress`文言、`document.activeElement`、localStorage内の`wrong-review`履歴件数を記録する。
  - 通常学習、最終チェック、意味だけ復習の3モードで最後の確認後の遷移先を確認する。
  - 期待結果: `.reviewCard`は常に1件。Kが1増えるたびNが1減り、履歴も1件増える。フォーカスは次カードまたは遷移先へ移る。最後は通常学習=`context`、最終チェック/意味だけ復習=`done`。
- 受入基準: 11件誤答でも長いカードは1件しか展開されず、全件を順番に確認でき、重複履歴・確認漏れ・保存キー追加がない。
- コミット: `fix(ux): review wrong meanings one item at a time`

### T4: CLEAR後再訪の条件を実操作で確定する

- 対応する指摘: F-06（UX-03）
- 種別: 検証のみ。恒久ファイルを変更しない。
- 対象ファイル: なし。照合対象は`static/mode-vocab.js`の`renderDone()`、`renderHome()`、`nextSetId()`、`switchSet()`。
- 変更内容: なし。専用の一時ブラウザ内で再現証拠だけを記録する。
- 検証:
  1. 一時ブラウザの匿名URLで、後続に未CLEARセットがあるセットを実際に最終チェック合格へ進める。
  2. CLEAR直後に`第Nセットへ進む →`が主CTAであることを記録する。
  3. `一覧へ戻る`を押した直後と、同じURLを再読み込みした後のホーム主CTA・副CTA・現在セットID・`finalCheck.cleared`を記録する。
  - 期待結果: 直後は次セットCTA、ホーム直後と再読み込み後は「このセットをもう一周する」が主CTA、`finalCheck.cleared === true`、resumeなし。この結果なら監査の条件が成立する。
- 昇格条件: 上記4条件がすべて成立した場合のみT5を実行する。ホームまたは再読み込み後に既に未CLEAR次セットが主CTAならF-06は再現なしとしてT5を省略し、コードを変更しない。
- 受入基準: 操作順、CTA文言、setId、CLEAR値、resume有無が作業記録に残り、T5の実行可否が一意に決まる。
- コミット: なし（検証のみ）

### T5: 条件成立時だけCLEAR後ホームの次セット導線を変更する

- 対応する指摘: F-06（UX-03）
- 依存: T4で昇格条件成立
- 対象ファイル: `static/mode-vocab.js`（`nextSetId()`近傍、`renderHome()`のprimary分岐、`.recommend`生成箇所）
- 変更内容:
  1. manifest順で現在セットより後ろだけを走査し、`KobunSetProgress.summarize(set, progress).key !== "cleared"`となる最初のsetIdを返す`nextUnclearedSetId(currentSetId)`を追加する。現在より前へは折り返さない。
  2. CLEAR済み・resumeなし・復習対象なしのホームで後続未CLEARセットがある場合、主CTAを`第Nセットへ進む →`、実行を`switchSet(nextId)`、説明を`次の未CLEARセットを開きます。`とする。同じ`.recommend`内の副CTAをghostの`このセットをもう一周する`とし、`startLearn()`を呼ぶ。
  3. 後続セットが全てCLEAR、または現在が最終セットなら現行の`このセットをもう一周する`を主CTAのまま維持し、副CTAを追加しない。
  4. CLEAR前、resume、未学習、誤答復習、最終チェック待ちの優先分岐は変更しない。セット切替は既存`switchSet()`だけを使う。
- 検証:
  - `node --check static/mode-vocab.js`
  - `node scripts/check-set-progress.cjs`
  - 一時ブラウザで「現在CLEAR・直後に未CLEARあり」「直後もCLEARでその次が未CLEAR」「後続が全てCLEAR」の3状態を実操作する。
  - 期待結果: 最初の2状態は最初の後続未CLEARセットが主CTAで開き、もう一周はghost。3状態目はもう一周が主CTA。setId以外の保存値、URL、履歴、クラウドmetaは変わらない。
- 受入基準: CLEAR後再訪でも次の学習が主CTAになり、既存の再学習手段が副CTAとして残り、未CLEAR判定は`KobunSetProgress.summarize()`だけを使う。
- コミット: `fix(ux): lead cleared sets to the next unfinished set`

### T6: セット探索・現在セット行・誤答復習ラベルを利用者観察で判定する

- 対応する指摘: F-07（UX-04）、F-08（UX-05）、F-09（UX-06）
- 種別: 検証のみ。恒久ファイルを変更しない。
- 対象ファイル: なし。照合対象は`setPicker()`、`switchSet()`、`stageTitle()`、`stepBar()`、`.setList`、`.setOption`。
- 変更内容: なし。匿名の観察記録から各指摘の昇格可否だけを決める。
- 検証: 対象利用者である高校生3人以上に、一時ブラウザの匿名テストデータで次の3操作を依頼する。答えを誘導せず、完了時間、誤選択、戻り操作、発話、クリック対象を匿名で作業記録へ残す。
  1. F-07: 「第43セットを開く」「要復習のあるセットを開く」。各操作30秒以内に1回で到達できるか。
  2. F-08: セット一覧を開き「現在選択中のセットと別セットへ切り替える」。現在セット行を操作対象としてクリックするか。
  3. F-09: 誤答復習を開始し「いま何の段階か」を説明してもらう。「通常のSTEP 3」と誤認するか。
- 期待結果と昇格条件:
  - F-07: 2人以上が30秒超過、誤選択、一覧を閉じて再探索のいずれかを示した場合、検索と要復習フィルタの要件定義へ昇格する。本計画では実装せず、検索対象（番号・セット名・状態）とフィルタ併用規則をユーザーが決める。
  - F-08: 2人以上が現在セット行をクリックした場合、非操作要素化の仕様判断へ昇格する。`DESIGN.md`のbutton規定、`.setOption`のgrid見た目、`switchSet()`中の一括disabled、キーボードのフォーカス順を同時に変更する必要があるため、ユーザー承認前は実装しない。
  - F-09: 2人以上が通常のSTEP 3と誤認した場合のみT7へ昇格する。
  - 各閾値未満なら現行維持とし、指摘を「観察では昇格せず」と記録する。
- 受入基準: 3指摘それぞれについて観察人数、成否、昇格可否、仕様判断の要否が記録され、F-07/F-08を無断実装していない。
- コミット: なし（検証のみ）

### T7: 観察条件成立時だけ誤答復習のステップ名を専用表示にする

- 対応する指摘: F-09（UX-06）
- 依存: T6でF-09の昇格条件成立
- 対象ファイル: `static/mode-vocab.js`（`stepBar()`の`labels.context`）
- 変更内容: `session.mode === "review"`のcontextラベルだけを`誤答復習 ${session.contextIndex + 1}/${session.contextOrder.length}`にする。通常学習は`3 解く`、finalは`最終チェック`、meaningReviewは既存ラベルを維持する。`stageTitle()`と`sessionLabel()`の保存・遷移ロジックは変更しない。
- 検証:
  - `node --check static/mode-vocab.js`
  - 一時ブラウザで通常学習context、誤答復習context、最終チェックmeaning、意味だけ復習meaningを順に表示する。
  - 期待結果: 誤答復習だけstepBarが`誤答復習 1/N`から進み、見出し「間違えた語を解き直す」と意味が一致する。他3モードの文言と`aria-current="step"`は不変。
- 受入基準: 誤答復習の現在地が専用文言と件数で分かり、通常フローのステップ表示を変えない。
- コミット: `fix(ux): label the wrong-answer review step explicitly`

### T8: 実装済み資産のバージョンを更新して回帰確認する

- 対応する指摘: F-01〜F-06、F-09のうち実装へ昇格したもの
- 依存: T1〜T3完了、T4〜T7の実行/省略判断確定
- 対象ファイル: `index.html`（`static/styles.css?v=0.18.0`、`static/mode-vocab.js?v=0.19.0`）
- 変更内容: CSS実装を含むためstylesを`v=0.18.1`、JS実装を含むためmode-vocabを`v=0.19.1`へ上げる。`set-progress.js`と`meaning-guard.js`は変更しない。
- 検証:
  - `node --check static/mode-vocab.js`
  - `node scripts/check-meaning-example-ui.cjs`
  - `node scripts/check-set-progress.cjs`
  - `node scripts/check-srs.cjs`
  - `node scripts/check-study-plan.cjs`
  - `node scripts/check-vocab-goal-ui.cjs`
  - `node scripts/check-context-choices.mjs`
  - `py -3 -m http.server 8062 --bind 127.0.0.1`
  - 実ブラウザで初回開始、途中再開、通常完了、誤答復習、最終チェック合格、CLEAR後再訪を320x800・375x800・390x844・1280x720で操作する。キーボードの1〜4、Enter、Tab、フォーカス可視性とコンソールを確認する。
  - 期待結果: 全コマンドexit 0。実装対象の受入基準を満たし、途中再開位置、回答、履歴、CLEAR、セット切替が再読み込み後も保持される。新しいlocalStorageキー、クラウド契約変更、横スクロール、コンソールエラーがない。
- 受入基準: 実装へ昇格した全指摘が各タスクの受入基準を満たし、既存学習フローと保存・同期・データ・公開契約が不変である。
- コミット: `chore(ui): refresh audited interface assets`

## トレーサビリティ

| 内部ID | 監査ID | 確度 | 対応 | 受入チェック |
|---|---|---|---|---|
| F-01 | DESIGN-01 | 確認済み | T1 | モバイル`.flashCard`=0px、内側レール18px、横overflowなし。 |
| F-02 | DESIGN-02 | 確認済み | T1 | 375pxで`.sessionHead`=340/340px、文書横overflowなし。 |
| F-03 | DESIGN-03 | 確認済み | T1 | 完了ghostは内容幅、主CTAは48px以上・1行。 |
| F-04 | UX-01 | 確認済み | T2 | 回答直後に正誤要約と次CTAがモバイルviewport内へ同時表示。 |
| F-05 | UX-02 | 確認済み | T3 | 誤答カード最大1件、未確認/確認済み数とフォーカスが連続。 |
| F-06 | UX-03 | 条件付き | T4 → 条件成立時T5 | 実操作で再現を確定後、次の後続未CLEARセットが主CTA。未再現なら変更なし。 |
| F-07 | UX-04 | 確認済み・利用者影響要観察 | T6（検証のみ）／今回実装しない | 3人以上の探索観察と昇格判定を記録。検索/フィルタ仕様は別途ユーザー判断。 |
| F-08 | UX-05 | 確認済み・仕様未決定 | T6（検証のみ）／今回実装しない | 現在行クリックを観察し、DESIGN規定変更を伴う仕様判断として報告。 |
| F-09 | UX-06 | 確認済み・利用者影響要観察 | T6 → 条件成立時T7 | 誤認が3人中2人以上なら専用ステップ名、未満なら現行維持。 |

## 今回対応しない指摘と理由

- F-07（UX-04）: 長い一覧と機能不在は確認済みだが、利用者が番号・名称・要復習状態のどれで探すかは未確認。検索/フィルタ追加は新しい仕様と操作面を増やすため、T6の観察とユーザーによる検索対象・併用規則の決定までは実装しない。manifest順と50件表示は維持する。
- F-08（UX-05）: buttonに見えて無反応なのは確認済み。一方、現行`DESIGN.md`が現在行を`aria-current`付きbutton・非disabled・無反応と明示する。`div`/`span`化はフォーカス順と一括disabled処理も変えるため、T6で実害を確認し、ユーザーが規定変更を承認するまでは実装しない。

## 実装前に必要な判断

1. T4でF-06が再現したか。再現しなければT5は実行しない。
2. T6の観察後、F-07の検索対象を「番号・セット名・状態」のどこまで含めるか、検索と要復習フィルタを併用可能にするか。これは本計画外の次期仕様判断。
3. T6の観察後、F-08で現在セット行を非操作要素へ変え、`DESIGN.md`の現行規定も改訂するか。承認がなければ現状維持。
4. T6でF-09の昇格条件が成立したか。成立しなければT7は実行しない。

## リスクとロールバック

- T2のDOM順変更はlive regionの読み上げ量とデスクトップ固定CTAへ影響しうる。モバイル・デスクトップ・キーボードを同じコミットで確認し、不合格ならT2のコミットだけを戻す。
- T3は表示件数を変えるが保存モデルは変えない。履歴件数またはstage遷移に重複が出た場合はT3のコミットだけを戻し、保存済みデータは削除しない。
- T5はセット選択の既存関数を使う。未CLEAR判定がロード未完了のsetを誤る場合はT5を戻し、T4の記録を保持する。
- ロールバックは該当タスクのコミット単位で行う。`git reset --hard`、進捗削除、データ書換えは行わない。

## 実装完了時のセルフレビュー

- [ ] 監査9件すべてがトレーサビリティ表にある。
- [ ] F-06とF-09は検証ゲートを越えた場合だけ変更されている。
- [ ] F-07とF-08はユーザー判断なしに実装されていない。
- [ ] 各実装タスクの対象ファイル、変更後状態、検証結果、受入基準、提案コミットが一致する。
- [ ] `data/`、`README.md`、`DESIGN.md`、依存関係、保存キー、進捗スキーマ、クラウド同期、URL、公開設定を変更していない。
- [ ] 320/375/390/1280px、4学習状態、キーボード、コンソールを確認した。
- [ ] 実装前後の`git status --short`と対象差分を確認し、計画外の差分を戻していない。
- [ ] commit、push、deployは別途明示依頼がない限り行っていない。
