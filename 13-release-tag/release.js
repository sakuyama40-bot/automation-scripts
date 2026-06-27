#!/usr/bin/env node
'use strict';

const readline     = require('readline');
const fs           = require('fs');
const path         = require('path');
const { execSync } = require('child_process');

const rl  = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

// ─── Conventional Commits 種別 ───────────────────────────────────
const COMMIT_TYPES = {
  feat:     { emoji: '✨', label: '追加 (Features)' },
  fix:      { emoji: '🐛', label: 'バグ修正 (Bug Fixes)' },
  docs:     { emoji: '📚', label: 'ドキュメント (Docs)' },
  refactor: { emoji: '♻️',  label: 'リファクタリング' },
  perf:     { emoji: '⚡', label: 'パフォーマンス' },
  test:     { emoji: '🧪', label: 'テスト' },
  style:    { emoji: '💄', label: 'スタイル' },
  ci:       { emoji: '⚙️',  label: 'CI' },
  build:    { emoji: '📦', label: 'ビルド' },
  chore:    { emoji: '🔧', label: 'その他 (Chores)' },
  revert:   { emoji: '⏪', label: 'リバート' },
};

// ─── Semver ヘルパー ─────────────────────────────────────────────
function parseSemver(v) {
  const m = String(v || '').replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)/);
  return m ? { major: +m[1], minor: +m[2], patch: +m[3] } : null;
}

function bumpVersion(current, type) {
  const v = parseSemver(current);
  if (!v) return '0.1.0';
  if (type === 'major') return `${v.major + 1}.0.0`;
  if (type === 'minor') return `${v.major}.${v.minor + 1}.0`;
  return `${v.major}.${v.minor}.${v.patch + 1}`;
}

// ─── git ヘルパー ────────────────────────────────────────────────
function git(cmd, cwd) {
  return execSync(`git ${cmd}`, { cwd, encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }).trim();
}

function getLatestTag(cwd) {
  try {
    return git('describe --tags --abbrev=0', cwd);
  } catch {
    return null;
  }
}

function hasUncommitted(cwd) {
  try {
    return git('status --porcelain', cwd).length > 0;
  } catch {
    return false;
  }
}

function getCommitsSince(cwd, since) {
  const range  = since ? `${since}..HEAD` : 'HEAD';
  const format = '--pretty=format:%H|||%s';
  try {
    const out = git(`log ${range} ${format}`, cwd);
    if (!out) return [];
    return out.split('\n').filter(Boolean).map(line => {
      const [hash, ...rest] = line.split('|||');
      return { hash: hash.slice(0, 7), subject: rest.join('|||') };
    });
  } catch {
    return [];
  }
}

// ─── コミットをタイプ別に分類 ────────────────────────────────────
const SUBJECT_RE = /^(\w+)(\([^)]+\))?(!)?: (.+)/;

function classifyCommits(commits) {
  const groups = {};
  const unknown = [];
  for (const c of commits) {
    const m = c.subject.match(SUBJECT_RE);
    if (!m) { unknown.push(c); continue; }
    const type = m[1].toLowerCase();
    if (!groups[type]) groups[type] = [];
    groups[type].push({ ...c, scope: m[2], breaking: !!m[3], desc: m[4] });
  }
  return { groups, unknown };
}

// ─── CHANGELOG エントリ生成 ──────────────────────────────────────
function buildChangelogEntry(version, today, commits) {
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');

  const { groups, unknown } = classifyCommits(commits);
  const lines = [`## [${version}] - ${y}-${m}-${d}`, ``];

  // 既知タイプを定義順に出力
  for (const [type, info] of Object.entries(COMMIT_TYPES)) {
    const entries = groups[type];
    if (!entries?.length) continue;
    lines.push(`### ${info.emoji} ${info.label}`, ``);
    for (const e of entries) {
      const scope = e.scope ? ` ${e.scope}` : '';
      const brk   = e.breaking ? ' **BREAKING CHANGE**' : '';
      lines.push(`- ${e.desc}${scope}${brk} (\`${e.hash}\`)`);
    }
    lines.push(``);
  }

  // 未分類
  if (unknown.length > 0) {
    lines.push(`### 📝 その他`, ``);
    for (const c of unknown) lines.push(`- ${c.subject} (\`${c.hash}\`)`);
    lines.push(``);
  }

  return lines.join('\n');
}

// ─── CHANGELOG.md 先頭に挿入 ────────────────────────────────────
function prependChangelog(projDir, entry) {
  const clPath  = path.join(projDir, 'CHANGELOG.md');
  const header  = `# Changelog\n\nAll notable changes to this project will be documented in this file.\n\n`;

  if (!fs.existsSync(clPath)) {
    fs.writeFileSync(clPath, header + entry, 'utf8');
    return false;
  }

  const existing = fs.readFileSync(clPath, 'utf8');
  // ヘッダー行の後ろに挿入
  const headerEnd = existing.indexOf('\n## ');
  if (headerEnd === -1) {
    fs.writeFileSync(clPath, existing.trimEnd() + '\n\n' + entry, 'utf8');
  } else {
    fs.writeFileSync(clPath, existing.slice(0, headerEnd + 1) + '\n' + entry + existing.slice(headerEnd + 1), 'utf8');
  }
  return true;
}

// ─── package.json バージョン更新 ────────────────────────────────
function updatePackageVersion(projDir, newVersion) {
  const pkgPath = path.join(projDir, 'package.json');
  const pkg     = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const old     = pkg.version || '0.0.0';
  pkg.version   = newVersion;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  return old;
}

// ─── メイン ──────────────────────────────────────────────────────
async function main() {
  console.log('\n========================================');
  console.log('  リリースタグ 自動作成ツール');
  console.log('========================================\n');

  const dir     = (await ask('対象プロジェクトのパス [.]: ')).trim() || '.';
  const projDir = path.resolve(dir);

  if (!fs.existsSync(path.join(projDir, 'package.json'))) {
    console.log(`\nエラー: package.json が見つかりません（${projDir}）`);
    rl.close(); return;
  }

  // 現在バージョン確認
  const pkg        = JSON.parse(fs.readFileSync(path.join(projDir, 'package.json'), 'utf8'));
  const latestTag  = getLatestTag(projDir);
  const curVersion = latestTag?.replace(/^v/, '') || pkg.version || '0.0.0';
  console.log(`\n  現在バージョン : ${curVersion}${latestTag ? ` (タグ: ${latestTag})` : ' (タグなし)'}`);

  // 未コミット変更確認
  if (hasUncommitted(projDir)) {
    console.log('\n  ⚠️  未コミットの変更があります。');
    const cont = (await ask('  続行しますか？ [y/N]: ')).trim().toLowerCase();
    if (cont !== 'y') { rl.close(); return; }
  }

  // バンプタイプ選択
  console.log('\nバージョンの上げ方を選んでください:');
  console.log(`  1. patch  → ${bumpVersion(curVersion, 'patch')}  （バグ修正）`);
  console.log(`  2. minor  → ${bumpVersion(curVersion, 'minor')}  （機能追加）`);
  console.log(`  3. major  → ${bumpVersion(curVersion, 'major')}  （破壊的変更）`);
  console.log(`  4. 手動入力`);

  const bumpChoice = (await ask('\n番号を入力 [1]: ')).trim() || '1';
  let newVersion;
  if (bumpChoice === '4') {
    const manual = (await ask('  新しいバージョン: ')).trim().replace(/^v/, '');
    newVersion = parseSemver(manual) ? manual : null;
    if (!newVersion) { console.log('  無効なバージョン形式です。'); rl.close(); return; }
  } else {
    const typeMap = { '1': 'patch', '2': 'minor', '3': 'major' };
    newVersion = bumpVersion(curVersion, typeMap[bumpChoice] || 'patch');
  }

  console.log(`\n  新バージョン   : v${newVersion}`);

  // コミット取得・表示
  const commits = getCommitsSince(projDir, latestTag);
  const { groups, unknown } = classifyCommits(commits);
  const totalCommits = commits.length;

  console.log(`\n  含まれるコミット: ${totalCommits}件`);
  if (totalCommits > 0) {
    for (const [type, info] of Object.entries(COMMIT_TYPES)) {
      const cnt = groups[type]?.length || 0;
      if (cnt > 0) console.log(`    ${info.emoji} ${type}: ${cnt}件`);
    }
    if (unknown.length > 0) console.log(`    📝 その他: ${unknown.length}件`);
  }

  // タグメッセージ
  const tagMsg = (await ask(`\nタグメッセージ [Release v${newVersion}]: `)).trim() || `Release v${newVersion}`;

  // push 確認
  const doPush = (await ask('リリース後に git push --tags を実行しますか？ [y/N]: ')).trim().toLowerCase();

  rl.close();

  // ─── 実行フェーズ ────────────────────────────────────────────
  console.log('\n─── 実行中 ──────────────────────────────');

  // 1. package.json 更新
  const oldVersion = updatePackageVersion(projDir, newVersion);
  console.log(`  ✓ package.json: ${oldVersion} → ${newVersion}`);

  // 2. CHANGELOG.md 更新
  const entry    = buildChangelogEntry(newVersion, new Date(), commits);
  const clExisted = prependChangelog(projDir, entry);
  console.log(`  ✓ CHANGELOG.md ${clExisted ? '更新' : '新規作成'}`);

  // 3. git add
  git('add package.json CHANGELOG.md', projDir);
  console.log('  ✓ git add package.json CHANGELOG.md');

  // 4. git commit
  git(`commit -m "chore: release v${newVersion}"`, projDir);
  console.log(`  ✓ git commit "chore: release v${newVersion}"`);

  // 5. git tag
  git(`tag -a "v${newVersion}" -m "${tagMsg}"`, projDir);
  console.log(`  ✓ git tag v${newVersion}`);

  // 6. push（任意）
  if (doPush === 'y') {
    console.log('  pushしています...');
    const branch = git('rev-parse --abbrev-ref HEAD', projDir);
    execSync(`git push origin ${branch}`, { cwd: projDir, stdio: 'inherit' });
    execSync(`git push origin v${newVersion}`, { cwd: projDir, stdio: 'inherit' });
    console.log(`  ✓ git push origin ${branch} && git push origin v${newVersion}`);
  }

  console.log('──────────────────────────────────────────');
  console.log(`\n  🚀 v${newVersion} リリース完了！`);
  if (doPush !== 'y') {
    console.log(`\n  後で push する場合:`);
    const branch = (() => { try { return git('rev-parse --abbrev-ref HEAD', projDir); } catch { return 'main'; } })();
    console.log(`    git push origin ${branch}`);
    console.log(`    git push origin v${newVersion}`);
  }
  console.log('');
}

main().catch(err => { console.error(err); rl.close(); process.exit(1); });
