# scripts/archive

実行済みの一度きりの移行スクリプト。記録（docs/ALL_SET_EXAMPLE_REVIEW_PLAN.md・docs/SOURCE_EDITIONS.md）から参照されるため残している。

- 新しい差し替えには使わない。和歌の差し替えは `node scripts/apply-waka.mjs`、検証は `node scripts/check-all.mjs` を使う。
- `fix-example-quality*.mjs`・`replace-generated-examples.mjs` は作業ディレクトリ（リポジトリ直下）の `data/` を対象にする。リポジトリ直下から `node scripts/archive/<name>.mjs` で実行する。
- CI（`check-all.mjs`）の対象外。
