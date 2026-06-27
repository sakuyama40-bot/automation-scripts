# 26-outdated — 依存バージョン更新チェック

`npm outdated` を実行して major/minor/patch に分類し Markdown レポートを保存。安全な更新（minor/patch）はその場で実行できます。

## 使い方

```bash
node outdated.js
```

## 実行フロー

```
パス指定 → npm outdated --json 実行
→ major / minor / patch に分類
→ ターミナルにサマリー表示
→ Markdown レポート保存
→ minor/patch は npm update を提案
→ major は手動コマンドを表示
```

## 出力例（ターミナル）

```
─── 更新可能なパッケージ ────────────────

  🔴 Major: 2件（破壊的変更の可能性）
  🟡 Minor: 1件
  🟢 Patch: 3件

  合計: 6件

  🔴 express (prod)  4.17.1 → 5.0.0
  🔴 jest (dev)      28.0.0 → 29.7.0
  🟡 axios (prod)    0.27.2 → 0.28.0
  🟢 dotenv (prod)   16.0.0 → 16.0.3
  🟢 lodash (prod)   4.17.15 → 4.17.21
──────────────────────────────────────────

  ✓ レポート保存: reports/2026-06-27_outdated.md

4件（minor/patch）は npm update で安全に更新できます。
実行しますか？ [y/N]:
```

## 生成されるレポート（Markdown）

```markdown
# 依存バージョン更新チェック - 2026年06月27日

**対象:** `/path/to/project`

## サマリー

| 種別 | 件数 |
|---|---|
| 🔴 Major（破壊的変更の可能性） | **2件** |
| 🟡 Minor（機能追加・後方互換） | **1件** |
| 🟢 Patch（バグ修正） | **3件** |

## 🔴 Major（破壊的変更の可能性） (2件)

| パッケージ | 現在 | 最新 | 種別 | 更新コマンド |
|---|---|---|---|---|
| `express` | 4.17.1 | 5.0.0 | prod | `npm install express@5.0.0` |

## 更新コマンド集

### 安全な更新（minor/patch）
```bash
npm update
```

### Major 更新（手動・要テスト）
```bash
npm install express@5.0.0
npm install jest@29.7.0
```
```

## 更新の種類

| バンプ | 意味 | 対応 |
|---|---|---|
| 🔴 Major | メジャー番号が上がる（例: 4.x → 5.x） | 手動・CHANGELOG 確認必須 |
| 🟡 Minor | マイナー番号が上がる（例: 4.17 → 4.18） | `npm update` で安全に更新 |
| 🟢 Patch | パッチ番号が上がる（例: 4.17.1 → 4.17.3） | `npm update` で安全に更新 |

## 保存先

`reports/YYYY-MM-DD_outdated.md`

## 依存パッケージ

なし（Node.js 標準モジュール + npm コマンドのみ）
