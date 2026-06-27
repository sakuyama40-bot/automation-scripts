# 25-npm-audit — npm 脆弱性スキャンツール

`npm audit` を実行して重大度別に結果を整理、Markdown レポートを自動保存。安全な修正は対話的に実行できます。

## 使い方

```bash
node audit.js
```

## 実行フロー

```
パス指定 → node_modules 確認 → npm audit --json 実行
→ 重大度別サマリー表示 → レポート保存 → 自動修正の提案
```

## 出力例（ターミナル）

```
─── スキャン結果 ────────────────────────

  🔴 Critical（致命的）: 1件
  🟠 High（高）: 1件
  🟡 Moderate（中）: 1件

  合計: 3件の脆弱性

  🔴 old-package@* (手動)
  🟠 lodash@<4.17.21 (fix可)
  🟡 axios@<0.27.2 (force fix)
──────────────────────────────────────────

  ✓ レポート保存: reports/2026-06-27_audit.md

2件は npm audit fix で安全に修正できます。
実行しますか？ [y/N]:
```

## 生成されるレポート（Markdown）

```markdown
# npm audit レポート - 2026年06月27日

**対象:** `/path/to/project`

## サマリー

| 重大度 | 件数 |
|---|---|
| 🔴 Critical（致命的） | **1件** |
| 🟠 High（高） | **1件** |
| 🟡 Moderate（中） | **1件** |
| **合計** | **3件** |

## 脆弱なパッケージ一覧

### 🔴 old-package (critical)
- **修正:** ❌ 手動対応が必要

### 🟠 lodash (high)
- **修正:** ✅ `npm audit fix` で修正可
```

## 修正の種類

| 種別 | コマンド | 内容 |
|---|---|---|
| 安全な修正 | `npm audit fix` | マイナー・パッチバージョンの更新 |
| 破壊的修正 | `npm audit fix --force` | メジャーバージョン更新（要テスト） |
| 手動対応 | - | パッケージの入れ替えや削除が必要 |

## 対応 npm バージョン

- npm v7+ (auditReportVersion: 2)
- npm v6 (advisories 形式)

## 保存先

`reports/YYYY-MM-DD_audit.md`

## 依存パッケージ

なし（Node.js 標準モジュール + npm コマンドのみ）
