#!/usr/bin/env node
'use strict';

const readline = require('readline');
const https    = require('https');
const fs       = require('fs');
const path     = require('path');

// ─── .env 読み込み ────────────────────────────────────────────────
function loadEnv(dir) {
  const p = path.join(dir, '.env');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const idx = t.indexOf('=');
    if (idx === -1) continue;
    const k = t.slice(0, idx).trim();
    const v = t.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnv(__dirname);

const rl  = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

// ─── 複数行入力（"---" 単独行 or 連続空行2回で終了） ─────────────
async function askMultiline(prompt) {
  console.log(prompt);
  console.log('（入力後、"---" 単独行または空行2回連続で終了）\n');
  const lines   = [];
  let emptyCount = 0;
  while (true) {
    const line = await ask('');
    if (line.trim() === '---') break;
    if (line.trim() === '') {
      emptyCount++;
      if (emptyCount >= 2) break;
      lines.push(line);
    } else {
      emptyCount = 0;
      lines.push(line);
    }
  }
  return lines.join('\n').trim();
}

// ─── 日付ユーティリティ ───────────────────────────────────────────
function formatDate(date) {
  const y    = date.getFullYear();
  const m    = String(date.getMonth() + 1).padStart(2, '0');
  const d    = String(date.getDate()).padStart(2, '0');
  const days = ['日','月','火','水','木','金','土'];
  return `${y}年${m}月${d}日（${days[date.getDay()]}）`;
}
function fileDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

// ─── Claude API ───────────────────────────────────────────────────
function callClaude(apiKey, prompt) {
  const body = JSON.stringify({
    model:      'claude-sonnet-4-6',
    max_tokens: 2000,
    messages:   [{ role: 'user', content: prompt }],
  });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.anthropic.com',
      path:     '/v1/messages',
      method:   'POST',
      headers:  {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length':    Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const p = JSON.parse(data);
          if (p.content?.[0]?.text) resolve(p.content[0].text);
          else reject(new Error('API エラー: ' + data));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── プロンプト：議事録 ───────────────────────────────────────────
function buildMinutesPrompt(raw, dateStr, meetingName) {
  return `あなたは議事録作成の専門家です。以下の生のメモを、読みやすい議事録に整形してください。
文体は簡潔・客観的な日本語ビジネス文書スタイルにしてください。

## 会議情報
- 日付: ${dateStr}
- 会議名: ${meetingName || '（メモから判断）'}

## 生のメモ
${raw}

## 出力形式（必ずこのMarkdown形式で出力してください）

# 議事録 - ${dateStr}${meetingName ? `\n## ${meetingName}` : ''}

## 出席者

（メモから出席者を抽出。不明なら「- TODO: 確認」）

## 議題

（メモから議題を番号付きリストで整理）

## 議事内容

（各議題の詳細を見出し付きで整理）

## 決定事項

（「〜に決定」「〜にする」「〜で合意」などをチェックボックス付きで箇条書き）

## ネクストアクション

（「〜してください」「〜をお願い」「〜を確認」などのアクションをチェックボックス付きで。担当者・期限があれば記載）

## 次回予定

（次の会議の予定があれば記載。なければ「未定」）

---
作成: ${dateStr} / Claude自動整形`;
}

// ─── プロンプト：タスクメモ ───────────────────────────────────────
function buildTaskPrompt(raw, dateStr) {
  return `あなたはプロジェクト管理の専門家です。以下の生のタスクメモを、優先度ごとに整理されたMarkdownタスクリストに整形してください。

## 日付
${dateStr}

## 生のメモ
${raw}

## 出力形式（必ずこのMarkdown形式で出力してください）

# タスクリスト - ${dateStr}

## 🔴 高優先度

（緊急・重要なタスクをチェックボックス付きで。担当者・期限があれば記載）

## 🟡 中優先度

（重要だが急ぎではないタスク）

## 🟢 低優先度 / 保留

（後回しにできるタスク）

## 📝 メモ・参考情報

（タスク以外のメモや参考情報）

---
作成: ${dateStr} / Claude自動整形`;
}

// ─── フォールバックテンプレート ───────────────────────────────────
function buildMinutesFallback(raw, dateStr, meetingName) {
  return `# 議事録 - ${dateStr}${meetingName ? `\n## ${meetingName}` : ''}

## 出席者

- TODO: 確認

## 議題

- TODO: 議題を記入

## 議事内容

${raw}

## 決定事項

- [ ] TODO: 決定事項を記入

## ネクストアクション

- [ ] TODO（担当: -、期限: -）

## 次回予定

未定

---
※ ANTHROPIC_API_KEY 未設定のためテンプレート生成
`;
}

function buildTaskFallback(raw, dateStr) {
  return `# タスクリスト - ${dateStr}

## 🔴 高優先度

- [ ] TODO

## 🟡 中優先度

- [ ] TODO

## 🟢 低優先度 / 保留

- [ ] TODO

## 📝 メモ・参考情報

${raw}

---
※ ANTHROPIC_API_KEY 未設定のためテンプレート生成
`;
}

// ─── ファイル保存 ─────────────────────────────────────────────────
function saveOutput(content, type, today) {
  const dir      = path.join(__dirname, 'outputs');
  fs.mkdirSync(dir, { recursive: true });
  const suffix   = type === 'minutes' ? 'meeting' : 'tasks';
  const filename = `${fileDate(today)}_${suffix}.md`;
  const filePath = path.join(dir, filename);

  // 同名ファイルが既にある場合は番号付き
  if (fs.existsSync(filePath)) {
    let i = 2;
    while (fs.existsSync(path.join(dir, `${fileDate(today)}_${suffix}_${i}.md`))) i++;
    const newPath = path.join(dir, `${fileDate(today)}_${suffix}_${i}.md`);
    fs.writeFileSync(newPath, content, 'utf8');
    return newPath;
  }

  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

// ─── メイン ──────────────────────────────────────────────────────
async function main() {
  console.log('\n========================================');
  console.log('  議事録・タスクメモ Markdown 整形ツール');
  console.log('========================================\n');

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log('⚠️  ANTHROPIC_API_KEY 未設定。テンプレートのみ生成します。\n');
  } else {
    console.log('✓ Claude (claude-sonnet-4-6) で整形します。\n');
  }

  // 種類選択
  console.log('種類を選んでください:');
  console.log('  1. 議事録（会議メモ → 出席者・決定事項・アクションに整理）');
  console.log('  2. タスクメモ（ランダムなメモ → 優先度別タスクリストに整理）');
  const typeChoice = (await ask('\n番号を入力 [1]: ')).trim() || '1';
  const type       = typeChoice === '2' ? 'tasks' : 'minutes';

  // 入力方法
  console.log('\n入力方法を選んでください:');
  console.log('  1. 直接入力（ターミナルに貼り付け）');
  console.log('  2. ファイルから読み込み');
  const inputChoice = (await ask('番号を入力 [1]: ')).trim() || '1';

  let raw = '';
  let meetingName = '';

  if (inputChoice === '2') {
    const filePath = (await ask('ファイルパスを入力: ')).trim();
    if (!fs.existsSync(filePath)) {
      console.log(`ファイルが見つかりません: ${filePath}`);
      rl.close(); return;
    }
    raw = fs.readFileSync(filePath, 'utf8');
    console.log(`  ✓ ${filePath} を読み込みました（${raw.split('\n').length}行）`);
  } else {
    if (type === 'minutes') {
      meetingName = (await ask('\n会議名（任意、Enterでスキップ）: ')).trim();
    }
    raw = await askMultiline('\nメモを入力してください:');
  }

  if (!raw.trim()) {
    console.log('\n入力がありません。終了します。');
    rl.close(); return;
  }

  rl.close();

  const today   = new Date();
  const dateStr = formatDate(today);

  // 整形
  let content;
  if (apiKey) {
    console.log('\nClaude が整形中...');
    try {
      const prompt = type === 'minutes'
        ? buildMinutesPrompt(raw, dateStr, meetingName)
        : buildTaskPrompt(raw, dateStr);
      content = await callClaude(apiKey, prompt);
    } catch (err) {
      console.log('⚠️  API 失敗。テンプレートで生成します。エラー:', err.message);
      content = type === 'minutes'
        ? buildMinutesFallback(raw, dateStr, meetingName)
        : buildTaskFallback(raw, dateStr);
    }
  } else {
    content = type === 'minutes'
      ? buildMinutesFallback(raw, dateStr, meetingName)
      : buildTaskFallback(raw, dateStr);
  }

  // 出力・保存
  console.log('\n─── 整形結果 ────────────────────────────');
  console.log(content);
  console.log('─────────────────────────────────────────');

  const filePath = saveOutput(content, type, today);
  console.log(`\n  ✓ 保存: ${filePath}`);
  console.log('\n完了！内容を確認・修正してください。\n');
}

main().catch(err => { console.error(err); rl.close(); process.exit(1); });
