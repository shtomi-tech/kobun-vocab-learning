<!-- graft:start -->
## Graft — repo context graph

This repo is indexed in `graft/`: small linked markdown nodes that explain each
system and carry exact file:line spans, kept in sync with the code through git.

For ANY task here — understanding how something works, finding where code lives,
or scoping a change — get context from the graph before grepping or opening
source files. Re-ask freely (it's cheap) and reuse literal identifiers you
already have (symbol, error string, file name) as the query. New to this repo?
Run `graft map` first — a token-budgeted orientation (dir clusters, hubs,
hotspots), no LLM, no key.

- Run `graft ask "<your question>" --source` → ranked nodes with the relevant
  code spans inlined (each hit's ≤8-line crux by default; `--full` for whole
  definitions when the crux isn't enough). Match the tool to the task shape:
  for understanding or editing, the top node IS the answer — cite its
  `covers:` file:line spans and edit straight from `--source`. For
  exhaustive tasks ("every occurrence / every caller of this pattern"), ranked
  results are top-N, not complete — run `graft grep "<literal>"` instead
  (exhaustive over indexed files, grouped by enclosing symbol), falling back
  to raw `grep -rn` only for unindexed files.
- `graft skeleton <file>` → every definition's signature + span, ~10× cheaper
  than reading the file; use it to skim an API surface.
- `graft callers <symbol>` gives precomputed, exact edges — who calls this.
  Add `--direction out` for what it calls, or `--depth N` to walk
  transitively for the full blast radius. For structural questions, skip
  ranking and use this directly.
- Or browse: `graft/INDEX.md` lists every node; follow the links.
- Monorepos and folders of multiple repos rank fairly across sub-projects —
  hits carry `[scope/]` labels naming which one they're from. Narrow with
  `graft ask "<task>" --in <scope>/` once you know where you're working.

If a returned span is truncated ("+N more lines"), open the file at that exact
range before finalizing. Only open source files when a node genuinely lacks a
needed detail, and then at the exact file:line the node points to — never
re-read whole files.

After big code changes, refresh the graph with `graft build` (deterministic,
no API key, $0).
<!-- graft:end -->

## データ作成の正本

`data/set-*.json` へ語・セットを追加する、または例文を差し替えるときは、
[docs/AUTHORING_STANDARD.md](docs/AUTHORING_STANDARD.md) に従う。典拠と底本の決め方、
`source` の表記、空欄の作り方、和歌の `waka` フィールド、検証手順をまとめてある。
採用した底本は [docs/SOURCE_EDITIONS.md](docs/SOURCE_EDITIONS.md) に記録する。

手順（語の選定、NDLでの底本照合、JSONの組み立て、検査、登録、デプロイ）は
[docs/VOCAB_SET_PLAYBOOK.md](docs/VOCAB_SET_PLAYBOOK.md) にまとめてある。**形式検査を
すべて通過したうえで壊れる失敗**（出典の捏造、見出し語の誤り、文中四択の正答が一意に
ならない）を扱うので、規約と併せて読む。底本照合の実務は
[docs/NDL_COLLATION.md](docs/NDL_COLLATION.md)。

- `node scripts/ndl.mjs info <PID>` — 底本の公開区分と収録範囲。頁・巻の食い違いは
  版面を開く前にここで弾ける。
- `node scripts/check-set-choices.mjs <setId> --pairs` — セット内プールで文中四択が
  成立するかを見る。`check-context-choices.mjs` は全セット横断で数えるため、同義語を
  1セットに固めても通ってしまう。作成時に手で回す道具で、CIには入れていない。

Claude Code の `add-vocab-set` スキルと Codex の `kobun-vocab-set-authoring` スキルは
どちらも上記の手順書を実体として参照する。手順を直すときは手順書を直す。

一括の差し替えは `docs/waka-adoptions.json` に入力表を書いて
`node scripts/apply-waka.mjs` で反映する。データJSONを直接手で編集すると、
入力表からの再実行で変更が巻き戻る。
