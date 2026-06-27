#!/usr/bin/env node
'use strict';

const readline = require('readline');
const fs = require('fs');
const path = require('path');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

// ─── プロジェクト別テンプレート ───────────────────────────────────
const TEMPLATES = {
  '1': {
    label: '汎用スクリプト',
    vars: [
      { key: 'NODE_ENV',    example: 'development',  desc: '実行環境' },
      { key: 'PORT',        example: '3000',          desc: 'ポート番号' },
    ],
  },
  '2': {
    label: 'Express APIサーバー',
    vars: [
      { key: 'NODE_ENV',     example: 'development',       desc: '実行環境' },
      { key: 'PORT',         example: '3000',               desc: 'ポート番号' },
      { key: 'DATABASE_URL', example: 'postgresql://...',   desc: 'DB接続URL' },
      { key: 'JWT_SECRET',   example: 'your-secret-here',  desc: 'JWT署名キー' },
    ],
  },
  '3': {
    label: 'Gmail / メール連携',
    vars: [
      { key: 'GMAIL_USER',           example: 'you@gmail.com',  desc: 'Gmailアドレス' },
      { key: 'GMAIL_CLIENT_ID',      example: 'xxxxx.apps.googleusercontent.com', desc: 'OAuth クライアントID' },
      { key: 'GMAIL_CLIENT_SECRET',  example: 'your-secret',    desc: 'OAuth クライアントシークレット' },
      { key: 'GMAIL_REFRESH_TOKEN',  example: 'your-token',     desc: 'リフレッシュトークン' },
    ],
  },
  '4': {
    label: 'Google Drive / Calendar / Notion',
    vars: [
      { key: 'GOOGLE_CLIENT_ID',     example: 'xxxxx.apps.googleusercontent.com', desc: 'Google OAuth クライアントID' },
      { key: 'GOOGLE_CLIENT_SECRET', example: 'your-secret',    desc: 'Google クライアントシークレット' },
      { key: 'GOOGLE_REDIRECT_URI',  example: 'http://localhost:3000/callback', desc: 'リダイレクトURI' },
      { key: 'NOTION_API_KEY',       example: 'secret_xxxxx',   desc: 'Notion インテグレーションキー' },
      { key: 'NOTION_DATABASE_ID',   example: 'xxxxxxxx',       desc: 'Notion データベースID' },
    ],
  },
  '5': {
    label: 'フルセット（全部入り）',
    vars: [
      { key: 'NODE_ENV',             example: 'development',    desc: '実行環境' },
      { key: 'PORT',                 example: '3000',           desc: 'ポート番号' },
      { key: 'DATABASE_URL',         example: 'postgresql://...', desc: 'DB接続URL' },
      { key: 'JWT_SECRET',           example: 'your-secret',   desc: 'JWT署名キー' },
      { key: 'GMAIL_USER',           example: 'you@gmail.com', desc: 'Gmailアドレス' },
      { key: 'GMAIL_CLIENT_ID',      example: 'xxxxx.apps.googleusercontent.com', desc: 'OAuth クライアントID' },
      { key: 'GMAIL_CLIENT_SECRET',  example: 'your-secret',   desc: 'OAuth クライアントシークレット' },
      { key: 'GMAIL_REFRESH_TOKEN',  example: 'your-token',    desc: 'リフレッシュトークン' },
      { key: 'GOOGLE_CLIENT_ID',     example: 'xxxxx.apps.googleusercontent.com', desc: 'Google OAuth クライアントID' },
      { key: 'GOOGLE_CLIENT_SECRET', example: 'your-secret',   desc: 'Google クライアントシークレット' },
      { key: 'NOTION_API_KEY',       example: 'secret_xxxxx',  desc: 'Notion インテグレーションキー' },
    ],
  },
};

// ─── .env パーサー ────────────────────────────────────────────────
function parseEnv(filePath) {
  const entries = [];
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      entries.push({ type: 'comment', raw: line });
      continue;
    }
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) { entries.push({ type: 'comment', raw: line }); continue; }
    const key = line.slice(0, eqIdx).trim();
    const value = line.slice(eqIdx + 1).trim();
    entries.push({ type: 'var', key, value, raw: line });
  }
  return entries;
}

function getKeys(entries) {
  return entries.filter(e => e.type === 'var').map(e => e.key);
}

// ─── ファイル生成 ─────────────────────────────────────────────────
function buildEnvExample(vars) {
  const lines = ['# .env.example — .envにコピーして値を設定してください', ''];
  for (const v of vars) {
    if (v.desc) lines.push(`# ${v.desc}`);
    lines.push(`${v.key}=${v.example}`);
  }
  return lines.join('\n') + '\n';
}

function buildEnv(vars) {
  const lines = ['# .env — このファイルはGitにコミットしないこと', ''];
  for (const v of vars) {
    if (v.desc) lines.push(`# ${v.desc}`);
    lines.push(`${v.key}=`);
  }
  return lines.join('\n') + '\n';
}

// ─── モード1: 新規生成 ────────────────────────────────────────────
async function modeNew(targetDir) {
  console.log('\nプロジェクトタイプを選んでください:');
  for (const [k, v] of Object.entries(TEMPLATES)) console.log(`  ${k}. ${v.label}`);
  const choice = (await ask('\n番号を入力 [1]: ')).trim() || '1';
  const tmpl = TEMPLATES[choice] || TEMPLATES['1'];

  const envExamplePath = path.join(targetDir, '.env.example');
  const envPath = path.join(targetDir, '.env');

  const exampleExists = fs.existsSync(envExamplePath);
  const envExists = fs.existsSync(envPath);

  if (exampleExists || envExists) {
    const ans = (await ask('\n既存のファイルが見つかりました。上書きしますか？ [y/N]: ')).trim().toLowerCase();
    if (ans !== 'y') { console.log('キャンセルしました。'); return; }
  }

  fs.writeFileSync(envExamplePath, buildEnvExample(tmpl.vars), 'utf8');
  console.log(`  ✓ .env.example (${tmpl.vars.length}件)`);

  if (!envExists) {
    fs.writeFileSync(envPath, buildEnv(tmpl.vars), 'utf8');
    console.log(`  ✓ .env（値は空欄。直接入力してください）`);
  } else {
    console.log(`  - .env は既存のため変更なし`);
  }
}

// ─── モード2: .env → .env.example 同期 ───────────────────────────
async function modeSync(targetDir) {
  const envPath = path.join(targetDir, '.env');
  if (!fs.existsSync(envPath)) {
    console.log(`\nエラー: .env が見つかりません（${envPath}）`);
    return;
  }

  const entries = parseEnv(envPath);
  const examplePath = path.join(targetDir, '.env.example');

  // 既存の.env.exampleがあれば読み込んでコメントを保持
  const existingKeys = fs.existsSync(examplePath)
    ? getKeys(parseEnv(examplePath))
    : [];
  const currentKeys = getKeys(entries);

  const added   = currentKeys.filter(k => !existingKeys.includes(k));
  const removed = existingKeys.filter(k => !currentKeys.includes(k));

  if (added.length === 0 && removed.length === 0) {
    console.log('\n.env と .env.example は同期済みです。変更なし。');
    return;
  }

  console.log('\n差分を検出しました:');
  if (added.length)   console.log(`  追加  (+): ${added.join(', ')}`);
  if (removed.length) console.log(`  削除  (-): ${removed.join(', ')}`);

  const ans = (await ask('\n.env.example を更新しますか？ [Y/n]: ')).trim().toLowerCase();
  if (ans === 'n') { console.log('キャンセルしました。'); return; }

  // 値をマスクして .env.example を再生成
  const lines = ['# .env.example — .envにコピーして値を設定してください', ''];
  for (const entry of entries) {
    if (entry.type === 'comment') { lines.push(entry.raw); continue; }
    // 値をサンプル文字列に置き換え（実際の値は残さない）
    const maskedValue = entry.value ? `your-${entry.key.toLowerCase().replace(/_/g, '-')}` : '';
    lines.push(`${entry.key}=${maskedValue}`);
  }

  fs.writeFileSync(examplePath, lines.join('\n') + '\n', 'utf8');
  console.log(`  ✓ .env.example を更新しました`);
}

// ─── モード3: 差分チェック ────────────────────────────────────────
function modeCheck(targetDir) {
  const envPath     = path.join(targetDir, '.env');
  const examplePath = path.join(targetDir, '.env.example');

  const envExists     = fs.existsSync(envPath);
  const exampleExists = fs.existsSync(examplePath);

  if (!envExists && !exampleExists) {
    console.log('\n.env も .env.example も見つかりません。');
    return;
  }

  const envKeys     = envExists     ? getKeys(parseEnv(envPath))     : [];
  const exampleKeys = exampleExists ? getKeys(parseEnv(examplePath)) : [];

  const onlyInEnv     = envKeys.filter(k => !exampleKeys.includes(k));
  const onlyInExample = exampleKeys.filter(k => !envKeys.includes(k));
  const inBoth        = envKeys.filter(k => exampleKeys.includes(k));

  console.log('\n─── .env チェック結果 ─────────────────────');
  console.log(`  共通キー数   : ${inBoth.length}`);

  if (onlyInEnv.length) {
    console.log(`\n  .envにあるが .env.example にない（要追加）:`);
    onlyInEnv.forEach(k => console.log(`    + ${k}`));
  }
  if (onlyInExample.length) {
    console.log(`\n  .env.exampleにあるが .env にない（未設定）:`);
    onlyInExample.forEach(k => console.log(`    - ${k}`));
  }
  if (onlyInEnv.length === 0 && onlyInExample.length === 0) {
    console.log(`\n  同期済みです。差分なし。`);
  }

  // 空のキーチェック
  if (envExists) {
    const emptyKeys = parseEnv(envPath).filter(e => e.type === 'var' && !e.value).map(e => e.key);
    if (emptyKeys.length) {
      console.log(`\n  .env で値が空のキー（要設定）:`);
      emptyKeys.forEach(k => console.log(`    ! ${k}`));
    }
  }
  console.log('──────────────────────────────────────────');
}

// ─── メイン ──────────────────────────────────────────────────────
async function main() {
  console.log('\n========================================');
  console.log('  .env 管理ツール');
  console.log('========================================\n');

  console.log('モードを選んでください:');
  console.log('  1. 新規生成（プロジェクトタイプ別テンプレートから作成）');
  console.log('  2. 同期（.env の内容を .env.example に反映・値はマスク）');
  console.log('  3. 差分チェック（.env と .env.example のズレを確認）');

  const mode = (await ask('\n番号を入力 [1]: ')).trim() || '1';
  const dir  = (await ask('対象ディレクトリ [.]: ')).trim() || '.';
  const targetDir = path.resolve(dir);

  if (!fs.existsSync(targetDir)) {
    console.log(`\nエラー: ディレクトリが見つかりません（${targetDir}）`);
    rl.close();
    return;
  }

  console.log(`\n対象: ${targetDir}\n`);

  rl.close();

  if (mode === '1') await modeNew(targetDir);
  else if (mode === '2') await modeSync(targetDir);
  else if (mode === '3') modeCheck(targetDir);
  else { console.log('無効な番号です。'); return; }

  console.log('\n完了！\n');
}

main().catch(err => { console.error(err); rl.close(); process.exit(1); });
