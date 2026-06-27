# 13-release-tag — リリースタグ自動作成ツール

バージョンバンプ → `package.json` 更新 → `CHANGELOG.md` 追記 → `git commit` → `git tag` までワンコマンドで実行します。

## 使い方

```bash
node release.js
```

## 実行フロー

```
パス指定 → 未コミット確認 → バンプ種別選択
→ コミット一覧表示 → 確認
→ package.json 更新
→ CHANGELOG.md 先頭に新エントリ挿入
→ git add → git commit → git tag -a
→（任意）git push --tags
```

## バージョンバンプ種別

| # | 種別 | 例 | 用途 |
|---|---|---|---|
| 1 | patch | 1.2.3 → 1.2.4 | バグ修正 |
| 2 | minor | 1.2.3 → 1.3.0 | 機能追加 |
| 3 | major | 1.2.3 → 2.0.0 | 破壊的変更 |
| 4 | 手動 | 任意入力 | ベータ版など |

## 実行例

```
  現在バージョン : 1.2.3 (タグ: v1.2.3)

バージョンの上げ方を選んでください:
  1. patch  → 1.2.4  （バグ修正）
  2. minor  → 1.3.0  （機能追加）
  3. major  → 2.0.0  （破壊的変更）
  4. 手動入力

番号を入力 [1]: 2

  新バージョン   : v1.3.0
  含まれるコミット: 5件
    ✨ feat: 2件
    🐛 fix: 1件
    🔧 chore: 2件

タグメッセージ [Release v1.3.0]:
リリース後に git push --tags を実行しますか？ [y/N]: y

─── 実行中 ──────────────────────────────
  ✓ package.json: 1.2.3 → 1.3.0
  ✓ CHANGELOG.md 更新
  ✓ git add package.json CHANGELOG.md
  ✓ git commit "chore: release v1.3.0"
  ✓ git tag v1.3.0
  ✓ git push origin main && git push origin v1.3.0

  🚀 v1.3.0 リリース完了！
```

## 生成される CHANGELOG エントリ

```markdown
## [1.3.0] - 2026-06-27

### ✨ 追加 (Features)

- add OAuth support (auth) (`abc1234`)
- new breaking API **BREAKING CHANGE** (`ghi9012`)

### 🐛 バグ修正 (Bug Fixes)

- resolve null pointer error (`def5678`)

### 🔧 その他 (Chores)

- update deps (`jkl3456`)
```

## 対応 Conventional Commits タイプ

| タイプ | 絵文字 | セクション |
|---|---|---|
| feat | ✨ | 追加 (Features) |
| fix | 🐛 | バグ修正 (Bug Fixes) |
| docs | 📚 | ドキュメント (Docs) |
| refactor | ♻️ | リファクタリング |
| perf | ⚡ | パフォーマンス |
| test | 🧪 | テスト |
| style | 💄 | スタイル |
| ci | ⚙️ | CI |
| build | 📦 | ビルド |
| chore | 🔧 | その他 (Chores) |
| revert | ⏪ | リバート |

`feat!:` や `fix!:` のように `!` を付けると **BREAKING CHANGE** と表示されます。

## 安全機能

- 未コミットの変更がある場合に警告・続行確認
- タグなし（初回リリース）の場合は全コミット履歴を対象
- CHANGELOG.md がない場合は自動作成、ある場合は最新エントリを先頭に挿入

## 依存パッケージ

なし（Node.js 標準モジュール + git コマンドのみ）
