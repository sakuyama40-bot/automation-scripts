#!/usr/bin/env node
'use strict';

const readline     = require('readline');
const fs           = require('fs');
const path         = require('path');
const { execSync } = require('child_process');

const rl  = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

// ─── カバレッジ指標定義 ──────────────────────────────────────────
const METRICS = ['lines', 'statements', 'functions', 'branches'];
const METRIC_LABELS = {
  lines:      'Lines（行）',
  statements: 'Statements（文）',
  functions:  'Functions（関数）',
  branches:   'Branches（分岐）',
};

// ─── カバレッジ率に応じたアイコン ────────────────────────────────
function icon(pct, threshold) {
  if (pct >= threshold)          return '🟢';
  if (pct >= threshold * 0.75)   return '🟡';
  return '🔴';
}

// ─── Jest バイナリ探索 ────────────────────────────────────────────
function findJest(projDir) {
  const local = path.join(projDir, 'node_modules', '.bin', 'jest');
  if (fs.existsSync(local)) return `"${local}"`;
  try { execSync('jest --version', { stdio: 'pipe' }); return 'jest'; } catch {}
  return 'npx jest';
}

// ─── coverage-summary.json パーサー ─────────────────────────────
function parseSummary(summaryPath) {
  if (!fs.existsSync(summaryPath)) return null;
  const raw  = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  const total = raw.total || {};
  const files = Object.entries(raw)
    .filter(([k]) => k !== 'total')
    .map(([file, data]) => ({
      file,
      pct: Object.fromEntries(METRICS.map(m => [m, data[m]?.pct ?? 0])),
      raw: data,
    }));
  return { total, files };
}

// ─── ファイル別 最低カバレッジでソート ──────────────────────────
function sortFiles(files) {
  return [...files].sort((a, b) => {
    const minA = Math.min(...METRICS.map(m => a.pct[m]));
    const minB = Math.min(...METRICS.map(m => b.pct[m]));
    return minA - minB;
  });
}

// ─── Markdown レポート生成 ────────────────────────────────────────
function buildReport(projDir, data, thresholds, today) {
  const { total, files } = data;
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  const dateStr = `${y}年${m}月${d}日`;

  const th = thresholds.lines;  // 代表閾値
  const lines = [
    `# カバレッジレポート - ${dateStr}`,
    ``,
    `**対象:** \`${projDir}\``,
    `**閾値:** ${thresholds.lines}%（lines）/ ${thresholds.statements}%（statements）/ ${thresholds.functions}%（functions）/ ${thresholds.branches}%（branches）`,
    ``,
    `## 合計カバレッジ`,
    ``,
    `| 指標 | カバー | 判定 |`,
    `|---|---|---|`,
  ];

  let allPass = true;
  for (const metric of METRICS) {
    const pct   = total[metric]?.pct ?? 0;
    const thr   = thresholds[metric];
    const pass  = pct >= thr;
    if (!pass) allPass = false;
    lines.push(`| ${METRIC_LABELS[metric]} | **${pct.toFixed(1)}%** | ${icon(pct, thr)} ${pass ? 'PASS' : `FAIL（閾値: ${thr}%）`} |`);
  }

  lines.push(``);
  lines.push(allPass ? `## ✅ 全閾値クリア` : `## ❌ 閾値を下回る指標があります`);
  lines.push(``);

  // ファイル別（最大20件・カバレッジ低い順）
  const sorted = sortFiles(files).slice(0, 20);
  if (sorted.length > 0) {
    lines.push(`## ファイル別カバレッジ（低い順 TOP ${Math.min(sorted.length, 20)}）`, ``);
    lines.push(`| ファイル | Lines | Statements | Functions | Branches |`);
    lines.push(`|---|---|---|---|---|`);
    for (const f of sorted) {
      const short = f.file.replace(projDir, '').replace(/\\/g, '/').replace(/^\//, '');
      const cols  = METRICS.map(met => {
        const p = f.pct[met];
        return `${icon(p, thresholds[met])} ${p.toFixed(1)}%`;
      });
      lines.push(`| \`${short}\` | ${cols.join(' | ')} |`);
    }
    if (files.length > 20) lines.push(`\n_...他 ${files.length - 20} ファイル_`);
    lines.push(``);
  }

  lines.push(`---`, `生成: ${dateStr} / jest --coverage`);
  return { markdown: lines.join('\n') + '\n', allPass };
}

// ─── package.json に test:coverage スクリプト追加 ──────────────
function addCoverageScript(projDir) {
  const pkgPath = path.join(projDir, 'package.json');
  if (!fs.existsSync(pkgPath)) return false;
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  if (!pkg.scripts) pkg.scripts = {};
  if (pkg.scripts['test:coverage']) return false;
  pkg.scripts['test:coverage'] = 'jest --coverage';
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  return true;
}

// ─── メイン ──────────────────────────────────────────────────────
async function main() {
  console.log('\n========================================');
  console.log('  テストカバレッジ 計測ツール');
  console.log('========================================\n');

  const dir     = (await ask('対象プロジェクトのパス [.]: ')).trim() || '.';
  const projDir = path.resolve(dir);

  if (!fs.existsSync(path.join(projDir, 'package.json'))) {
    console.log(`\nエラー: package.json が見つかりません（${projDir}）`);
    rl.close(); return;
  }

  // 閾値設定
  const thrRaw = (await ask('カバレッジ閾値 % [80]: ')).trim();
  const thr    = Math.min(100, Math.max(0, parseInt(thrRaw, 10) || 80));
  const thresholds = { lines: thr, statements: thr, functions: thr, branches: thr };

  // 既存データの有無確認
  const summaryPath = path.join(projDir, 'coverage', 'coverage-summary.json');
  let useExisting   = false;
  if (fs.existsSync(summaryPath)) {
    const stat    = fs.statSync(summaryPath);
    const ageMin  = Math.round((Date.now() - stat.mtimeMs) / 60000);
    const useAns  = (await ask(`\n既存のカバレッジデータがあります（${ageMin}分前）。使用しますか？ [Y/n]: `)).trim().toLowerCase();
    useExisting   = useAns !== 'n';
  }

  rl.close();

  // Jest 実行
  if (!useExisting) {
    const jest = findJest(projDir);
    console.log(`\nテスト実行中: ${jest} --coverage ...`);
    try {
      execSync(
        `${jest} --coverage --coverageReporters=json-summary --coverageReporters=text`,
        { cwd: projDir, stdio: 'inherit' }
      );
    } catch {
      // Jest はテスト失敗時も exit 1 を返すが coverage は生成される場合がある
      console.log('\n(テストに失敗したものがあります。カバレッジデータは生成されています)');
    }
  }

  // パース
  const data = parseSummary(summaryPath);
  if (!data) {
    console.log(`\nエラー: カバレッジデータが見つかりません（${summaryPath}）`);
    console.log('jest.config.js に coverageReporters: ["json-summary"] が必要です。');
    process.exit(1);
  }

  const { total, files } = data;

  // ターミナル表示
  console.log('\n─── カバレッジ結果 ──────────────────────');
  console.log('');
  for (const metric of METRICS) {
    const pct  = total[metric]?.pct ?? 0;
    const cov  = total[metric]?.covered ?? 0;
    const tot  = total[metric]?.total ?? 0;
    const pass = pct >= thresholds[metric];
    console.log(`  ${icon(pct, thresholds[metric])} ${METRIC_LABELS[metric].padEnd(22)} ${pct.toFixed(1).padStart(5)}%  (${cov}/${tot})`);
  }

  // 低カバレッジファイル（ワースト5）
  const sorted = sortFiles(files);
  if (sorted.length > 0) {
    console.log('\n  ワースト5（最低カバレッジ）:');
    sorted.slice(0, 5).forEach(f => {
      const short = f.file.replace(projDir, '').replace(/\\/g, '/').replace(/^\//, '');
      const minPct = Math.min(...METRICS.map(m => f.pct[m]));
      console.log(`    ${icon(minPct, thr)} ${short}  (min: ${minPct.toFixed(1)}%)`);
    });
  }
  console.log('──────────────────────────────────────────');

  // レポート保存
  const today   = new Date();
  const { markdown, allPass } = buildReport(projDir, data, thresholds, today);
  const reportsDir = path.join(__dirname, 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });
  const fd  = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const rpt = path.join(reportsDir, `${fd}_coverage.md`);
  fs.writeFileSync(rpt, markdown, 'utf8');
  console.log(`\n  ✓ レポート保存: ${rpt}`);

  // package.json 更新
  if (addCoverageScript(projDir)) {
    console.log('  ✓ package.json に "test:coverage": "jest --coverage" を追加');
  }

  // 結果サマリー
  console.log('');
  if (allPass) {
    console.log(`  ✅ 全指標が閾値（${thr}%）を満たしています\n`);
    process.exit(0);
  } else {
    console.log(`  ❌ 閾値（${thr}%）を下回る指標があります\n`);
    process.exit(1);
  }
}

main().catch(err => { console.error(err); rl.close(); process.exit(1); });
