# 06-eslint-setup — ESLint 設定自動生成ツール

プロジェクトタイプを選ぶだけで `.eslintrc.json` / `.eslintignore` を生成。Prettier 連携・Jest 環境・ESM 対応もオプションで設定できます。

## 使い方

```bash
node eslint-setup.js
```

## 対応プロジェクトタイプ

| # | タイプ | 使われる extends |
|---|---|---|
| 1 | Node.js（基本） | `eslint:recommended` |
| 2 | Node.js + TypeScript | + `@typescript-eslint/recommended` |
| 3 | React（JSX） | + `react/recommended`, `react-hooks/recommended` |
| 4 | React + TypeScript（TSX） | 上記すべて |
| 5 | Next.js | `next/core-web-vitals` |

## オプション

| 項目 | 内容 |
|---|---|
| ES Modules | `sourceType: "module"` に設定 |
| Jest 環境 | `env.jest: true` を追加 |
| Prettier 連携 | `extends` 末尾に `prettier` を追加（eslint-config-prettier） |

## 生成されるファイル

### `.eslintrc.json`（例: Node.js + TypeScript）

```json
{
  "env": {
    "es2022": true,
    "node": true
  },
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended"
  ],
  "parser": "@typescript-eslint/parser",
  "plugins": ["@typescript-eslint"],
  "parserOptions": {
    "ecmaVersion": 2022,
    "sourceType": "commonjs"
  },
  "rules": {
    "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
    "@typescript-eslint/no-explicit-any": "warn",
    "no-console": "off",
    "eqeqeq": ["error", "always"],
    "prefer-const": "error"
  }
}
```

### `.eslintignore`

```
node_modules/
dist/
build/
coverage/
*.min.js
```

### `package.json` scripts（自動追加）

```json
{
  "lint": "eslint . --ext .js,.jsx,.ts,.tsx",
  "lint:fix": "eslint . --ext .js,.jsx,.ts,.tsx --fix"
}
```

## セットアップ後の手順

```bash
# 1. 表示されたコマンドでパッケージをインストール
npm install --save-dev eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin

# 2. 動作確認
npm run lint

# 3. 自動修正
npm run lint:fix
```

## 上書き保護

既存の `.eslintrc.json` や `.eslintignore` がある場合は `.bak` にバックアップしてから上書きします。

## 依存パッケージ

なし（Node.js 標準モジュールのみ。ESLint 本体は対象プロジェクトにインストール）
