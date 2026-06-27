# 17-changelog — CHANGELOG 自動生成ツール

`git log` を読んで conventional commits を自動分類し、`CHANGELOG.md` を生成。既存ファイルへの先頭追記にも対応。

## 使い方

```bash
node changelog-gen.js
```

対象リポジトリのパスを聞かれます（`.` で現在のディレクトリ）。

## 取得範囲の選択

| 選択 | 内容 |
|---|---|
| 1 | 前回タグ以降のコミット（推奨） |
| 2 | 全コミット |
| 3 | 日付指定（YYYY-MM-DD 以降） |

## 対応する Conventional Commits

| プレフィックス | 分類 |
|---|---|
| `feat:` | ✨ 追加 (Features) |
| `fix:` | 🐛 修正 (Bug Fixes) |
| `docs:` | 📝 ドキュメント |
| `refactor:` | ♻️ リファクタリング |
| `perf:` | ⚡ パフォーマンス改善 |
| `test:` | ✅ テスト |
| `chore:` | 🔧 メンテナンス |
| `ci:` | 👷 CI/CD |
| `feat!:` / `fix!:` | ⚠️ 破壊的変更（最優先表示） |
| その他 | 📌 その他 |

スコープ `feat(scope): message` にも対応。

## 生成例

```markdown
## [1.0.0] - 2026-06-27

### ✨ 追加 (Features)

- 05-vscode-extensions 追加（9カテゴリ・マージ・settings.json） (`5e16773`)
- 18-daily-report 追加（Claude整形・日報週報・Markdown保存） (`2023d55`)

### 📌 その他

- automation-scripts リポジトリ作成（連携20選） (`27bccbb`)
```

## 既存 CHANGELOG.md の扱い

新しいセクションを**先頭に追記**する。既存のバージョン履歴は保持される。

## 依存パッケージ

なし（Node.js 標準モジュール + git コマンドのみ）
