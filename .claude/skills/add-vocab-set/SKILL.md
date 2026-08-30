---
name: add-vocab-set
description: kobun-vocab-learning に古文単語のセット（12語）を追加する、または既存セットの例文・出典・意味を修正するときの手順。語の選定、NDLデジタルコレクションでの底本照合、JSONの組み立て、文中四択が壊れていないかの検査、manifest登録、デプロイまでを扱う。「第Nセットを追加して」「古文単語を追加」「例文を実出典に差し替えて」「出典を確認して」「set-NN.json を作って」「セットをレビューして」といった依頼では必ずこのスキルを使う。data/set-*.json、docs/SOURCE_EDITIONS.md、docs/AUTHORING_STANDARD.md に触れる作業、および古文の例文の典拠を確かめる作業全般が対象。ユーザーが「セット」「語彙」「例文」「出典」「底本」とだけ言っていて古文アプリの話だと分かる場合も使う。別アプリの kobun-practice-v2.1 や Vault の旧語彙アプリには適用しない。
---

# 古文単語セットの追加・修正

手順の実体は **[docs/VOCAB_SET_PLAYBOOK.md](../../../docs/VOCAB_SET_PLAYBOOK.md)** にある。リポジトリ内に置いてバージョン管理し、Codex 側のスキル（`kobun-vocab-set-authoring`）とも共有している。**まずこれを読む。**

読む順番:

1. `docs/VOCAB_SET_PLAYBOOK.md` — 手順と、検査を通り抜ける4つの失敗
2. `docs/AUTHORING_STANDARD.md` — データ形式の正本
3. `docs/SOURCE_EDITIONS.md` — 底本の一覧と語ごとの対応
4. `docs/NDL_COLLATION.md` — 底本照合の実務（§2 で足りないとき）

手順を改善したくなったら、このファイルではなく `docs/VOCAB_SET_PLAYBOOK.md` を直す。ここに手順を書き足すと Codex 側と食い違う。

## 覚えておく要点

- **出典は必ず現物に当てる。** 実在する作品名・段番号・頁は、それ自体では裏付けにならない。第17セットでは実出典として書かれた11語が11語とも底本と合わず、しかも全検査を通過していた。
- **確かめられなければ `学習用作例` にする。** 実出典を装うより常に良い。
- **`node scripts/check-set-choices.mjs <setId> --pairs` を回す。** 既存の `check-context-choices.mjs` は全セット横断で数えるが、実際の文中四択は同じセットの12語からしか誤答を選ばない。このズレで同義語の固まりが見逃される。
- **`node scripts/ndl.mjs info <PID>` を最初に叩く。** 収録範囲が分かれば、頁や巻の食い違いは版面を開かずに弾ける。
