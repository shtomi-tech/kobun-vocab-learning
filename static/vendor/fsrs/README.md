# ts-fsrs（vendoring）

意味復習の間隔算出に使う FSRS-6 スケジューラ。CDN を参照せず実ファイルを同梱する（オフライン・可用性のため）。

| 項目 | 値 |
| --- | --- |
| パッケージ | `ts-fsrs` |
| バージョン | **5.4.2**（`FSRSVersion` = `v5.4.2 using FSRS-6.0`） |
| ライセンス | MIT（`LICENSE` に本文を同梱） |
| 取得元 | `https://cdn.jsdelivr.net/npm/ts-fsrs@5.4.2/dist/index.umd.js` |
| 取得日 | 2026-09-09 |
| sha256 | `59b7444121d0aae5bb969097ed95df38eff4a4f878e459703c63720f6b6a176b` |
| サイズ | 72,009 bytes（minified 版は配布されていない） |
| グローバル名 | `FSRS`（UMD） |

`eiken-q1-practice` リポジトリと同じ版・同じ配置を使っている。片方だけ上げないこと。

## 更新手順

1. `curl -sL https://cdn.jsdelivr.net/npm/ts-fsrs@<版>/dist/index.umd.js -o index.umd.js`
2. 本ファイルの版・取得日・sha256 を更新する。
3. `scripts/check-fsrs-vendor.cjs` の `EXPECTED_VERSION` / `EXPECTED_SHA256` を更新する。
4. `index.html` の `?v=` を更新する（キャッシュ対策）。
5. `node scripts/check-fsrs-vendor.cjs` と `node scripts/check-srs.cjs` を実行する。

## 注意

`.github/workflows/pages.yml` の `Prepare static files` は `cp static/*.js` のグロブで静的ファイルを配る。**このディレクトリはサブディレクトリなのでグロブに含まれない**ため、専用の `mkdir` と `cp` を置いている。消すと本番だけ 404 になり、ローカルでは再現しない。`scripts/check-fsrs-vendor.cjs` がこの対応を検査している。
