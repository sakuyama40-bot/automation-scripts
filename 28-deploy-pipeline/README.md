# 28-deploy-pipeline — デプロイパイプライン ワンコマンド化

ターゲットプロジェクトに `scripts/pipeline.js` を生成し、`npm run pipeline` 1コマンドで lint→test→build→deploy を連鎖実行できるようにします。

## セットアップ

```bash
node pipeline-setup.js
```

対話形式でステップとコマンドを設定します。

## 生成されるもの

| ファイル | 内容 |
|---|---|
| `scripts/pipeline.js` | パイプラインランナー本体 |
| `package.json`（更新） | `pipeline` / `pipeline:staging` / `pipeline:prod` / `pipeline:dry` の4コマンド追加 |

## 使い方（生成後）

```bash
npm run pipeline           # development（lint・test のみ）
npm run pipeline:staging   # staging（lint・test・build）
npm run pipeline:prod      # production（lint・test・build・deploy）
npm run pipeline:dry       # dry-run（コマンド確認のみ、実行なし）
```

### オプション

```bash
node scripts/pipeline.js --env production          # 環境指定
node scripts/pipeline.js --skip lint,test          # ステップスキップ
node scripts/pipeline.js --env staging --dry-run   # 組み合わせ
```

## 実行例

```
==================================================
  デプロイパイプライン: my-project
  環境: production
==================================================

実行ステップ (4件):
  1. lint:   npm run lint
  2. test:   npm test
  3. build:  npm run build
  4. deploy: npm run deploy:prod

[14:32:01] [lint]   開始...
[14:32:03] [lint]   ✓ 完了 (1.8s)

[14:32:03] [test]   開始...
[14:32:10] [test]   ✓ 完了 (7.2s)

[14:32:10] [build]  開始...
[14:32:15] [build]  ✓ 完了 (4.9s)

[14:32:15] [deploy] 開始...
[14:32:18] [deploy] ✓ 完了 (3.1s)

─── サマリー ─────────────────────────
  ✓ lint          1.8s
  ✓ test          7.2s
  ✓ build         4.9s
  ✓ deploy        3.1s
  合計: 17.0s

  ✅ パイプライン完了
```

## 環境別ステップ対応表

| ステップ | development | staging | production |
|---|---|---|---|
| lint | ✅ | ✅ | ✅ |
| test | ✅ | ✅ | ✅ |
| build | — | ✅ | ✅ |
| deploy | — | — | ✅ |

## 失敗時の挙動

ステップが失敗すると即座に中断し、それまでの結果をサマリー表示して `exit 1` で終了します。

```
[14:32:05] [test] ✗ 失敗 (2.1s)

─── パイプライン中断 ─────────────────
  ✓ lint    1.8s
  ✗ test    2.1s
  合計: 3.9s
```

## 依存パッケージ

なし（Node.js 標準モジュール `child_process` のみ）
