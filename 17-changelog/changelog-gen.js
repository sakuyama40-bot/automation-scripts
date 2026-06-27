#!/usr/bin/env node
'use strict';

const readline    = require('readline');
const fs          = require('fs');
const path        = require('path');
const { execSync } = require('child_process');

const rl  = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (prompt) => new Promise(resolve => rl.question(prompt, resolve));
const askDefault = async (prompt, def) => (await ask(`${prompt} [${def}]: `)).trim() || def;

// ─── Conventional Commits 分類マップ ─────────────────────────────
const TYPE_MAP = {
  feat:     { label: '追加 (Features)',          emoji: '✨' },
  fix:      { label: '修正 (Bug Fixes)',          emoji: '🐛' },
  docs:     { label: 'ドキュメント (Docs)',        emoji: '📝' },
  refactor: { label: 'リファクタリング',           emoji: '♻️' },
  perf:     { label: 'パフォーマンス改善',         emoji: '⚡' },
  test:     { label: 'テスト',                    emoji: '✅' },
  style:    { label: 'スタイル・フォーマット',     emoji: '💄' },
  chore:    { label: 'メンテナンス (Chore)',       emoji: '🔧' },
  ci:       { label: 'CI/CD',                     emoji: '👷' },
  build:    { label: 'ビルド',                    emoji: '📦' },
  revert:   { label: '取り消し (Revert)',          emoji: '⏪' },
};

// ─── git コマンド実行ヘルパー ─────────────────────────────────────
function git(cmd, cwd) {
  try {
    return execSync(`git ${cmd}`, { cwd, encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }).trim();
  } catch {
    return null;
  }
}

// ─── リポジトリ確認 ───────────────────────────────────────────────
function isGitRepo(dir) {
  return git('rev-parse --git-dir', dir) !== null;
}

// ─── 最新タグ取得 ─────────────────────────────────────────────────
function getLatestTag(dir) {
  return git('describe --tags --abbrev=0', dir);
}

// ─── コミット一覧取得 ─────────────────────────────────────────────
// フォーマット: HASH|||DATE|||SUBJECT
function getCommits(dir, range) {
  const fmt  = '%H|||%ad|||%s';
  const args = `log --pretty=format:"${fmt}" --date=short --no-merges${range ? ' ' + range : ''}`;
  const raw  = git(args, dir);
  if (!raw) return [];

  return raw.split('\n')
    .map(line => {
      const parts = line.split('|||');
      if (parts.length < 3) return null;
      return { hash: parts[0].slice(0, 7), date: parts[1], subject: parts[2] };
    })
    .filter(Boolean);
}

// ─── コミット解析 ─────────────────────────────────────────────────
// conventional: feat(scope): message  または  feat: message
const CONV_RE = /^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/;

function parseCommit(subject) {
  const m = subject.match(CONV_RE);
  if (!m) return { type: 'other', scope: null, breaking: false, message: subject };
  return {
    type:     m[1].toLowerCase(),
    scope:    m[2] || null,
    breaking: !!m[3],
    message:  m[4],
  };
}

// ─── CHANGELOG セクション生成 ─────────────────────────────────────
function buildSection(version, date, commits) {
  const groups = {};
  const breaking = [];

  for (const c of commits) {
    const parsed = parseCommit(c.subject);
    if (parsed.breaking) breaking.push({ ...parsed, hash: c.hash });

    const typeKey = TYPE_MAP[parsed.type] ? parsed.type : 'other';
    if (!groups[typeKey]) groups[typeKey] = [];
    const scope   = parsed.scope ? `**${parsed.scope}**: ` : '';
    groups[typeKey].push(`- ${scope}${parsed.message} (\`${c.hash}\`)`);
  }

  const header = version === 'Unreleased'
    ? `## [Unreleased]`
    : `## [${version}] - ${date}`;

  const lines = [header, ''];

  // 破壊的変更は最優先で表示
  if (breaking.length) {
    lines.push('### ⚠️ 破壊的変更 (Breaking Changes)', '');
    breaking.forEach(b => {
      const scope = b.scope ? `**${b.scope}**: ` : '';
      lines.push(`- ${scope}${b.message}`);
    });
    lines.push('');
  }

  // conventional types を順序よく表示
  const ORDER = ['feat','fix','perf','refactor','docs','test','style','build','ci','chore','revert','other'];
  for (const typeKey of ORDER) {
    if (!groups[typeKey]) continue;
    const info  = TYPE_MAP[typeKey] || { label: 'その他', emoji: '📌' };
    lines.push(`### ${info.emoji} ${info.label}`, '');
    lines.push(...groups[typeKey]);
    lines.push('');
  }

  return lines.join('\n');
}

// ─── 既存 CHANGELOG.md への追記 ──────────────────────────────────
function prependToChangelog(filePath, newSection) {
  if (!fs.existsSync(filePath)) {
    const content = `# CHANGELOG\n\nこのファイルはすべての注目すべき変更を記録します。\nフォーマット: [Keep a Changelog](https://keepachangelog.com/ja/1.0.0/)\n\n${newSection}`;
    fs.writeFileSync(filePath, content, 'utf8');
    return 'created';
  }

  const existing = fs.readFileSync(filePath, 'utf8');
  // ## [v で始まる最初のバージョンセクションの前に挿入
  const insertAt = existing.search(/^## \[/m);
  if (insertAt === -1) {
    fs.writeFileSync(filePath, existing.trimEnd() + '\n\n' + newSection, 'utf8');
  } else {
    fs.writeFileSync(filePath, existing.slice(0, insertAt) + newSection + '\n' + existing.slice(insertAt), 'utf8');
  }
  return 'updated';
}

// ─── メイン ──────────────────────────────────────────────────────
async function main() {
  console.log('\n========================================');
  console.log('  CHANGELOG 自動生成ツール');
  console.log('========================================\n');

  // 対象ディレクトリ
  const dir       = (await ask('対象リポジトリのパス [.]: ')).trim() || '.';
  const repoDir   = path.resolve(dir);

  if (!isGitRepo(repoDir)) {
    console.log(`\nエラー: git リポジトリが見つかりません（${repoDir}）`);
    rl.close(); return;
  }

  const latestTag = getLatestTag(repoDir);
  console.log(latestTag
    ? `\n最新タグ: ${latestTag}`
    : '\nタグがまだありません（全コミットを対象にします）');

  // 取得範囲の選択
  console.log('\n取得範囲を選んでください:');
  console.log('  1. 前回タグ以降のコミット（推奨）');
  console.log('  2. 全コミット');
  console.log('  3. 日付指定（YYYY-MM-DD 以降）');
  const rangeChoice = (await ask('番号を入力 [1]: ')).trim() || '1';

  let range = null;
  if (rangeChoice === '1' && latestTag) {
    range = `${latestTag}..HEAD`;
  } else if (rangeChoice === '3') {
    const since = await askDefault('開始日', '2026-01-01');
    range = `--since="${since}"`;
  }

  const commits = getCommits(repoDir, range);

  if (commits.length === 0) {
    console.log('\n対象のコミットが見つかりませんでした。');
    rl.close(); return;
  }

  console.log(`\n${commits.length} 件のコミットを検出しました。`);

  // バージョン
  console.log('\nバージョンを選んでください:');
  console.log('  1. [Unreleased]（未リリース）');
  console.log('  2. バージョン番号を入力（例: 1.0.0）');
  const vChoice = (await ask('番号を入力 [1]: ')).trim() || '1';

  let version = 'Unreleased';
  if (vChoice === '2') {
    version = await askDefault('バージョン番号', '1.0.0');
    if (!version.startsWith('v')) version = version; // v は付けない（ブラケット内で管理）
  }

  const today   = new Date().toISOString().slice(0, 10);
  const outPath = path.join(repoDir, 'CHANGELOG.md');

  rl.close();

  // セクション生成
  const section = buildSection(version, today, commits);

  // プレビュー
  console.log('\n─── 生成内容 ────────────────────────────');
  console.log(section);
  console.log('─────────────────────────────────────────');

  // ファイル保存
  const result = prependToChangelog(outPath, section);
  console.log(`\n  ✓ CHANGELOG.md を${result === 'created' ? '新規作成' : '先頭に追記'}しました`);
  console.log(`  場所: ${outPath}\n`);
  console.log('完了！\n');
}

main().catch(err => { console.error(err); rl.close(); process.exit(1); });
