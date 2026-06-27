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
| 05 | `05-vscode-extensions/` | VS Code 推奨拡張機能生成（9カテゴリ選択・settings.json・一括インストールスクリプト） |
| 17 | `17-changelog/` | CHANGELOG 自動生成（git log 解析・conventional commits 分類・既存ファイルへ追記） |
| 08 | `08-husky-setup/` | husky + lint-staged セットアップ（ESLint/Prettier のコミット前自動修正） |
| 12 | `12-commitlint/` | コミットメッセージ規約チェック（検証・履歴監査・hook設定の3モード） |
| 20 | `20-meeting-notes/` | 議事録・タスクメモ整形（生メモ → Claude → 構造化Markdown・優先度別タスクリスト） |
| 25 | `25-npm-audit/` | npm 脆弱性スキャン（重大度別レポート・自動修正提案・npm v6/v7 両対応） |
| 28 | `28-deploy-pipeline/` | デプロイパイプライン生成（lint→test→build→deploy ワンコマンド・環境別ステップ制御・dry-run対応） |
| 19 | `19-pr-summary/` | PR 説明文 自動生成（git diff → Claude → 概要・変更内容・テスト手順を生成） |
| 18 | `18-daily-report/` | 日報・週報 自動作成（作業メモ入力 → Claude が整形 → Markdown保存） |

## 使い方

各フォルダの `README.md` を参照。

## ルール

- 各ツールは `XX-tool-name/` の形式で追加する
- 本番実行前に必ずジョブズくんが確認する
