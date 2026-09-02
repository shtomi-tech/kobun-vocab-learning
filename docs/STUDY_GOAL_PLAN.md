# 学習目標カードの実装計画

> 対象: `static/mode-vocab.js` / `static/styles.css` / `scripts/check-study-plan.cjs`（新規） / `scripts/check-vocab-goal-ui.cjs` / `DESIGN.md` / `README.md`
> 状態: 実装
> 作成日: 2026-09-02
> 参考: `eiken-q1-practice` の `docs/DAILY_WEEKLY_STUDY_GOAL_PLAN.md` と現行実装（`static/src/10-config.js` / `static/src/80-home.js`）

## 0. 目的

`eiken-q1-practice` のホーム語彙目標カードにある「学習目標」上段と「このペースで学べる語句」到達予想を、古文単語アプリへ移植する。1日の単語目標に対する「今日の進捗」と、そのペースで 600 語へ到達する予想日・期間別の理論語数を、既存の語彙目標カード内へ統合する。

## 1. 確定した仕様

### 1.1 対象範囲と「1語」の定義

- 全 22 セット横断の 1 語（`word.id`）を単位にする。級・セットの区別はしない。
- 文中問題（STEP 3）へ初めて回答した時点で「新規に 1 語学んだ」と数える。正誤は問わない。
- 同じ語の解き直し・意味だけ復習・最終チェックは、日次・到達語数へ重複加算しない。
- 到達語数（語彙目標バーの分子）は従来どおり `learnedMeaningEntries().length`（全セットで `units[id].learned` の語）を `VOCAB_GOAL_TOTAL`(600) でクランプした値。

### 1.2 設定値

| 設定 | 初期値 | 制約 |
| --- | ---: | --- |
| 1日の単語目標 `dailyWordGoal` | 12 | 1〜60 の整数（固定上限。収録語数に連動させない） |

- 週次・総目標・週開始曜日は持たない（`eiken` は保持するが表示しない死重。新規アプリなので採用しない）。
- 保存形式は `{ version: 1, dailyWordGoal }` のみ。

### 1.3 語彙換算と期間

- 1 語 = 語彙 1。`1日の学習語数 = dailyWordGoal`。
- 期間予測は固定日数 `[7, 30, 90, 180, 365]`。カレンダー月差では計算しない。
- 上記は教材収録数で打ち止めにしない「理論上の学習量」。予測 details には注記文を置かず、何を数えるかはバーの `aria-valuetext` が担う（直近コミット 2c2cd6f「収録語数注記を削除」の判断を維持）。

### 1.4 600 語への到達予想

```text
dailyVocabulary   = dailyWordGoal
currentVocabulary = min(600, 到達語数)
remaining         = max(0, 600 - currentVocabulary)
daysToGoal        = remaining > 0 ? ceil(remaining / dailyVocabulary) : 0
estimatedDate     = 今日（ローカル日付） + daysToGoal
```

- 起点は 0（`eiken` の「前級 9,000 語習得済み」に相当する概念は無い）。
- 到達済み（remaining = 0）は「600語の目安に到達しています。」と表示する。

## 2. 保存形式

### 2.1 初回答時刻

各セットの `progress.units[wordId]` に、文中問題の初回答時だけ不変の時刻を追加する。

```js
{ learned: true, solvedCorrect: false, needsReview: true,
  firstAnsweredAt: "2026-09-02T01:30:00.000Z",
  lastAnsweredAt:  "2026-09-02T01:30:00.000Z" }
```

- `answerQuiz()` の context 分岐で、`firstAnsweredAt` が有効な ISO 日時でないときだけ設定する。
- `lastAnsweredAt` は従来どおり毎回答で更新する。
- 日付境界は ISO 文字列を UTC で切らず、`Date` に戻してローカル時刻で比較する。

### 2.2 学習目標

- 匿名: `localStorage` の `kobun_vocab_study_plan_v1`（`?s=` 付きは生徒スコープを接尾）。
- 生徒別: 既存の per-set クラウドパッチの `meta` へ `studyPlanV1` を同梱する。`applyCloudProgress` は `value._meta.studyPlanV1` を検証して反映する。
- 読み込み優先度: 認証済み共有かつクラウド値あり → クラウド値、なければローカル値、最後に既定値。
- `APP_ID`・既存の保存キー・RPC 名は変更しない。全クラウド保存経路が `{ lastDatasetId, studyPlanV1 }` を毎回同梱するため、サーバ側 `_meta` マージの有無に依存しない。

## 3. 既存進捗の移行

`firstAnsweredAt` を持たない既存データを、今日の実績へ一括計上しない。

1. 起動時、`loadReviewPool()` 後に全セットの `progress` を走査する。
2. `progress.history` の `kind === "question"` を `wordId` ごとにまとめ、最古の `at` を `units[wordId].firstAnsweredAt` へ補完する。
3. 履歴にも日時が無い旧回答は、到達語数には従来どおり入るが、日次実績には入らない。推測日時は作らない。
4. `progress.migrations.studyPlanFirstAnsweredAtV1 = 1` でガードし、冪等にする。補完が発生したセットだけ保存する。

## 4. UI

### 4.1 学習目標パネル（`studyPlanPanel()`）

- `vocabGoalCard()` の返す `<section>` の**先頭の子**として描画する。`renderHome` とホーム層構造（層 C）は変えない。
- 見出し: label「学習目標」／ h3「新規に学んだ語の進捗」。
- 常時表示は「今日 n / m語」進捗バー 1 本＋状態（`あと◯語` ｜ `✓ 今日の目標達成`）。`role="progressbar"` と `aria-valuemin/max/now` ＋残数を含む `aria-valuetext`。
- 「学習目標を設定」（副ボタン）で設定フォームを開閉する。新しい画面・ルートは足さない。

### 4.2 設定フォーム

- 〈1日の単語目標〉number input（1〜60、`inputmode="numeric"`）1 項目のみ。
- 「保存」「キャンセル」。ラベル・hint・入力エラーを明示し、色だけで状態を示さない。
- 保存: `normalizeStudyPlan` → `saveStudyPlan()` → クラウド `queueSave`（`cloudMeta()`）→ `renderHome()`。
- キャンセル/再トグルで未保存値とエラーを保存済み値へ戻し、フォーカスを設定トグルへ戻す。

### 4.3 到達予想（`vocabForecastDetails()`）

- `vocabGoalCard()` の `.vgMessage` の後へ `<details class="vocabForecast">`（既定は折りたたみ）を追加する。
- summary: 「このペースで学べる語」＋リード「このペースなら600語まであと◯語」。
- 日付行: 「1日◯語で、◯年◯月◯日ごろ（あと◯日）」。到達済みは「600語の目安に到達しています。」
- グリッド: 1週間後 / 1か月後 / 3か月後 / 半年後 / 1年後 に `+◯語`。桁区切りは `toLocaleString("ja-JP")`。
- 注記文は置かない。

## 5. 変更対象

| ファイル | 変更内容 |
| --- | --- |
| `static/mode-vocab.js` | 定数、`studyPlan` の正規化・保存・読み込み、`firstAnsweredAt` 記録と履歴移行、集計（`studyPlanSummary` / `vocabularyForecast` / `vocabularyGoalForecast`）、`cloudMeta()`、`applyCloudProgress` 拡張、`studyPlanPanel()` / `vocabForecastDetails()` の追加と `vocabGoalCard()` への組み込み、`mount()` の移行・読み込み呼び出し |
| `static/styles.css` | 学習目標パネル、設定フォーム、進捗バー、到達予想 details とグリッド、640px 対応、input の font 継承と focus-visible |
| `scripts/check-study-plan.cjs`（新規） | `normalizeStudyPlan` の範囲・既定値、日境界（ローカル日付）、`vocabularyForecast` の 5 期間、600 到達日、`migrateFirstAnsweredAt` の冪等性 |
| `scripts/check-vocab-goal-ui.cjs` | 学習目標パネルがカード先頭にあること、「今日 n / m語」と状態文言、`role="progressbar"`＋`aria-valuetext`、到達予想 details の見出し・リード・日付行・5 行グリッド、注記文を置かないこと、`STUDY_PLAN_KEY` と `cloudMeta` の存在 |
| `DESIGN.md` | ホーム層構造表（層 C に学習目標上段が乗る）、「### 語彙目標カード」節へ学習目標パネルと到達予想の役割を追記、収録語数注記に関する記述を現状（数値は出さない／数え方は `aria-valuetext`）へ改訂 |
| `README.md` | 「## 学習目標と到達予想」節を新設 |

`static/cloud.js` は変更しない。既存の `meta` パッチで実現する。

## 6. 検証

```powershell
node scripts/check-study-plan.cjs
node scripts/check-vocab-goal-ui.cjs
node scripts/check-set-progress.cjs
node scripts/check-srs.cjs
py -3 -m http.server 8062 --bind 127.0.0.1
```

実ブラウザ（`http://127.0.0.1:8062/`）で確認する。

1. ホームの語彙目標カード先頭に「学習目標 / 新規に学んだ語の進捗 / 今日 n / m語」が出る
2. 文中問題へ初回答すると「今日」が 1 増える。同じ語を再回答しても増えない
3. 「学習目標を設定」で 1 日の目標を変更 → 保存で「今日 n / m語」と到達予想が即再計算される
4. キャンセルで未保存値が残らず、フォーカスが設定トグルへ戻る
5. リロード後も設定と `firstAnsweredAt` が残る
6. 到達予想 details を開閉できる。5 期間と日付が桁区切りで出る
7. 320 / 375 / 720 / 1280px で横あふれ・重なりが無い
8. キーボードだけで開閉・入力・保存・キャンセルできる
9. コンソールエラーが無い（ローカルの `static/config.json` は既存仕様）

## 7. 対象外

- 週次・総目標・週開始曜日・未達分の翌週繰越・調整目安
- 実績ペースの移動平均や予測曲線
- 通知・リマインダー・カレンダー連携
- 新しいセット・語データの追加
- Supabase スキーマ・RPC の変更
- コミット・push・デプロイ
