#!/usr/bin/env node
'use strict';

const readline     = require('readline');
const fs           = require('fs');
const path         = require('path');
const { execSync } = require('child_process');

const rl  = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

// ─── semver ヘルパー（依存なし）────────────────────────────────
function parseSemver(v) {
  const m = String(v || '').replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)/);
  return m ? [+m[1], +m[2], +m[3]] : [0, 0, 0];
}

function bumpType(current, latest) {
  const [cM, cm, cp] = parseSemver(current);
  const [lM, lm, lp] = parseSemver(latest);
  if (lM > cM) return 'major';
  if (lm > cm) return 'minor';
  if (lp > cp) return 'patch';
  return 'current';
}

// ─── バンプ種別メタ ──────────────────────────────────────────────
const BUMP = {
  major:   { emoji: '🔴', label: 'Major（破壊的変更の可能性）', order: 0 },
  minor:   { emoji: '🟡', label: 'Minor（機能追加・後方互換）', order: 1 },
  patch:   { emoji: '🟢', label: 'Patch（バグ修正）',            order: 2 },
  current: { emoji: '✅', label: '最新',                          order: 3 },
};

// ─── npm outdated JSON 実行 ───────────────────────────────────────
function runOutdated(projDir) {
  try {
    const out = execSync('npm outdated --json', {
      cwd: projDir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    });
    return JSON.parse(out || '{}');
  } catch (e) {
    // npm outdated は outdated があると exit 1 を返すが stdout は valid JSON
    if (e.stdout) {
      try { return JSON.parse(e.stdout); } catch {}
    }
    return {};
  }
}

// ─── パース・分類 ────────────────────────────────────────────────
function parseOutdated(raw) {
  const packages = Object.entries(raw).map(([name, info]) => ({
    name,
    current:   info.current  || '—',
    wanted:    info.wanted   || '—',
    latest:    info.latest   || '—',
    depType:   info.type     || 'dependencies',
    bump:      bumpType(info.current, info.latest),
    safeUpdate: bumpType(info.current, info.wanted) !== 'major',
  }));
  return packages.sort((a, b) => {
    const od = (BUMP[a.bump]?.order ?? 9) - (BUMP[b.bump]?.order ?? 9);
    return od !== 0 ? od : a.name.localeCompare(b.name);
  });
}

// ─── Markdown レポート生成 ────────────────────────────────────────
function buildReport(projDir, packages, today) {
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  const dateStr = `${y}年${m}月${d}日`;

  const counts = { major: 0, minor: 0, patch: 0, current: 0 };
  for (const p of packages) counts[p.bump] = (counts[p.bump] || 0) + 1;

  const lines = [
    `# 依存バージョン更新チェック - ${dateStr}`,
    ``,
    `**対象:** \`${projDir}\``,
    ``,
    `## サマリー`,
    ``,
    `| 種別 | 件数 |`,
    `|---|---|`,
  ];
  for (const [type, info] of Object.entries(BUMP)) {
    if (type === 'current') continue;
    lines.push(`| ${info.emoji} ${info.label} | **${counts[type] || 0}件** |`);
  }
  lines.push(`| 合計 | **${packages.length}件** |`);
  lines.push(``);

  if (packages.length === 0) {
    lines.push(`## ✅ すべての依存パッケージは最新です`);
    return lines.join('\n') + '\n';
  }

  // 種別ごとにセクション
  for (const [type, info] of Object.entries(BUMP)) {
    if (type === 'current') continue;
    const group = packages.filter(p => p.bump === type);
    if (group.length === 0) continue;

    lines.push(`## ${info.emoji} ${info.label} (${group.length}件)`, ``);
    lines.push(`| パッケージ | 現在 | 最新 | 種別 | 更新コマンド |`);
    lines.push(`|---|---|---|---|---|`);
    for (const pkg of group) {
      const depLabel = pkg.depType === 'devDependencies' ? 'dev' : 'prod';
      const cmd      = type === 'major'
        ? `\`npm install ${pkg.name}@${pkg.latest}\``
        : `\`npm update ${pkg.name}\``;
      lines.push(`| \`${pkg.name}\` | ${pkg.current} | ${pkg.latest} | ${depLabel} | ${cmd} |`);
    }
    lines.push(``);
  }

  // 一括更新コマンド
  lines.push(`## 更新コマンド集`, ``);
  const safeList  = packages.filter(p => p.bump !== 'major' && p.bump !== 'current');
  const majorList = packages.filter(p => p.bump === 'major');
  if (safeList.length > 0) {
    lines.push(`### 安全な更新（minor/patch）`, ``);
    lines.push('```bash');
    lines.push('npm update');
    lines.push('```');
    lines.push(``);
  }
  if (majorList.length > 0) {
    lines.push(`### Major 更新（手動・要テスト）`, ``);
    lines.push('```bash');
    for (const pkg of majorList) {
      lines.push(`npm install ${pkg.name}@${pkg.latest}`);
    }
    lines.push('```');
    lines.push(``);
  }

  lines.push(`---`, `生成: ${dateStr} / npm outdated`);
  return lines.join('\n') + '\n';
}

// ─── メイン ──────────────────────────────────────────────────────
async function main() {
  console.log('\n========================================');
  console.log('  依存バージョン更新チェック');
  console.log('========================================\n');

  const dir     = (await ask('対象プロジェクトのパス [.]: ')).trim() || '.';
  const projDir = path.resolve(dir);

  if (!fs.existsSync(path.join(projDir, 'package.json'))) {
    console.log(`\nエラー: package.json が見つかりません（${projDir}）`);
    rl.close(); return;
  }
  if (!fs.existsSync(path.join(projDir, 'node_modules'))) {
    console.log('\n⚠️  node_modules が見つかりません。先に npm install を実行してください。');
    rl.close(); return;
  }

  rl.close();

  console.log('\nチェック中...');
  const raw      = runOutdated(projDir);
  const packages = parseOutdated(raw);

  const counts = { major: 0, minor: 0, patch: 0 };
  for (const p of packages) if (p.bump in counts) counts[p.bump]++;

  // ─── ターミナル表示 ───────────────────────────────────────
  console.log('\n─── 更新可能なパッケージ ────────────────');
  if (packages.length === 0) {
    console.log('\n  ✅ すべての依存パッケージは最新です！\n');
  } else {
    console.log('');
    if (counts.major > 0) console.log(`  🔴 Major: ${counts.major}件（破壊的変更の可能性）`);
    if (counts.minor > 0) console.log(`  🟡 Minor: ${counts.minor}件`);
    if (counts.patch > 0) console.log(`  🟢 Patch: ${counts.patch}件`);
    console.log(`\n  合計: ${packages.length}件\n`);

    // パッケージ一覧（最大15件）
    packages.slice(0, 15).forEach(pkg => {
      const b = BUMP[pkg.bump] || { emoji: '❓' };
      const dep = pkg.depType === 'devDependencies' ? ' (dev)' : '';
      console.log(`  ${b.emoji} ${pkg.name}${dep}  ${pkg.current} → ${pkg.latest}`);
    });
    if (packages.length > 15) console.log(`  ... 他${packages.length - 15}件`);
  }
  console.log('──────────────────────────────────────────');

  // レポート保存
  const today      = new Date();
  const report     = buildReport(projDir, packages, today);
  const reportsDir = path.join(__dirname, 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });
  const fd  = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const rpt = path.join(reportsDir, `${fd}_outdated.md`);
  fs.writeFileSync(rpt, report, 'utf8');
  console.log(`\n  ✓ レポート保存: ${rpt}`);

  // 安全な更新の提案
  const safeCount = counts.minor + counts.patch;
  if (safeCount > 0) {
    console.log(`\n${safeCount}件（minor/patch）は npm update で安全に更新できます。`);
    const rl2  = readline.createInterface({ input: process.stdin, output: process.stdout });
    const doIt = await new Promise(r => rl2.question('実行しますか？ [y/N]: ', r));
    rl2.close();
    if (doIt.trim().toLowerCase() === 'y') {
      console.log('\n  $ npm update');
      execSync('npm update', { cwd: projDir, stdio: 'inherit' });
      console.log('\n  ✓ 更新完了。再チェックしてください。');
    }
  }

  if (counts.major > 0) {
    console.log(`\n⚠️  ${counts.major}件は Major 更新です。CHANGELOG を確認してから手動で実行してください:`);
    packages.filter(p => p.bump === 'major').forEach(p => {
      console.log(`    npm install ${p.name}@${p.latest}`);
    });
  }

  console.log('\n完了！\n');
}

main().catch(err => { console.error(err); rl.close(); process.exit(1); });
