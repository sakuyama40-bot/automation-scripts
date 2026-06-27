# 03-gitignore-generator — .gitignore 生成ツール

カテゴリを複数選択して `.gitignore` を自動生成。既存ファイルへの**マージ（重複なし追記）**にも対応。

## 使い方

```bash
node gitignore-gen.js
```

## 選べるカテゴリ（複数選択可）

| # | カテゴリ |
|---|---|
| 1 | Node.js / npm |
| 2 | Python |
| 3 | VS Code |
| 4 | Windows |
| 5 | macOS |
| 6 | Docker |
| 7 | React / Next.js |
| 8 | Claude Code / AI開発 |
| 9 | ログ・一時ファイル（共通） |
| 10 | 環境変数ファイル（共通・常に推奨） |

デフォルト: `1,3,4,9,10`（Node.js + VS Code + Windows + ログ + .env）

## 実行例

```
番号を入力 [1,3,4,9,10]: 1,3,4,8,9,10

選択されたカテゴリ:
  ✓ Node.js / npm
  ✓ VS Code
  ✓ Windows
  ✓ Claude Code / AI開発
  ✓ ログ・一時ファイル（共通）
  ✓ 環境変数ファイル（共通・常に推奨）
```

## マージ動作

既存の `.gitignore` がある場合は**上書きせず、不足しているパターンのみ追記**する。
重複しているパターンは追加されない。

## 依存パッケージ

なし（Node.js標準モジュールのみ）
