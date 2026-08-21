# DESIGN_ALIGNMENT_PLAN — 古文アプリのデザイン・文言を英検アプリへ揃える

> 対象: `kobun-vocab-learning`（変更する側）を `eiken-q1-practice`（基準）へ寄せる。
> 前提: ホーム画面の要素順の統一は完了済み（`eiken-q1-practice/docs/HOME_LAYOUT_UNIFICATION_PLAN.md`）。
> 状態: 計画（未着手）。作成 2026-08-21 ／ 決定事項を反映して更新 2026-08-21。

## 0. 決定事項

| 論点 | 決定 |
|---|---|
| h1 の扱い | **eiken に揃える**（Ink地の小バッジ 21px）。kobun の大きな明朝見出し（最大52px）はブランド資産の規定ごと改訂する |
| Google Fonts の追加 | **追加する**（Cormorant Garamond / Inter / JetBrains Mono の3書体） |
| 適用範囲 | **学習中の画面まで広げる**（暗記カード・意味確認・文中問題・誤答確認・最終チェック・完了画面） |

## 1. 現状の差分（調査結果）

### ホーム・共通

| 領域 | eiken-q1-practice | kobun-vocab-learning |
|---|---|---|
| 書体 | Google Fonts。`--serif` Cormorant Garamond / `--sans` Inter / `--mono` JetBrains Mono | ローカルのみ。Georgia+Yu Mincho / Segoe UI。monoトークンなし |
| h1 | Ink地・Parchment文字の小バッジ（21px・角丸md・padding 6/14） | 素の大見出し `clamp(32px, 6vw, 52px)` |
| h2 | serif 24px 固定 | serif `clamp(25px, 4vw, 34px)` |
| ラベル | mono・11px・uppercase・`letter-spacing: .16em` | Segoe UI・12px・700・非uppercase |
| hint | 13px | 14px |
| カード | padding 20px / margin-bottom 16px | padding 24px / margin-bottom 24px |
| 主導線 | `border-top`罫＋`.recEyebrow`（mono・Clay Hover）＋`.recWhy` | 左4px Clay罫の箱＋`.label`＋`.hint` |
| ヘッダー | `.brand` > `.backlink`（mono・uppercase）＋h1＋shareStatus | h1＋shareStatus のみ |
| 罫線 | `--line: #e6dfd8` 一本 | `--color-border: #ddd5c8` ＋ `--color-control-border: #8a8478` の2段 |
| 正解色 | `--ok: #16803a` / `--ok-text: #126b30` | `--color-success: #136b31`（1段のみ） |
| 部分一致色 | `--warn: #a16207` | なし |
| 角丸 | sm 6 / md 8 / lg 12 / pill | 8 / 12 / 999（sm なし） |
| `--ease-spring-soft` | `.34, 1.56, .64, 1` | `.34, 1.2, .64, 1` |
| 途中保存の告知 | `.resumeNotice`（「途中保存」＋保存先の説明） | なし（主CTAの文言のみ） |
| 進捗リセット | `confirm()`／文言「進捗リセット」 | ボタン2度押し／文言「このセットの進捗をリセット」 |

### 学習中の画面

| 部品 | eiken | kobun |
|---|---|---|
| 暗記カード | `.flash`（Parchment地・`overflow: hidden`）＋ `.flashHead`（**Ink地の反転バンド**） | `.flashCard`（`.card` と同じ面。反転バンドなし） |
| 選択肢 | `.choiceBtn`（Paper地・hairline枠・min-height 52px）。正誤は**2px枠＋アニメーション** | `.choice`（Canvas地・`--color-control-border`枠・min-height 48px）。正誤は1px枠＋`box-shadow`＋`color-mix` の面着色＋`○`/`×` |
| 番号バッジ | `.key`（24×24px 円形・`currentColor` 枠・mono 12px） | `.choiceNo` 26px／`.wordNo` 28px（円形・`--line` 枠・sans） |
| フィードバック | `.feedback`（Paper地・左4px罫・角丸md・padding 12/14・serif h3 18px） | `.feedback`（Canvas地・左4px罫・角丸8px・padding 16・sans h3 20px） |
| 完了画面 | `.doneBanner` / `.completionCard`（**Ink地の反転**・角丸lg・スコアは serif 40px／mono） | `.doneBanner`（Card地・上4px罫の**反転なし**・スコアは Georgia 48px） |
| ステップ表示 | 進捗バー・カウンタ（mono） | `.stepBar` / `.step`（sans・`✓` 併記） |

**構造が既に一致しているもの**（作業不要）: ホームの層構造A〜G、`.card` / `.label` / `.hint` / `.cta` / `.ghost` / `.secondaryCta` / `.hero` / `.feedback` / `.doneBanner` / `.vgHedgehog` の命名、`shareStatus` の `shareStatusIcon` ＋テキストの2要素構成、`--motion-*` の役割トークン、44px以上のタップターゲット。

## 2. 方針

- **変更する側は kobun のみ。** eiken には手を入れない。
- **学習内容そのものの可読性は落とさない。** 古文例文・見出し語・現代語訳（`.example` `.cloze` `.headword` `.askWord`）は、書体を `--serif` トークン経由に置き換えるだけで、サイズ・行間（`.example` は20px／行間2）は現状維持する。日本語グリフは Cormorant にないため実際の字面は変わらない。
- **アクセシビリティが衝突したら kobun 側を残す。** 対象は `--color-control-border`、`.skipLink`、`.skeleton`、選択肢の `○`/`×` 記号、リセットの2段階確認。
- 各フェーズは独立して中断・確定できる粒度にする。

## 3. フェーズ1: トークン層

1. `static/styles.css` の `:root` を更新する。
   - `--color-border` を `#ddd5c8` → `#e6dfd8`。
   - `--color-success` を `#136b31` → `#16803a`、`--color-success-text: #126b30` を追加。
   - `--color-warn: #a16207` を追加（定義のみ。使用箇所は作らない）。
   - `--radius-small: 6px` を追加。
   - `--ease-spring-soft` を `cubic-bezier(.34, 1.56, .64, 1)` へ。
2. `--color-success` の値変更は `.feedback.ok h3` など**文字色**にも効く。Card地(`#efe9de`)上で4.5:1を割る箇所には `--color-success-text` を使う。置換対象を洗い出してから変更する。
3. `--color-control-border` は変更しない（方針2）。
4. 検証: `node --check static/mode-vocab.js` ＋ `scripts/check-*` 一式。

## 4. フェーズ2: タイポグラフィ（全画面）

5. `index.html` に eiken と同じ Google Fonts 3書体を追加する（`preconnect` 2行＋`display=swap`）。
6. `:root` に `--sans` / `--serif` / `--mono` を eiken と同一定義で追加する。
7. 直書きの `font-family` をトークン参照へ置き換える。対象は `body`・`h1`・`h2`・`.headword`・`.askWord`・`.score`・`.example`・`.cloze`。`.example` / `.cloze` は `"Yu Mincho", serif` を `--serif`（末尾に Yu Mincho を含む）へ置き換えるだけで、見え方は変えない。
8. 各要素を eiken の値へ寄せる。
   - `h1`: Ink地・Parchment文字・21px・`--radius-control`・padding 6px 14px のバッジ。
   - `h2`: serif 24px 固定（clamp を廃止）。
   - `.label`: mono・11px・uppercase・`letter-spacing: .16em`・`margin: 0 0 6px`。
   - `.hint`: 14px → 13px。
   - `.shareStatus`: mono・11px・`letter-spacing: .04em`。
   - `.score`: Georgia 48px → `--serif` 40px（eiken `.doneBanner .big` に合わせる）。
   - `.step` / `.stat` / `.intervalCell` / `.wordNo` / `.choiceNo` / `.setUnitNumber` の数値を mono に。
9. `text-transform: uppercase` は日本語ラベルには視覚的に無効で、効くのはラテン文字・数字のみ。kobun DESIGN.md の「日本語ラベルには過度な `letter-spacing` を付けない」と衝突するため規定を改訂する（フェーズ6）。
10. オフライン・フォント取得失敗時にレイアウトが崩れないことを確認する。
11. 検証: 既存チェック一式＋ブラウザ（ホーム／暗記カード／文中問題／完了画面の4画面）。

## 5. フェーズ3: ヘッダーと主導線

12. `index.html` のヘッダーを eiken と同じ `.brand` 構造にし、`.backlink` を追加する。文言は「Kobun ・ Classical Japanese Vocabulary」。リンク先を持たないため `<span>` のまま。
13. `.recommend` を eiken 方式へ差し替える。左4px Clay罫＋Canvas地の箱をやめ、`border-top: 1px solid var(--line)` ＋ `.recEyebrow`（mono・`--clay-dark`・uppercase）＋ `.recWhy`（13px・muted）にする。
14. `mode-vocab.js` の `renderHome()` で、`.label`「まずはここから」を `.recEyebrow`「▶ まずはここから」へ、CTA下の `.hint` を `.recWhy` へ差し替える。
15. `--card-padding` を 24px → 20px、`.card` の `margin-bottom` を 24px → 16px。
16. 検証: 既存チェック一式＋ブラウザ1回。

## 6. フェーズ4: 学習中の画面

17. **暗記カード**: `.flashCard` に eiken の `.flashHead` 相当（Ink地・Parchment文字の反転バンド）を導入する。見出し語と進捗カウンタをバンド内へ移し、カード本体は Parchment 地・`overflow: hidden`・角丸lg にする。`mode-vocab.js` の `renderFlash()` のDOM構造変更を伴う。
18. **選択肢**: `.choice` を `.choiceBtn` 相当へ寄せる。Paper地・min-height 52px・正誤は2px枠。
    - `○`/`×` の `::after` 記号は**残す**（色だけに頼らない要件。両アプリのDESIGN.mdが要求）。
    - `color-mix` による面の着色は廃止し、枠2px＋記号に一本化する（eiken と同じ中立表現）。
    - 正誤アニメーションを eiken の `kAnswerSuccess` / `kAnswerError` と同じキーフレームに揃える。
19. **番号バッジ**: `.choiceNo`（26px）・`.wordNo`（28px）を `.key` と同じ24×24px・`currentColor` 枠・mono 12px へ統一する。
20. **フィードバック**: `.feedback` を Paper地・padding 12px 14px・h3 は serif 18px（`--color-success-text` を使用）へ。左4px罫の構造は既に一致。
21. **完了画面**: `.doneBanner` を eiken と同じ **Ink地の反転**・角丸lg・padding 20px・中央寄せへ変更する。スコアは `--serif` 40px。初回CLEARの `✓` 前置きも eiken に合わせる。
    - これは kobun DESIGN.md「セッション完了はライトテーマ内の強調面（反転なし）」および Pre-Flight「完了画面だけ反転しない」と**正面から衝突する**。決定事項3に従い規定側を改訂する（フェーズ6）。
22. **ステップ表示**: `.step` のラベルを mono へ。`✓` 併記と `.active` の反転は現状維持。
23. 検証: 既存チェック一式＋ブラウザで学習1周（暗記→意味確認→文中問題→誤答確認→完了）。

## 7. フェーズ5: 文言

24. ホームの `.label`「今回の学習」→「今日の学習」（CLEAR時の「達成状況」は既に一致）。
25. 「このセットの進捗をリセット」→「進捗リセット」。
26. 途中保存中は eiken と同じ `.resumeNotice` を主カードへ追加する（「途中保存」＋再開位置＋「この端末に保存されています。続きから再開できます。」）。再開位置を文章化する `resumeDescription()` 相当を新規に書く（セット名・ブロック番号・ステップ名から組み立てる）。
27. **確認方式は統一しない。** リセットは kobun の2段階ボタンを残す（`confirm()` より優れているため）。文言だけ揃える。理由を DESIGN.md に明記する。
28. 学習中の共通文言（「一覧へ戻る」「一覧へ」等）は既に一致。データ名に由来する差（「単語一覧」／「問題一覧」）は揃えない。

## 8. フェーズ6: DESIGN.md 改訂と公開

29. kobun `DESIGN.md` の次の規定を実装に合わせて改訂する。
    - 「タイポグラフィ尺度」表（page title 52px／section title clamp／label 12px 非uppercase／display 48px）→ eiken の値へ。
    - 「日本語ラベルには過度な `letter-spacing` を付けない」→ mono ラベルの `.16em` を許可。
    - Pre-Flight「新しい依存関係、GSAP、Motion、アイコンライブラリを追加していない」→ Google Fonts 3書体のみ例外として許可。
    - Pre-Flight「ライトテーマを全画面で維持し、完了画面だけ反転しない」→ hero と完了画面の反転を許可する文へ改訂。
    - 状態マトリクスの「セッション完了＝ライトテーマ内の強調面（反転なし）」→ 反転表示へ。
    - 状態マトリクスの正誤表現（「○＋緑罫線」「2〜3px一往復shake」）→ 面の着色を廃した新表現へ。
    - 「Redesign - Preserve」の「明朝見出しをブランド資産として維持する」→ 明朝見出しのスケール変更を反映。
30. 意図的に揃えない項目（`--color-control-border`、`.skipLink`、`.skeleton`、`○`/`×` 記号、リセットの2段階確認、`.example` のサイズ・行間）を理由付きで1節にまとめる。
31. キャッシュバスターを更新（`styles.css`・`mode-vocab.js` を 0.13.0）し、コミットして `main` へ push。GitHub Pages 完了後に公開URLで配信物を確認する。

## 9. リスク

- **フェーズ4は DOM 構造の変更を伴う**（`.flashHead` の新設、`.choice` の正誤表現の作り替え）。`scripts/check-unit-map-ui.cjs` など既存のUI契約チェックが参照する文字列に触れる可能性があるため、変更のたびにチェックを実行する。
- **完了画面の反転は既存規定との衝突**であり、フェーズ6の改訂とセットでのみ成立する。フェーズ4だけを確定して止めると DESIGN.md と実装が矛盾する。
- Google Fonts の追加で初回表示に外部リクエストが3件増える。`display=swap` によりレイアウトは崩れないが、LCP への影響をブラウザ確認時に見る。
