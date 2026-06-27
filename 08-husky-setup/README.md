# 08-husky-setup — husky + lint-staged セットアップツール

git commit 時に ESLint / Prettier を自動実行する仕組みを、対象プロジェクトにワンコマンドでセットアップ。

## 使い方

```bash
node setup.js
```

> **注意:** このツールは対象プロジェクトで `npm install` を実行します。実行前に確認ステップがあります。

## セットアップの流れ

```
対象パス → ツール選択 → ファイルタイプ選択 → 確認 → インストール実行
```

## ツール選択

| 選択 | 内容 |
|---|---|
| 1 | ESLint + Prettier（推奨） |
| 2 | ESLint のみ |
| 3 | Prettier のみ |
| 4 | lint-staged のみ（ツールは別途設定済み） |

## セットアップ後に変わること

### package.json

```json
{
  "scripts": {
    "prepare": "husky"
  },
  "lint-staged": {
    "*.{js,mjs,cjs}": ["eslint --fix", "prettier --write"],
    "*.json": ["prettier --write"],
    "*.md": ["prettier --write"]
  }
}
```

### .husky/pre-commit

```sh
npx lint-staged
```

git commit のたびに**ステージされたファイルのみ**を自動修正します。

## 生成されるファイル

| ファイル | 条件 |
|---|---|
| `.husky/pre-commit` | 常に生成 |
| `.eslintrc.json` | ESLint 選択かつ設定ファイルが存在しない場合 |
| `.prettierrc.json` | Prettier 選択かつ設定ファイルが存在しない場合 |

既存の設定ファイルは上書きしません。

## 手動実行

```bash
npx lint-staged        # ステージ済みファイルのみ
npx eslint src/ --fix  # 全ファイル対象（修正あり）
npx prettier --write . # 全ファイル対象（フォーマット）
```

## 依存パッケージ（インストール対象）

- `husky` — git hooks 管理
- `lint-staged` — ステージファイルのみ処理
- `eslint` — コード品質チェック（選択時）
- `prettier` — コードフォーマット（選択時）
