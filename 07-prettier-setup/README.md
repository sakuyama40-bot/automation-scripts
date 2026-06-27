# 07-prettier-setup — Prettier 設定自動生成ツール

4プリセット＋カスタム選択で `.prettierrc.json` / `.prettierignore` を生成。ESLint との連携パッチも自動適用します。

## 使い方

```bash
node prettier-setup.js
```

## プリセット

| # | スタイル | printWidth | semi | singleQuote | trailingComma |
|---|---|---|---|---|---|
| 1 | Prettier デフォルト | 80 | ✅ | ❌ | all |
| 2 | Airbnb | 100 | ✅ | ✅ | all |
| 3 | Google | 80 | ✅ | ✅ | all |
| 4 | Standard JS | 80 | ❌ | ✅ | none |
| 5 | カスタム | 対話入力 | 対話入力 | 対話入力 | 対話入力 |

## 生成されるファイル

### `.prettierrc.json`（例: Airbnb）

```json
{
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "bracketSpacing": true,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

### `.prettierignore`

```
node_modules/
dist/
build/
coverage/
.next/
*.min.js
package-lock.json
yarn.lock
pnpm-lock.yaml
```

### `package.json` scripts（自動追加）

```json
{
  "format": "prettier --write .",
  "format:check": "prettier --check ."
}
```

## ESLint 連携

実行時に「ESLint と連携しますか？」と確認します。

- `.eslintrc.json` の `extends` 末尾に `"prettier"` を自動追加
- 既に `prettier` が含まれている場合はスキップ（二重追加なし）
- 変更前に `.eslintrc.json.bak` を自動生成

```json
{
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "prettier"
  ]
}
```

## セットアップ後の手順

```bash
# 1. パッケージをインストール
npm install --save-dev prettier
# ESLint 連携する場合は追加
npm install --save-dev eslint-config-prettier

# 2. 全ファイル整形
npm run format

# 3. CI 用（整形が必要なファイルがあれば exit 1）
npm run format:check
```

## 上書き保護

既存の `.prettierrc.json` / `.prettierignore` は `.bak` にバックアップしてから上書き。既存の `format` スクリプトがある場合は上書きしません。

## 依存パッケージ

なし（Node.js 標準モジュールのみ。Prettier 本体は対象プロジェクトにインストール）
