# automation-scripts

ジョブズくん AI組織 — 連携20選 自動化スクリプト集

各ツールは番号付きフォルダで管理。それぞれ独立して動作する。

## ツール一覧

| # | フォルダ | 内容 |
|---|---|---|
| 01 | `01-project-init/` | package.json 初期化 & スクリプト雛形生成（選択式・4タイプ対応） |
| 02 | `02-env-generator/` | .env / .env.example の新規生成・同期・差分チェック |
| 03 | `03-gitignore-generator/` | .gitignore 生成（10カテゴリ・複数選択・既存ファイルへのマージ対応） |
| 04 | `04-readme-template/` | README.md 生成（5タイプ対応・入力内容を自動埋め込み・バックアップ付き） |
| 18 | `18-daily-report/` | 日報・週報 自動作成（作業メモ入力 → Claude が整形 → Markdown保存） |

## 使い方

各フォルダの `README.md` を参照。

## ルール

- 各ツールは `XX-tool-name/` の形式で追加する
- 本番実行前に必ずジョブズくんが確認する
