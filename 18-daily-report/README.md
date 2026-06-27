# 18-daily-report — 日報・週報 自動作成ツール

作業メモを箇条書きで入力すると、Claude が読みやすい日報・週報に整形して Markdown ファイルで保存。

## セットアップ

```bash
cp .env.example .env
# .env に ANTHROPIC_API_KEY を設定
```

API キーは https://console.anthropic.com で取得できます。

## 使い方

```bash
node report-gen.js
```

### 入力の流れ

```
モード選択: 1. 日報 / 2. 週報

【本日の作業内容】（1項目ずつEnter、空行で終了）
  > yaima-rentacar バグ修正
  > automation-scripts 03〜04 実装
  > （空行）

【課題・ブロッカー】
  > （空行 → 「特になし」になる）

【明日の予定】
  > 18-daily-report 実装
  > （空行）
```

### 生成例

```markdown
# 日報 - 2026年06月27日（土）

## 本日の作業実績

- yaima-rentacarのバグ修正を完了し、予約フローが正常に動作することを確認
- automation-scriptsリポジトリの03（.gitignore生成）・04（README生成）ツールを実装

## 成果・進捗サマリー

本日は開発効率化ツールの整備を中心に進めました。...

## 課題・懸念事項

特になし

## 明日の予定

- 18-daily-report ツールの実装・テスト
```

## 保存先

`reports/YYYY-MM-DD_daily.md` または `reports/YYYY-MM-DD_weekly.md`

## APIキーなしでも動く

`ANTHROPIC_API_KEY` が未設定の場合は Claude 整形なしのテンプレートを生成します。後でキーを設定すれば Claude が整形します。

## 依存パッケージ

なし（Node.js 標準モジュールのみ。API 呼び出しも `https` モジュールで実装）
