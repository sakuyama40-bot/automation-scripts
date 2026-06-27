#!/usr/bin/env node
'use strict';

const readline     = require('readline');
const fs           = require('fs');
const path         = require('path');
const { execSync } = require('child_process');

const rl  = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (prompt) => new Promise(resolve => rl.question(prompt, resolve));
const askDefault = async (prompt, def) => (await ask(`${prompt} [${def}]: `)).trim() || def;

// ─── Conventional Commits 検証ロジック（依存なし） ────────────────
const VALID_TYPES = ['feat','fix','docs','style','refactor','test','chore','perf','ci','build','revert'];

// type(scope)!: subject
const CONV_RE = /^(\w+)(\([^)]+\))?(!)?: .+/;

function validateMessage(msg) {
  const firstLine = msg.split(/\r?\n/)[0].trim();
  const errors    = [];
  const warnings  = [];

  if (!firstLine) {
    errors.push('コミットメッセージが空です');
    return { valid: false, errors, warnings, firstLine };
  }

  const match = firstLine.match(CONV_RE);
  if (!match) {
    errors.push(`形式が違います。正しい形式: <type>(<scope>): <subject>`);
    errors.push(`  例: feat: ログイン機能を追加`);
    errors.push(`      fix(auth): トークン検証のバグを修正`);
    return { valid: false, errors, warnings, firstLine };
  }

  const type    = match[1];
  const subject = firstLine.replace(CONV_RE, (_, t, s, b) => '').slice(2).trim();

  if (!VALID_TYPES.includes(type)) {
    errors.push(`type "${type}" は未定義です。`);
    errors.push(`  使用可能: ${VALID_TYPES.join(', ')}`);
  }

  if (firstLine.length > 100) {
    warnings.push(`メッセージが長すぎます（${firstLine.length}文字 > 100文字推奨）`);
  }

  if (subject && /^[A-Z]/.test(subject)) {
    warnings.push(`subject の先頭は小文字推奨です（"${subject.slice(0,20)}..."）`);
  }

  if (subject && subject.endsWith('.')) {
    warnings.push(`subject の末尾にピリオドは不要です`);
  }

  return { valid: errors.length === 0, errors, warnings, firstLine, type };
}

// ─── git コマンド ─────────────────────────────────────────────────
function git(cmd, cwd) {
  try { return execSync(`git ${cmd}`, { cwd, encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }).trim(); }
  catch { return null; }
}

function run(cmd, cwd) {
  console.log(`  $ ${cmd}`);
  execSync(cmd, { cwd, stdio: 'inherit' });
}

// ─── モード1: セットアップ ────────────────────────────────────────
async function modeSetup(projDir) {
  const pkgPath = path.join(projDir, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    console.log(`\nエラー: package.json が見つかりません（${projDir}）`);
    return;
  }

  const pkg        = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const hasHusky   = !!(pkg.devDependencies?.husky || pkg.dependencies?.husky);
  const hasCommitlint = !!(pkg.devDependencies?.['@commitlint/cli']);

  console.log(`\n対象: ${projDir}`);
  console.log(`husky:      ${hasHusky        ? '✓ インストール済み' : '✗ 未インストール'}`);
  console.log(`commitlint: ${hasCommitlint   ? '✓ インストール済み' : '✗ 未インストール'}`);

  if (hasCommitlint) {
    const redo = (await ask('\ncommitlint はすでに設定されています。再セットアップしますか？ [y/N]: ')).trim().toLowerCase();
    if (redo !== 'y') return;
  }

  // commitlint 設定のカスタマイズ
  console.log('\n追加ルールを設定しますか？');
  console.log('  1. デフォルト（conventional commits 標準）');
  console.log('  2. 日本語 subject を許可（WIP・修正中などのプレフィックス許可）');
  const ruleChoice = (await ask('番号を入力 [1]: ')).trim() || '1';

  const confirm = (await ask('\n npm install を実行します。続けますか？ [y/N]: ')).trim().toLowerCase();
  if (confirm !== 'y') { console.log('キャンセルしました。'); return; }

  // インストール
  console.log('\n─── パッケージインストール ──────────────');
  run('npm install --save-dev @commitlint/cli @commitlint/config-conventional', projDir);

  // commitlint 設定ファイル生成
  console.log('\n─── 設定ファイル生成 ────────────────────');
  const configPath = path.join(projDir, 'commitlint.config.js');

  const extraRules = ruleChoice === '2'
    ? `  'subject-case': [0],           // 大文字小文字チェックを無効（日本語対応）\n  `
    : `  `;

  const configContent = `/** @type {import('@commitlint/types').UserConfig} */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    ${extraRules}'type-enum': [2, 'always', [
      'feat', 'fix', 'docs', 'style', 'refactor',
      'test', 'chore', 'perf', 'ci', 'build', 'revert',
    ]],
    'subject-max-length': [1, 'always', 100],
  },
};
`;
  fs.writeFileSync(configPath, configContent, 'utf8');
  console.log('  ✓ commitlint.config.js を生成しました');

  // commit-msg フック設定
  console.log('\n─── commit-msg フック設定 ───────────────');
  const hookContent = 'npx --no -- commitlint --edit "$1"\n';

  if (hasHusky) {
    // husky v9 経由
    const huskyDir  = path.join(projDir, '.husky');
    fs.mkdirSync(huskyDir, { recursive: true });
    const hookPath  = path.join(huskyDir, 'commit-msg');
    fs.writeFileSync(hookPath, hookContent, 'utf8');
    try { fs.chmodSync(hookPath, '755'); } catch {}
    console.log('  ✓ .husky/commit-msg を設定しました（husky 経由）');
  } else {
    // git hooks 直接
    const gitHooksDir = path.join(projDir, '.git', 'hooks');
    if (fs.existsSync(gitHooksDir)) {
      const hookPath = path.join(gitHooksDir, 'commit-msg');
      fs.writeFileSync(hookPath, `#!/bin/sh\n${hookContent}`, 'utf8');
      try { fs.chmodSync(hookPath, '755'); } catch {}
      console.log('  ✓ .git/hooks/commit-msg を設定しました（git hooks 直接）');
      console.log('  ℹ️  husky を使う場合は 08-husky-setup を先に実行してください');
    } else {
      console.log('  ⚠️  .git/hooks/ が見つかりません。git init 済みか確認してください');
    }
  }

  console.log('\n========================================');
  console.log('  セットアップ完了！');
  console.log('========================================\n');
  console.log('次回から git commit 時にメッセージが自動チェックされます。');
  console.log('\n有効なコミットメッセージの例:');
  VALID_TYPES.slice(0,4).forEach(t => console.log(`  ${t}: 変更内容を簡潔に説明`));
  console.log('  feat(scope): スコープ付きの例\n');
}

// ─── モード2: メッセージ単体検証 ─────────────────────────────────
async function modeCheck() {
  console.log('\nコミットメッセージを入力してください（複数行はCtrl+D/Ctrl+Zで終了）:');
  const msg = (await ask('> ')).trim();
  if (!msg) { console.log('入力がありません。'); return; }

  const result = validateMessage(msg);
  console.log('\n─── 検証結果 ────────────────────────────');

  if (result.valid) {
    console.log(`  ✓ OK: "${result.firstLine}"`);
    if (result.type) console.log(`     type: ${result.type}`);
  } else {
    console.log(`  ✗ NG: "${result.firstLine}"`);
    result.errors.forEach(e => console.log(`     エラー: ${e}`));
  }

  if (result.warnings.length) {
    result.warnings.forEach(w => console.log(`  ⚠️  警告: ${w}`));
  }

  console.log('──────────────────────────────────────────\n');
  console.log('使用可能な type 一覧:');
  const typeDescs = {
    feat: '新機能', fix: 'バグ修正', docs: 'ドキュメント', style: '書式', refactor: 'リファクタリング',
    test: 'テスト', chore: 'メンテ', perf: '性能改善', ci: 'CI/CD', build: 'ビルド', revert: '取り消し',
  };
  VALID_TYPES.forEach(t => console.log(`  ${t.padEnd(10)} ${typeDescs[t]}`));
}

// ─── モード3: 既存コミット履歴の一括監査 ─────────────────────────
async function modeAudit(dir) {
  const repoDir = path.resolve(dir);
  const raw     = git(`log --pretty=format:"%s" -30 --no-merges`, repoDir);

  if (!raw) { console.log('\ngit log が取得できませんでした。'); return; }

  const msgs   = raw.split('\n').filter(Boolean);
  const results = msgs.map(msg => ({ msg, ...validateMessage(msg) }));

  const passed  = results.filter(r => r.valid);
  const failed  = results.filter(r => !r.valid);

  console.log(`\n─── 直近${msgs.length}件のコミット監査結果 ─────`);
  console.log(`  ✓ 合格: ${passed.length} 件`);
  console.log(`  ✗ 違反: ${failed.length} 件\n`);

  results.forEach(r => {
    const icon = r.valid ? '✓' : '✗';
    console.log(`  ${icon} ${r.firstLine}`);
    if (!r.valid) r.errors.forEach(e => console.log(`      → ${e}`));
    if (r.warnings.length) r.warnings.forEach(w => console.log(`      ⚠ ${w}`));
  });

  console.log('──────────────────────────────────────────');

  if (failed.length === 0) {
    console.log('\n全コミットが conventional commits に準拠しています！');
  } else {
    console.log(`\n${failed.length} 件が非準拠です。`);
    console.log('セットアップ（モード1）を実行すると今後のコミットが自動チェックされます。');
  }
}

// ─── メイン ──────────────────────────────────────────────────────
async function main() {
  console.log('\n========================================');
  console.log('  commitlint — コミットメッセージ規約ツール');
  console.log('========================================\n');

  console.log('モードを選んでください:');
  console.log('  1. セットアップ（npm install + commit-msg フック設定）');
  console.log('  2. メッセージ検証（1件チェック・依存なし）');
  console.log('  3. 履歴監査（直近30件を一括チェック）');

  const mode = (await ask('\n番号を入力 [2]: ')).trim() || '2';

  if (mode === '1') {
    const dir = (await ask('対象プロジェクトのパス [.]: ')).trim() || '.';
    rl.close();
    await modeSetup(path.resolve(dir));
  } else if (mode === '2') {
    rl.close();
    await modeCheck();
  } else if (mode === '3') {
    const dir = (await ask('対象リポジトリのパス [.]: ')).trim() || '.';
    rl.close();
    await modeAudit(dir);
  } else {
    console.log('無効な番号です。');
    rl.close();
  }

  console.log('完了！\n');
}

main().catch(err => { console.error(err); rl.close(); process.exit(1); });
