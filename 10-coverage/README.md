# 10-coverage — テストカバレッジ計測ツール

Jest を実行して `coverage-summary.json` をパース。閾値チェック・ファイル別ランキング・Markdown レポートを生成します。CI 連動で閾値未達時に exit 1 を返します。

## 使い方

```bash
node coverage.js
```

## 実行フロー

```
パス指定 → 閾値入力 → 既存データ確認
→ Jest --coverage 実行（またはスキップ）
→ coverage-summary.json パース
→ 合計カバレッジ表示
→ ワースト5ファイル表示
→ Markdown レポート保存
→ 閾値判定 → exit 0 or 1
```

## 出力例（ターミナル）

```
─── カバレッジ結果 ──────────────────────

  🟢 Lines（行）                84.0%  (168/200)
  🟢 Statements（文）           81.0%  (243/300)
  🟢 Functions（関数）          84.0%  ( 42/ 50)
  🔴 Branches（分岐）           70.0%  ( 70/100)

  ワースト5（最低カバレッジ）:
    🔴 src/utils.ts  (min: 40.0%)
    🟡 src/api.ts    (min: 73.3%)
    🟢 src/index.ts  (min: 90.0%)
──────────────────────────────────────────

  ✓ レポート保存: reports/2026-06-27_coverage.md
  ✓ package.json に "test:coverage": "jest --coverage" を追加

  ❌ 閾値（80%）を下回る指標があります
```

## 生成されるレポート（Markdown）

```markdown
# カバレッジレポート - 2026年06月27日

**対象:** `/path/to/project`
**閾値:** 80%（lines）/ 80%（statements）...

## 合計カバレッジ

| 指標 | カバー | 判定 |
|---|---|---|
| Lines（行） | **84.0%** | 🟢 PASS |
| Branches（分岐） | **70.0%** | 🔴 FAIL（閾値: 80%） |

## ファイル別カバレッジ（低い順 TOP 20）

| ファイル | Lines | Statements | Functions | Branches |
|---|---|---|---|---|
| `src/utils.ts` | 🟡 70.0% | 🟡 70.0% | 🟢 80.0% | 🔴 40.0% |
```

## カバレッジアイコン

| アイコン | 条件 |
|---|---|
| 🟢 | 閾値以上 |
| 🟡 | 閾値の 75% 以上（閾値未満） |
| 🔴 | 閾値の 75% 未満 |

## CI での使い方

```bash
npm run test:coverage   # exit 0: PASS / exit 1: FAIL
```

### GitHub Actions サンプル

```yaml
- name: テストカバレッジ
  run: npm run test:coverage

- name: カバレッジレポートアップロード
  uses: actions/upload-artifact@v4
  with:
    name: coverage-report
    path: coverage/
```

## Jest 設定（推奨）

```json
// jest.config.js または package.json の "jest" キー
{
  "coverageReporters": ["json-summary", "text", "lcov"],
  "coverageThreshold": {
    "global": {
      "lines": 80,
      "statements": 80,
      "functions": 80,
      "branches": 80
    }
  }
}
```

## 保存先

`reports/YYYY-MM-DD_coverage.md`

## 依存パッケージ

なし（Node.js 標準モジュールのみ。Jest は対象プロジェクトにインストール済みのものを使用）
