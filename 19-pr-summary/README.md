# 19-pr-summary — PR 説明文 自動生成ツール

git diff とコミット履歴を Claude に渡して PR 説明文（概要・変更内容・テスト手順・注意事項）を自動生成。

## セットアップ

```bash
cp .env.example .env
# .env に ANTHROPIC_API_KEY を設定
```

## 使い方

```bash
node pr-summary.js
```

### 入力の流れ

```
対象リポジトリのパス → ベースブランチ → 作業ブランチ
```

### 生成例

```markdown
## 概要

automation-scripts リポジトリに開発効率化ツール群（01〜05、17〜19）を追加しました。
各ツールは Node.js 標準モジュールのみで動作し、依存パッケージは不要です。

## 変更内容

- `01-project-init/init.js`: 4タイプ対応の選択式プロジェクト初期化ツールを追加
- `02-env-generator/env-gen.js`: .env 管理ツール（新規生成・同期・差分チェック）を追加
- `17-changelog/changelog-gen.js`: git log から CHANGELOG を自動生成するツールを追加

## テスト手順

- [ ] `node 01-project-init/init.js` を実行し、4タイプそれぞれでプロジェクトが生成されることを確認
- [ ] `node 17-changelog/changelog-gen.js` で CHANGELOG.md が生成されることを確認

## 注意事項

特になし
```

## 保存先

`pr-<ブランチ名>-<日付>.md` としてリポジトリルートに保存。

## 差分が大きい場合

400 行を超える差分は自動でトリミングし、`--stat`（ファイル変更統計）で補完します。

## APIキーなしでも動く

`ANTHROPIC_API_KEY` 未設定の場合はテンプレートのみ生成。コミット一覧は自動で埋め込まれます。

## GitHub PR 作成リンク

GitHub リポジトリの場合、PR 作成ページの URL も自動で表示します。

```
https://github.com/user/repo/compare/master...feature/xxx?expand=1
```

## 依存パッケージ

なし（Node.js 標準モジュール + git コマンドのみ）
