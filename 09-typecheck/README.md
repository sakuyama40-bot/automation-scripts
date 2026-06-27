# 09-typecheck — TypeScript 型チェック CI連携ツール

`tsc --noEmit` を実行してエラーをファイル別に整理し Markdown レポートを保存。`package.json` への `typecheck` スクリプト追加と GitHub Actions スニペット出力まで一括対応。

## 使い方

```bash
node typecheck.js
```

## 実行フロー

```
パス指定 → tsc 探索（ローカル→グローバル→npx）
→ tsconfig.json 確認（なければ生成提案）
→ tsc --noEmit --pretty false 実行
→ エラー・警告をパース
→ ターミナルにサマリー表示
→ Markdown レポート保存
→ package.json に typecheck スクリプト追加
→ GitHub Actions スニペット出力
```

## 出力例（ターミナル）

```
─── 型チェック結果 ──────────────────────

  ❌ エラー: 5件  ⚠️ 警告: 1件
  影響ファイル: 3ファイル

  2件  src/index.ts
  2件  src/utils.ts
  1件  src/api.ts

  頻出エラー:
    TS2345: 2件
    TS2304: 2件
──────────────────────────────────────────

  ✓ レポート保存: reports/2026-06-27_typecheck.md
  ✓ package.json に "typecheck": "tsc --noEmit" を追加しました。

  GitHub Actions への組み込み方:
    - name: TypeScript 型チェック
      run: npm run typecheck
```

## 生成されるレポート（Markdown）

```markdown
# TypeScript 型チェック レポート - 2026年06月27日

**対象:** `/path/to/project`
**tsc バージョン:** Version 5.4.5

## サマリー

| 種別 | 件数 |
|---|---|
| ❌ エラー | **5件** |
| ⚠️ 警告   | **1件** |
| 影響ファイル | **3ファイル** |

## 頻出エラーコード

| コード | 件数 |
|---|---|
| `TS2345` | 2件 |
| `TS2304` | 2件 |

## ファイル別エラー

### `src/utils.ts` (2件)

- **L25:3** `TS2304` Cannot find name 'foo'.
- **L30:7** `TS2304` Cannot find name 'bar'.
```

## CI での使い方

```bash
npm run typecheck     # 0: 型エラーなし / 1: エラーあり
```

エラーがある場合は exit code `1` で終了するため CI パイプラインで自動検出できます。

### GitHub Actions サンプル

```yaml
jobs:
  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run typecheck
```

## tsconfig.json 自動生成

tsconfig.json がない場合、以下の内容で生成を提案します：

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

## tsc の探索順

1. `./node_modules/.bin/tsc`（ローカルインストール）
2. `tsc`（グローバルインストール）
3. `npx tsc`（都度ダウンロード）

## 保存先

- `reports/YYYY-MM-DD_typecheck.md` — 型チェックレポート
- `reports/YYYY-MM-DD_typecheck_gha_snippet.txt` — GitHub Actions スニペット

## 依存パッケージ

なし（Node.js 標準モジュールのみ。TypeScript は対象プロジェクトにインストール済みのものを使用）
