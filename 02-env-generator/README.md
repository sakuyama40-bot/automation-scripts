# 02-env-generator — .env 管理ツール

`.env` と `.env.example` の新規生成・同期・差分チェックを行う対話式CLIツール。

## 使い方

```bash
node env-gen.js
```

## 3つのモード

### モード1: 新規生成
プロジェクトタイプを選ぶと `.env`（値空欄）と `.env.example`（サンプル値入り）を両方生成。

| 選択 | テンプレート |
|---|---|
| 1 | 汎用スクリプト（NODE_ENV, PORT） |
| 2 | Express APIサーバー（DB, JWT含む） |
| 3 | Gmail / メール連携（OAuth情報） |
| 4 | Google Drive / Calendar / Notion |
| 5 | フルセット（全部入り） |

### モード2: 同期（.env → .env.example）
`.env` に追加したキーを検出し、**値をマスク**して `.env.example` を自動更新。
実際の値（パスワード等）は `.env.example` に書き出されない。

```
追加  (+): NEW_KEY
→ .env.example に NEW_KEY=your-new-key として追記
```

### モード3: 差分チェック
`.env` と `.env.example` を比較して問題を報告。

```
.envにあるが .env.example にない（要追加）: SECRET
.env.exampleにあるが .env にない（未設定）: DEPRECATED_KEY
.envで値が空のキー（要設定）: NODE_ENV, SECRET
```

## 依存パッケージ

なし（Node.js標準モジュールのみ）

## 使いどころ

- 新プロジェクト開始時 → モード1
- `.env` に新しいキーを追加したとき → モード2（チームに共有できる状態にする）
- デプロイ前の確認 → モード3（設定漏れを防ぐ）
