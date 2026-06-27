# 11-gha-workflow — GitHub Actions ワークフロー生成ツール

CI / デプロイ / npm公開 / Dependabot の4種を選択式で生成。Node.jsバージョンのマトリックスやパッケージマネージャーも対話設定できます。

## 使い方

```bash
node gha-setup.js
```

## 生成できるワークフロー

| # | 種類 | ファイル | トリガー |
|---|---|---|---|
| 1 | CI（lint / typecheck / test） | `.github/workflows/ci.yml` | push / PR |
| 2 | デプロイ（GitHub Pages / カスタム） | `.github/workflows/deploy.yml` | main への push |
| 3 | npm パッケージ公開 | `.github/workflows/publish.yml` | Release 作成 |
| 4 | Dependabot（自動更新） | `.github/dependabot.yml` | 定期スケジュール |

## 生成例

### CI ワークフロー（Node.js マトリックス）

```yaml
name: CI

on:
  push:
    branches: ['main']
  pull_request:
    branches: ['main']

jobs:
  ci:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: ['18.x', '20.x']

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '${{ matrix.node-version }}'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
```

### GitHub Pages デプロイ

```yaml
name: GitHub Pages デプロイ

on:
  push:
    branches: ['main']

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20.x'
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: './dist'
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/deploy-pages@v4
        id: deployment
```

### npm Publish（GitHub Packages）

```yaml
on:
  release:
    types: [published]

# NODE_AUTH_TOKEN に GITHUB_TOKEN を使用
```

### Dependabot

```yaml
version: 2
updates:
  - package-ecosystem: 'npm'
    directory: '/'
    schedule:
      interval: 'weekly'
    open-pull-requests-limit: 10
    labels:
      - 'dependencies'
```

## オプション

| 項目 | 選択肢 |
|---|---|
| パッケージマネージャー | npm / yarn / pnpm |
| Node.js バージョン | 単一 or カンマ区切りでマトリックス（例: `18.x,20.x`） |
| 対象ブランチ | カンマ区切りで複数指定可（例: `main,develop`） |
| CI ステップ | lint / typecheck / test を個別に y/N で選択 |
| デプロイ先 | GitHub Pages / カスタムコマンド |
| npm レジストリ | npmjs.org / GitHub Packages |
| Dependabot 頻度 | daily / weekly / monthly |

## 上書き保護

既存のワークフローファイルは `.bak` にバックアップしてから上書きします。

## 依存パッケージ

なし（Node.js 標準モジュールのみ）
