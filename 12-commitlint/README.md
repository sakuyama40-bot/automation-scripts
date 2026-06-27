# 12-commitlint — コミットメッセージ規約チェックツール

conventional commits 準拠チェックを3モードで提供。npm install なしで即使えるチェックモードあり。

## 使い方

```bash
node commitlint.js
```

## 3つのモード

### モード1: セットアップ（npm install + hook設定）

`@commitlint/cli` をインストールし、`commit-msg` フックを設定します。

- husky が入っている場合 → `.husky/commit-msg` を作成
- husky がない場合 → `.git/hooks/commit-msg` に直接設定

### モード2: メッセージ検証（依存なし）

1件のコミットメッセージを入力してその場で検証します。

```
> fix(auth): トークン検証のバグを修正
  ✓ OK: "fix(auth): トークン検証のバグを修正"  type: fix

> バグを修正した
  ✗ NG: 形式が違います
     正しい形式: <type>(<scope>): <subject>
```

### モード3: 履歴監査（直近30件を一括チェック）

リポジトリの直近コミットを一括検証し、違反を報告します。

```
合計: 10件 / 合格: 9件 / 違反: 1件

  ✓ feat: 08-husky-setup 追加
  ✗ initial: リポジトリ作成
      → type "initial" は未定義（chore: が正しい）
```

## 有効な type 一覧

| type | 用途 |
|---|---|
| `feat` | 新機能 |
| `fix` | バグ修正 |
| `docs` | ドキュメント |
| `style` | 書式・フォーマット |
| `refactor` | リファクタリング |
| `test` | テスト |
| `chore` | メンテナンス |
| `perf` | パフォーマンス改善 |
| `ci` | CI/CD |
| `build` | ビルドシステム |
| `revert` | 取り消し |

## コミットメッセージの形式

```
<type>(<scope>): <subject>

例:
  feat: ログイン機能を追加
  fix(auth): トークン検証のバグを修正
  docs(api): エンドポイント一覧を更新
  feat!: 破壊的変更（!を付ける）
```

## モード2・3は依存パッケージなし

検証ロジックは Node.js 標準モジュールのみで動作します。
モード1のみ `npm install` が必要です。
