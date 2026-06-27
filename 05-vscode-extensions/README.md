# 05-vscode-extensions — VS Code 推奨拡張機能 生成ツール

カテゴリを選ぶだけで `.vscode/extensions.json` を生成。チームメンバーが同じ拡張機能を使える状態にする。

## 使い方

```bash
node vscode-ext.js
```

## 選べるカテゴリ（複数選択可）

| # | カテゴリ | 含まれる主な拡張機能 |
|---|---|---|
| 1 | Node.js / JavaScript | ESLint, Prettier, npm Intellisense |
| 2 | TypeScript | TypeScript Nightly, Pretty TS Errors |
| 3 | Python | Python, Pylint, Black Formatter, Jupyter |
| 4 | Git / バージョン管理 | GitLens, Git Graph, Git History |
| 5 | Markdown / ドキュメント | Markdown All in One, markdownlint |
| 6 | Docker / コンテナ | Docker, Dev Containers |
| 7 | 生産性 / UI改善 | Material Icon Theme, Indent Rainbow, Better Comments |
| 8 | REST API 開発 | REST Client, Thunder Client |
| 9 | Claude Code / AI開発 | GitHub Copilot, Continue |

デフォルト: `1,4,7`（Node.js + Git + 生産性）

## 生成されるファイル

| ファイル | 内容 |
|---|---|
| `.vscode/extensions.json` | VS Code がチームに推奨する拡張機能リスト |
| `.vscode/settings.json` | フォーマッタ等の推奨設定（オプション） |
| `.vscode/install-extensions.sh` | 一括インストール用シェルスクリプト |

## 一括インストール

生成後、以下で全拡張機能をインストール:

```bash
bash .vscode/install-extensions.sh
```

または個別に:

```bash
code --install-extension dbaeumer.vscode-eslint
```

## 既存ファイルの扱い

- `extensions.json`: 不足分のみ追記（既存エントリは保持）
- `settings.json`: 既存設定を優先してマージ

## 依存パッケージ

なし（Node.js 標準モジュールのみ）
