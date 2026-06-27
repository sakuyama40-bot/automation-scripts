# 01-project-init — プロジェクト初期化ツール

新しいプロジェクトの基本ファイルをまとめて自動作成する対話式CLIツール。

## 使い方

```bash
node init.js
```

インタラクティブに聞かれるので答えるだけ：

1. プロジェクト名
2. 説明（任意）
3. プロジェクトタイプ（下記参照）
4. 作成先ディレクトリ

## 選べるプロジェクトタイプ

| 番号 | タイプ | 生成されるもの |
|---|---|---|
| 1 | Node.js CLIツール | src/, src/commands/, package.json, .gitignore, .env.example |
| 2 | Express APIサーバー | src/, src/routes/, src/middleware/, package.json (express/dotenv付き) |
| 3 | 汎用自動化スクリプト | src/, src/utils/, package.json (dotenv付き) |
| 4 | フルセット（全部入り） | 全フォルダ + eslint/prettier付きpackage.json |

## 依存パッケージ

なし（Node.js標準モジュールのみ）

## 実行例

```
========================================
  プロジェクト初期化ツール
========================================

プロジェクト名 [my-project]: yaima-v2
説明（任意）: レンタカー予約自動化
プロジェクトタイプを選んでください:
  1. Node.js CLIツール
  2. Express APIサーバー
  3. 汎用自動化スクリプト
  4. フルセット（全部入り）

番号を入力 [3]: 3
作成先 [./yaima-v2]:

「汎用自動化スクリプト」を作成中: C:\...\yaima-v2

  ✓ package.json
  ✓ src/index.js
  ✓ .gitignore
  ✓ .env.example
```
