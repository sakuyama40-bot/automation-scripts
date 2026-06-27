#!/usr/bin/env node
'use strict';

const readline = require('readline');
const https    = require('https');
const fs       = require('fs');
const path     = require('path');

// ─── .env 読み込み（dotenvなし版） ───────────────────────────────
function loadEnv(dir) {
  const envPath = path.join(dir, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const idx = t.indexOf('=');
    if (idx === -1) continue;
    const key = t.slice(0, idx).trim();
    const val = t.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv(__dirname);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

// ─── 複数行入力（空行で終了） ─────────────────────────────────────
async function askLines(prompt) {
  console.log(prompt + '（1項目ずつEnter、空行で終了）');
  const items = [];
  while (true) {
    const line = (await ask('  > ')).trim();
    if (!line) break;
    items.push(line);
  }
  return items;
}

// ─── Claude API 呼び出し ──────────────────────────────────────────
function callClaude(apiKey, prompt) {
  const body = JSON.stringify({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 1024,
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
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.content?.[0]?.text) {
            resolve(parsed.content[0].text);
          } else {
            reject(new Error('API エラー: ' + data));
          }
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── 日付ユーティリティ ───────────────────────────────────────────
function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const days = ['日','月','火','水','木','金','土'];
  return `${y}年${m}月${d}日（${days[date.getDay()]}）`;
}
function fileDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function getWeekRange(date) {
  const d = new Date(date);
  const day = d.getDay();
  const mon = new Date(d); mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  const fri = new Date(mon); fri.setDate(mon.getDate() + 4);
  return `${formatDate(mon)} 〜 ${formatDate(fri)}`;
}

// ─── プロンプト生成 ───────────────────────────────────────────────
function buildPrompt(mode, data, today) {
  const dateStr = mode === 'daily' ? formatDate(today) : getWeekRange(today);
  const typeLabel = mode === 'daily' ? '日報' : '週報';

  const workList  = data.work.map(w => `- ${w}`).join('\n');
  const issueText = data.issues.length ? data.issues.map(i => `- ${i}`).join('\n') : 'なし';
  const nextList  = data.next.map(n => `- ${n}`).join('\n');

  return `あなたはビジネス文書の専門家です。以下の作業メモをもとに、読みやすい${typeLabel}のドラフトを日本語で作成してください。

## 入力情報

### ${mode === 'daily' ? '本日' : '今週'}の作業
${workList}

### 課題・ブロッカー
${issueText}

### ${mode === 'daily' ? '明日' : '来週'}の予定
${nextList}

## 出力形式（必ずこの形式で出力してください）

# ${typeLabel} - ${dateStr}

## ${mode === 'daily' ? '本日' : '今週'}の作業実績

（作業内容を整理して箇条書きで記載。略語があれば適切に補足する）

## 成果・進捗サマリー

（全体の進捗を2〜3文でまとめる。具体的な成果を強調する）

## 課題・懸念事項

（課題があれば記載、なければ「特になし」と記載）

## ${mode === 'daily' ? '明日' : '来週'}の予定

（予定を整理して箇条書きで記載）

---
※ このドラフトを確認・修正してから提出してください`;
}

// ─── フォールバック（APIキーなし時） ─────────────────────────────
function buildFallback(mode, data, today) {
  const dateStr   = mode === 'daily' ? formatDate(today) : getWeekRange(today);
  const typeLabel = mode === 'daily' ? '日報' : '週報';
  const workList  = data.work.map(w => `- ${w}`).join('\n');
  const issueText = data.issues.length ? data.issues.map(i => `- ${i}`).join('\n') : '特になし';
  const nextList  = data.next.map(n => `- ${n}`).join('\n');

  return `# ${typeLabel} - ${dateStr}

## ${mode === 'daily' ? '本日' : '今週'}の作業実績

${workList}

## 成果・進捗サマリー

TODO: 進捗サマリーを記入してください。

## 課題・懸念事項

${issueText}

## ${mode === 'daily' ? '明日' : '来週'}の予定

${nextList}

---
※ ANTHROPIC_API_KEY が未設定のため、テンプレートのみ生成しました
`;
}

// ─── ファイル保存 ─────────────────────────────────────────────────
function saveReport(content, mode, today) {
  const reportsDir = path.join(__dirname, 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });
  const suffix   = mode === 'daily' ? 'daily' : 'weekly';
  const filename = `${fileDate(today)}_${suffix}.md`;
  const filePath = path.join(reportsDir, filename);
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

// ─── メイン ──────────────────────────────────────────────────────
async function main() {
  console.log('\n========================================');
  console.log('  日報・週報 自動作成ツール');
  console.log('========================================\n');

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log('⚠️  ANTHROPIC_API_KEY が未設定です。テンプレートのみ生成します。');
    console.log('   .env に ANTHROPIC_API_KEY=sk-ant-... を設定すると Claude が整形します。\n');
  } else {
    console.log('✓ Claude API (claude-haiku-4-5) を使用して整形します。\n');
  }

  console.log('モードを選んでください:');
  console.log('  1. 日報（今日の作業）');
  console.log('  2. 週報（今週の作業）');
  const modeInput = (await ask('\n番号を入力 [1]: ')).trim() || '1';
  const mode = modeInput === '2' ? 'weekly' : 'daily';

  const today    = new Date();
  const dateStr  = mode === 'daily' ? formatDate(today) : getWeekRange(today);
  const nextLabel = mode === 'daily' ? '明日' : '来週';
  const nowLabel  = mode === 'daily' ? '本日' : '今週';

  console.log(`\n対象期間: ${dateStr}\n`);

  const work   = await askLines(`\n【${nowLabel}の作業内容】`);
  if (work.length === 0) { console.log('作業内容が入力されていません。終了します。'); rl.close(); return; }

  const issues = await askLines('\n【課題・ブロッカー】（なければそのまま空行）');
  const next   = await askLines(`\n【${nextLabel}の予定】`);

  rl.close();

  const data = { work, issues, next };

  let content;
  if (apiKey) {
    console.log('\nClaude が整形中...');
    try {
      const prompt = buildPrompt(mode, data, today);
      content = await callClaude(apiKey, prompt);
    } catch (err) {
      console.log('⚠️  API 呼び出し失敗。テンプレートで生成します。');
      console.log('   エラー:', err.message);
      content = buildFallback(mode, data, today);
    }
  } else {
    content = buildFallback(mode, data, today);
  }

  const filePath = saveReport(content, mode, today);

  console.log('\n─── 生成結果 ────────────────────────────');
  console.log(content);
  console.log('─────────────────────────────────────────\n');
  console.log(`✓ 保存先: ${filePath}`);
  console.log('\n完了！内容を確認・修正してから提出してください。\n');
}

main().catch(err => { console.error(err); rl.close(); process.exit(1); });
