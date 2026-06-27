#!/usr/bin/env node
'use strict';

const readline     = require('readline');
const https        = require('https');
const fs           = require('fs');
const path         = require('path');
const { execSync } = require('child_process');

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
const askDefault = async (prompt, def) => (await ask(`${prompt} [${def}]: `)).trim() || def;

// ─── git ヘルパー ─────────────────────────────────────────────────
function git(cmd, cwd) {
  try {
    return execSync(`git ${cmd}`, { cwd, encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }).trim();
  } catch { return null; }
}

function getCurrentBranch(dir)  { return git('rev-parse --abbrev-ref HEAD', dir); }
function getDefaultBranch(dir)  {
  // origin/HEAD → origin/main などから取得
  const ref = git('symbolic-ref refs/remotes/origin/HEAD --short', dir);
  if (ref) return ref.replace('origin/', '');
  // フォールバック: main or master
  const branches = git('branch', dir) || '';
  return branches.includes('main') ? 'main' : 'master';
}
function getRemoteUrl(dir)      { return git('remote get-url origin', dir); }

// ─── diff 取得（大きい場合はトリミング） ─────────────────────────
const MAX_DIFF_LINES = 400;

function getDiff(dir, base, head) {
  const range = `${base}...${head}`;

  // 変更ファイル一覧
  const files = git(`diff --name-status ${range}`, dir) || '';

  // 統計情報
  const stat  = git(`diff --stat ${range}`, dir) || '';

  // 全 diff
  const full  = git(`diff ${range}`, dir) || '';
  const lines = full.split('\n');

  let diff    = full;
  let trimmed = false;

  if (lines.length > MAX_DIFF_LINES) {
    diff    = lines.slice(0, MAX_DIFF_LINES).join('\n');
    trimmed = true;
  }

  return { files, stat, diff, trimmed, totalLines: lines.length };
}

// ─── コミット一覧取得 ─────────────────────────────────────────────
function getCommits(dir, base, head) {
  const raw = git(`log ${base}...${head} --pretty=format:"%s" --no-merges`, dir);
  return raw ? raw.split('\n').filter(Boolean) : [];
}

// ─── GitHub PR URL 生成（任意） ───────────────────────────────────
function buildPrUrl(remoteUrl, base, head) {
  if (!remoteUrl) return null;
  const m = remoteUrl.match(/github\.com[:/](.+?)(?:\.git)?$/);
  if (!m) return null;
  return `https://github.com/${m[1]}/compare/${base}...${head}?expand=1`;
}

// ─── Claude API 呼び出し ──────────────────────────────────────────
function callClaude(apiKey, prompt) {
  const body = JSON.stringify({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 1500,
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

// ─── Claude プロンプト生成 ────────────────────────────────────────
function buildPrompt(data) {
  const commitList = data.commits.map(c => `- ${c}`).join('\n') || '- （コミットなし）';
  const diffBlock  = data.trimmed
    ? `${data.diff}\n\n...(差分が大きいため ${MAX_DIFF_LINES} 行で省略。全体は ${data.totalLines} 行)`
    : data.diff;

  return `あなたはGitHub Pull Requestの説明文を書く専門家です。以下のgit情報をもとに、日本語で実用的なPR説明文を作成してください。

## ブランチ情報
- ベースブランチ: ${data.base}
- 作業ブランチ: ${data.head}

## コミット一覧
${commitList}

## 変更ファイル
\`\`\`
${data.files || '（変更なし）'}
\`\`\`

## 変更統計
\`\`\`
${data.stat || '（統計なし）'}
\`\`\`

## git diff（抜粋）
\`\`\`diff
${diffBlock || '（差分なし）'}
\`\`\`

## 出力形式（必ずこのMarkdown形式で出力してください）

## 概要

（変更の目的・背景を2〜3文で。「何を・なぜ」を明確に）

## 変更内容

（変更点を箇条書きで。ファイル名や関数名を具体的に含める）

## テスト手順

（レビュアーが動作確認できる手順を箇条書きで）

## 注意事項

（破壊的変更・依存関係・副作用など。なければ「特になし」と記載）`;
}

// ─── フォールバックテンプレート ───────────────────────────────────
function buildFallback(data) {
  const commitList = data.commits.map(c => `- ${c}`).join('\n') || '- TODO';
  return `## 概要

TODO: 変更の目的・背景を記入してください。

## 変更内容

${commitList}

## テスト手順

- [ ] TODO: 動作確認手順を記入してください

## 注意事項

特になし

---
※ ANTHROPIC_API_KEY 未設定のためテンプレート生成
`;
}

// ─── メイン ──────────────────────────────────────────────────────
async function main() {
  console.log('\n========================================');
  console.log('  PR 説明文 自動生成ツール');
  console.log('========================================\n');

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log('⚠️  ANTHROPIC_API_KEY 未設定。テンプレートのみ生成します。\n');
  } else {
    console.log('✓ Claude API (claude-haiku-4-5) で生成します。\n');
  }

  const dir    = (await ask('対象リポジトリのパス [.]: ')).trim() || '.';
  const repoDir = path.resolve(dir);

  if (!git('rev-parse --git-dir', repoDir)) {
    console.log(`\nエラー: git リポジトリが見つかりません（${repoDir}）`);
    rl.close(); return;
  }

  const currentBranch = getCurrentBranch(repoDir);
  const defaultBranch = getDefaultBranch(repoDir);
  const remoteUrl     = getRemoteUrl(repoDir);

  console.log(`現在のブランチ: ${currentBranch}`);
  console.log(`デフォルトブランチ: ${defaultBranch}\n`);

  const base = await askDefault('ベースブランチ（比較元）', defaultBranch);
  const head = await askDefault('作業ブランチ（比較先）',   currentBranch);

  rl.close();

  // git 情報収集
  console.log('\ngit 情報を収集中...');
  const diffData = getDiff(repoDir, base, head);
  const commits  = getCommits(repoDir, base, head);

  console.log(`  コミット数: ${commits.length}`);
  console.log(`  変更ファイル:\n${diffData.files.split('\n').map(l => '    ' + l).join('\n')}`);
  if (diffData.trimmed) {
    console.log(`  ⚠️  差分が大きいため ${MAX_DIFF_LINES} 行に省略（全体: ${diffData.totalLines} 行）`);
  }

  if (commits.length === 0 && !diffData.diff) {
    console.log('\n差分がありません。ブランチ名を確認してください。');
    return;
  }

  const data = { base, head, commits, ...diffData };

  // PR 説明文生成
  let content;
  if (apiKey) {
    console.log('\nClaude が PR 説明文を生成中...');
    try {
      content = await callClaude(apiKey, buildPrompt(data));
    } catch (err) {
      console.log('⚠️  API 失敗。テンプレートで生成します。エラー:', err.message);
      content = buildFallback(data);
    }
  } else {
    content = buildFallback(data);
  }

  // 出力
  console.log('\n─── 生成された PR 説明文 ───────────────');
  console.log(content);
  console.log('─────────────────────────────────────────');

  // ファイル保存
  const today    = new Date().toISOString().slice(0, 10);
  const filename = `pr-${head.replace(/[^a-zA-Z0-9-]/g, '-')}-${today}.md`;
  const outPath  = path.join(repoDir, filename);
  fs.writeFileSync(outPath, content, 'utf8');
  console.log(`\n  ✓ 保存: ${outPath}`);

  // GitHub PR URL
  const prUrl = buildPrUrl(remoteUrl, base, head);
  if (prUrl) {
    console.log(`\n  GitHub でPRを作成:`);
    console.log(`  ${prUrl}`);
  }

  console.log('\n完了！内容を確認・修正してからPRに貼り付けてください。\n');
}

main().catch(err => { console.error(err); rl.close(); process.exit(1); });
