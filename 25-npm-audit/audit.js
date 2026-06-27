#!/usr/bin/env node
'use strict';

const readline     = require('readline');
const fs           = require('fs');
const path         = require('path');
const { execSync } = require('child_process');

const rl  = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

// ─── 重大度定義 ───────────────────────────────────────────────────
const SEVERITY = {
  critical: { emoji: '🔴', label: 'Critical（致命的）', order: 0 },
  high:     { emoji: '🟠', label: 'High（高）',          order: 1 },
  moderate: { emoji: '🟡', label: 'Moderate（中）',      order: 2 },
  low:      { emoji: '🔵', label: 'Low（低）',            order: 3 },
  info:     { emoji: '⚪', label: 'Info（情報）',          order: 4 },
};

// ─── npm コマンドヘルパー ─────────────────────────────────────────
function run(cmd, cwd) {
  console.log(`  $ ${cmd}`);
  execSync(cmd, { cwd, stdio: 'inherit' });
}

function runJson(cmd, cwd) {
  try {
    const out = execSync(cmd, { cwd, encoding: 'utf8', stdio: ['pipe','pipe','pipe'] });
    return JSON.parse(out);
  } catch (e) {
    // npm audit は脆弱性があると exit code 1 を返すが stdout は有効な JSON
    if (e.stdout) {
      try { return JSON.parse(e.stdout); } catch {}
    }
    return null;
  }
}

// ─── npm audit JSON パーサー ──────────────────────────────────────
// npm v7+ (auditReportVersion: 2) と npm v6 の両形式に対応
function parseAudit(data) {
  if (!data) return null;

  // npm v7+ 形式
  if (data.auditReportVersion === 2 || data.vulnerabilities) {
    const vulns    = data.vulnerabilities || {};
    const meta     = data.metadata?.vulnerabilities || {};
    const packages = Object.entries(vulns).map(([name, info]) => ({
      name,
      severity:     info.severity || 'unknown',
      isDirect:     info.isDirect || false,
      fixAvailable: !!info.fixAvailable,
      fixBreaking:  info.fixAvailable?.isSemVerMajor || false,
      via:          Array.isArray(info.via)
        ? info.via.filter(v => typeof v === 'object').map(v => v.title || v.url || '').filter(Boolean)
        : [],
      range:        info.range || '',
    }));
    return { packages, meta, version: 'v7' };
  }

  // npm v6 形式
  if (data.advisories) {
    const advisories = Object.values(data.advisories);
    const meta = data.metadata?.vulnerabilities || {};
    const packages = advisories.map(a => ({
      name:         a.module_name,
      severity:     a.severity,
      isDirect:     false,
      fixAvailable: !!(a.patched_versions && a.patched_versions !== '<0.0.0'),
      fixBreaking:  false,
      via:          [a.title].filter(Boolean),
      range:        a.findings?.map(f => f.version).join(', ') || '',
    }));
    return { packages, meta, version: 'v6' };
  }

  return null;
}

// ─── サマリー取得 ────────────────────────────────────────────────
function getSummary(meta) {
  const counts  = { critical: 0, high: 0, moderate: 0, low: 0, info: 0 };
  for (const [k, v] of Object.entries(meta)) {
    if (k in counts) counts[k] = v;
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return { counts, total };
}

// ─── Markdown レポート生成 ────────────────────────────────────────
function buildReport(projDir, parsed, today) {
  const y  = today.getFullYear();
  const m  = String(today.getMonth() + 1).padStart(2, '0');
  const d  = String(today.getDate()).padStart(2, '0');
  const dateStr = `${y}年${m}月${d}日`;

  const { counts, total } = getSummary(parsed.meta);

  const lines = [
    `# npm audit レポート - ${dateStr}`,
    ``,
    `**対象:** \`${projDir}\``,
    ``,
    `## サマリー`,
    ``,
    `| 重大度 | 件数 |`,
    `|---|---|`,
  ];

  for (const [sev, info] of Object.entries(SEVERITY)) {
    if (counts[sev] > 0) {
      lines.push(`| ${info.emoji} ${info.label} | **${counts[sev]}件** |`);
    } else {
      lines.push(`| ${info.emoji} ${info.label} | 0件 |`);
    }
  }
  lines.push(`| **合計** | **${total}件** |`);
  lines.push(``);

  if (total === 0) {
    lines.push(`## ✅ 脆弱性は見つかりませんでした`);
    lines.push(``);
    lines.push(`すべての依存パッケージは現時点で安全です。`);
    return lines.join('\n') + '\n';
  }

  // 重大度順にパッケージ一覧
  lines.push(`## 脆弱なパッケージ一覧`);
  lines.push(``);

  const sorted = [...parsed.packages].sort((a, b) => {
    const oa = SEVERITY[a.severity]?.order ?? 99;
    const ob = SEVERITY[b.severity]?.order ?? 99;
    return oa - ob;
  });

  for (const pkg of sorted) {
    const sev  = SEVERITY[pkg.severity] || { emoji: '❓', label: pkg.severity };
    const fix  = pkg.fixAvailable
      ? (pkg.fixBreaking ? '⚠️ `npm audit fix --force`（破壊的変更あり）' : '✅ `npm audit fix` で修正可')
      : '❌ 手動対応が必要';
    lines.push(`### ${sev.emoji} ${pkg.name} (${pkg.severity})`);
    lines.push(``);
    lines.push(`- **直接依存:** ${pkg.isDirect ? 'はい' : 'いいえ（間接依存）'}`);
    lines.push(`- **影響バージョン:** ${pkg.range || '不明'}`);
    lines.push(`- **修正:** ${fix}`);
    if (pkg.via.length > 0) {
      lines.push(`- **脆弱性:** ${pkg.via.slice(0, 3).join(' / ')}`);
    }
    lines.push(``);
  }

  // 修正コマンド
  const safeFixable   = sorted.filter(p => p.fixAvailable && !p.fixBreaking).length;
  const forceFixable  = sorted.filter(p => p.fixAvailable && p.fixBreaking).length;
  const manualNeeded  = sorted.filter(p => !p.fixAvailable).length;

  lines.push(`## 推奨対応`);
  lines.push(``);
  if (safeFixable > 0)  lines.push(`- \`npm audit fix\` — ${safeFixable}件を安全に修正できます`);
  if (forceFixable > 0) lines.push(`- \`npm audit fix --force\` — ${forceFixable}件（破壊的変更あり・要テスト）`);
  if (manualNeeded > 0) lines.push(`- 手動対応 — ${manualNeeded}件（パッケージの更新またはアンインストールが必要）`);
  lines.push(``);
  lines.push(`---`);
  lines.push(`生成: ${dateStr} / npm audit`);

  return lines.join('\n') + '\n';
}

// ─── メイン ──────────────────────────────────────────────────────
async function main() {
  console.log('\n========================================');
  console.log('  npm audit 脆弱性スキャンツール');
  console.log('========================================\n');

  const dir     = (await ask('対象プロジェクトのパス [.]: ')).trim() || '.';
  const projDir = path.resolve(dir);
  const pkgPath = path.join(projDir, 'package.json');

  if (!fs.existsSync(pkgPath)) {
    console.log(`\nエラー: package.json が見つかりません（${projDir}）`);
    rl.close(); return;
  }

  const modulesPath = path.join(projDir, 'node_modules');
  if (!fs.existsSync(modulesPath)) {
    console.log(`\n⚠️  node_modules が見つかりません。`);
    const doInstall = (await ask('npm install を実行しますか？ [y/N]: ')).trim().toLowerCase();
    if (doInstall === 'y') {
      run('npm install', projDir);
    } else {
      console.log('スキャンをスキップします。');
      rl.close(); return;
    }
  }

  rl.close();

  // スキャン実行
  console.log('\nスキャン中...');
  const raw    = runJson('npm audit --json', projDir);
  const parsed = parseAudit(raw);

  if (!parsed) {
    console.log('⚠️  audit 結果の解析に失敗しました。npm のバージョンを確認してください。');
    return;
  }

  const { counts, total } = getSummary(parsed.meta);

  // ターミナル表示
  console.log('\n─── スキャン結果 ────────────────────────');
  if (total === 0) {
    console.log('\n  ✅ 脆弱性は見つかりませんでした！\n');
  } else {
    console.log('');
    for (const [sev, info] of Object.entries(SEVERITY)) {
      if (counts[sev] > 0) {
        console.log(`  ${info.emoji} ${info.label}: ${counts[sev]}件`);
      }
    }
    console.log(`\n  合計: ${total}件の脆弱性\n`);

    // 重大度の高いものを表示
    const sorted = [...parsed.packages]
      .sort((a, b) => (SEVERITY[a.severity]?.order ?? 99) - (SEVERITY[b.severity]?.order ?? 99));
    sorted.slice(0, 10).forEach(pkg => {
      const sev = SEVERITY[pkg.severity] || { emoji: '❓' };
      const fix = pkg.fixAvailable ? (pkg.fixBreaking ? '(force fix)' : '(fix可)') : '(手動)';
      console.log(`  ${sev.emoji} ${pkg.name}@${pkg.range || '?'} ${fix}`);
    });
    if (sorted.length > 10) console.log(`  ... 他${sorted.length - 10}件`);
  }
  console.log('──────────────────────────────────────────');

  // Markdown レポート保存
  const today      = new Date();
  const report     = buildReport(projDir, parsed, today);
  const reportsDir = path.join(__dirname, 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });
  const fd   = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const rpt  = path.join(reportsDir, `${fd}_audit.md`);
  fs.writeFileSync(rpt, report, 'utf8');
  console.log(`\n  ✓ レポート保存: ${rpt}`);

  // 自動修正の提案
  if (total > 0) {
    const safeFixable = parsed.packages.filter(p => p.fixAvailable && !p.fixBreaking).length;
    const forceCount  = parsed.packages.filter(p => p.fixAvailable && p.fixBreaking).length;

    if (safeFixable > 0) {
      console.log(`\n${safeFixable}件は npm audit fix で安全に修正できます。`);
      const doFix = (await ask('実行しますか？ [y/N]: ')).trim().toLowerCase();
      if (doFix === 'y') {
        run('npm audit fix', projDir);
        console.log('\n修正完了。再スキャンしてください。');
      }
    }

    if (forceCount > 0) {
      console.log(`\n⚠️  ${forceCount}件は破壊的変更を伴う修正が必要です（npm audit fix --force）。`);
      console.log('   メジャーバージョンが上がるため、テスト後に手動で実行してください。');
    }
  }

  console.log('\n完了！\n');
}

main().catch(err => { console.error(err); rl.close(); process.exit(1); });
