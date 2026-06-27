#!/usr/bin/env node
'use strict';

const readline     = require('readline');
const fs           = require('fs');
const path         = require('path');
const { execSync } = require('child_process');

const rl  = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

// ─── tsc バイナリ探索 ─────────────────────────────────────────────
function findTsc(projDir) {
  const local = path.join(projDir, 'node_modules', '.bin', 'tsc');
  if (fs.existsSync(local)) return `"${local}"`;
  try {
    execSync('tsc --version', { stdio: 'pipe' });
    return 'tsc';
  } catch {}
  try {
    execSync('npx --no tsc --version', { stdio: 'pipe', cwd: projDir });
    return 'npx tsc';
  } catch {}
  return null;
}

// ─── エラー行パーサー ────────────────────────────────────────────
// 形式: path/file.ts(10,5): error TS2345: message
//       path/file.ts(10,5): warning TS1234: message
const ERROR_RE = /^(.+)\((\d+),(\d+)\): (error|warning) (TS\d+): (.+)$/;

function parseOutput(output) {
  const errors   = [];
  const warnings = [];
  for (const line of output.split('\n')) {
    const m = line.match(ERROR_RE);
    if (!m) continue;
    const entry = { file: m[1].trim(), line: +m[2], col: +m[3], code: m[5], message: m[6] };
    if (m[4] === 'error')   errors.push(entry);
    else                    warnings.push(entry);
  }
  return { errors, warnings };
}

// ─── ファイル別にグループ化 ──────────────────────────────────────
function groupByFile(items) {
  const map = new Map();
  for (const item of items) {
    if (!map.has(item.file)) map.set(item.file, []);
    map.get(item.file).push(item);
  }
  return map;
}

// ─── 頻出エラーコード集計 ────────────────────────────────────────
function topCodes(errors, n = 5) {
  const count = {};
  for (const e of errors) count[e.code] = (count[e.code] || 0) + 1;
  return Object.entries(count)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([code, cnt]) => ({ code, cnt }));
}

// ─── Markdown レポート生成 ────────────────────────────────────────
function buildReport(projDir, parsed, today, tscVersion) {
  const y  = today.getFullYear();
  const m  = String(today.getMonth() + 1).padStart(2, '0');
  const d  = String(today.getDate()).padStart(2, '0');
  const dateStr = `${y}年${m}月${d}日`;

  const { errors, warnings } = parsed;
  const byFile = groupByFile(errors);
  const top    = topCodes(errors);

  const lines = [
    `# TypeScript 型チェック レポート - ${dateStr}`,
    ``,
    `**対象:** \`${projDir}\``,
    tscVersion ? `**tsc バージョン:** ${tscVersion.trim()}` : '',
    ``,
    `## サマリー`,
    ``,
    `| 種別 | 件数 |`,
    `|---|---|`,
    `| ❌ エラー | **${errors.length}件** |`,
    `| ⚠️ 警告   | **${warnings.length}件** |`,
    `| 影響ファイル | **${byFile.size}ファイル** |`,
    ``,
  ].filter(l => l !== undefined);

  if (errors.length === 0 && warnings.length === 0) {
    lines.push(`## ✅ 型エラーはありません`, ``);
    lines.push(`すべてのファイルが型チェックを通過しました。`);
    return lines.join('\n') + '\n';
  }

  // 頻出エラーコード
  if (top.length > 0) {
    lines.push(`## 頻出エラーコード`, ``);
    lines.push(`| コード | 件数 |`, `|---|---|`);
    for (const { code, cnt } of top) {
      lines.push(`| [\`${code}\`](https://typescript.tv/errors/#${code.toLowerCase()}) | ${cnt}件 |`);
    }
    lines.push(``);
  }

  // ファイル別エラー一覧
  lines.push(`## ファイル別エラー`, ``);
  for (const [file, errs] of [...byFile.entries()].sort((a, b) => b[1].length - a[1].length)) {
    lines.push(`### \`${file}\` (${errs.length}件)`, ``);
    for (const e of errs) {
      lines.push(`- **L${e.line}:${e.col}** \`${e.code}\` ${e.message}`);
    }
    lines.push(``);
  }

  if (warnings.length > 0) {
    const wByFile = groupByFile(warnings);
    lines.push(`## 警告一覧`, ``);
    for (const [file, warns] of wByFile) {
      lines.push(`### \`${file}\``, ``);
      for (const w of warns) {
        lines.push(`- **L${w.line}:${w.col}** \`${w.code}\` ${w.message}`);
      }
      lines.push(``);
    }
  }

  lines.push(`---`, `生成: ${dateStr} / tsc --noEmit`);
  return lines.join('\n') + '\n';
}

// ─── tsconfig.json 雛形 ──────────────────────────────────────────
const TSCONFIG_TEMPLATE = {
  compilerOptions: {
    target: 'ES2020',
    module: 'commonjs',
    strict: true,
    esModuleInterop: true,
    skipLibCheck: true,
    forceConsistentCasingInFileNames: true,
    outDir: './dist',
    rootDir: './src',
  },
  include: ['src/**/*'],
  exclude: ['node_modules', 'dist'],
};

// ─── GitHub Actions ワークフロー スニペット ───────────────────────
const GHA_SNIPPET = `
# .github/workflows/typecheck.yml に追加するステップ:
#
# - name: TypeScript 型チェック
#   run: npm run typecheck
#
# または独立したジョブ:
#
# jobs:
#   typecheck:
#     runs-on: ubuntu-latest
#     steps:
#       - uses: actions/checkout@v4
#       - uses: actions/setup-node@v4
#         with:
#           node-version: '20'
#           cache: 'npm'
#       - run: npm ci
#       - run: npm run typecheck
`;

// ─── package.json に typecheck スクリプト追加 ─────────────────────
function addTypecheckScript(projDir) {
  const pkgPath = path.join(projDir, 'package.json');
  if (!fs.existsSync(pkgPath)) return false;
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  if (!pkg.scripts) pkg.scripts = {};
  if (pkg.scripts.typecheck) return false;  // 既にある
  pkg.scripts.typecheck = 'tsc --noEmit';
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  return true;
}

// ─── メイン ──────────────────────────────────────────────────────
async function main() {
  console.log('\n========================================');
  console.log('  TypeScript 型チェック ツール');
  console.log('========================================\n');

  const dir     = (await ask('対象プロジェクトのパス [.]: ')).trim() || '.';
  const projDir = path.resolve(dir);

  // tsc を探す
  const tsc = findTsc(projDir);
  if (!tsc) {
    console.log('\nエラー: tsc が見つかりません。');
    console.log('  npm install --save-dev typescript  でインストールしてください。');
    rl.close(); return;
  }
  console.log(`\n  tsc: ${tsc}`);

  // tsconfig.json の確認
  const tsconfigPath = path.join(projDir, 'tsconfig.json');
  if (!fs.existsSync(tsconfigPath)) {
    console.log('\n⚠️  tsconfig.json が見つかりません。');
    const create = (await ask('基本的な tsconfig.json を生成しますか？ [y/N]: ')).trim().toLowerCase();
    if (create === 'y') {
      fs.writeFileSync(tsconfigPath, JSON.stringify(TSCONFIG_TEMPLATE, null, 2) + '\n', 'utf8');
      console.log('  ✓ tsconfig.json を生成しました。');
    } else {
      console.log('  tsconfig.json なしで実行します（ルートディレクトリの .ts ファイルをチェック）');
    }
  }

  rl.close();

  // tsc バージョン取得
  let tscVersion = '';
  try { tscVersion = execSync(`${tsc} --version`, { cwd: projDir, encoding: 'utf8', stdio: 'pipe' }); } catch {}

  // 型チェック実行
  console.log('\n型チェック実行中...');
  let output = '';
  let exitOk = false;
  try {
    output = execSync(`${tsc} --noEmit --pretty false 2>&1`, { cwd: projDir, encoding: 'utf8', stdio: 'pipe' });
    exitOk = true;
  } catch (e) {
    output = (e.stdout || '') + (e.stderr || '');
  }

  const parsed = parseOutput(output);
  const { errors, warnings } = parsed;
  const byFile = groupByFile(errors);

  // ターミナル表示
  console.log('\n─── 型チェック結果 ──────────────────────');
  if (errors.length === 0 && warnings.length === 0) {
    console.log('\n  ✅ 型エラーはありません！\n');
  } else {
    console.log(`\n  ❌ エラー: ${errors.length}件  ⚠️ 警告: ${warnings.length}件`);
    console.log(`  影響ファイル: ${byFile.size}ファイル\n`);

    const sorted = [...byFile.entries()].sort((a, b) => b[1].length - a[1].length);
    sorted.slice(0, 8).forEach(([file, errs]) => {
      const short = file.replace(projDir, '.').replace(/\\/g, '/');
      console.log(`  ${errs.length}件  ${short}`);
    });
    if (sorted.length > 8) console.log(`  ... 他 ${sorted.length - 8} ファイル`);

    const top = topCodes(errors, 3);
    if (top.length > 0) {
      console.log(`\n  頻出エラー:`);
      top.forEach(({ code, cnt }) => console.log(`    ${code}: ${cnt}件`));
    }
  }
  console.log('──────────────────────────────────────────');

  // Markdown レポート保存
  const today      = new Date();
  const report     = buildReport(projDir, parsed, today, tscVersion);
  const reportsDir = path.join(__dirname, 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });
  const fd   = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const rpt  = path.join(reportsDir, `${fd}_typecheck.md`);
  fs.writeFileSync(rpt, report, 'utf8');
  console.log(`\n  ✓ レポート保存: ${rpt}`);

  // npm scripts 追加
  const added = addTypecheckScript(projDir);
  if (added) {
    console.log('  ✓ package.json に "typecheck": "tsc --noEmit" を追加しました。');
    console.log('    → npm run typecheck  で実行できます');
  }

  // GitHub Actions スニペット表示
  console.log('\n  GitHub Actions への組み込み方:');
  console.log('    .github/workflows/ の適切なファイルに以下を追加:');
  console.log('    ─────────────────────────────────');
  console.log('      - name: TypeScript 型チェック');
  console.log('        run: npm run typecheck');
  console.log('    ─────────────────────────────────');

  const ghaPath = path.join(reportsDir, `${fd}_typecheck_gha_snippet.txt`);
  fs.writeFileSync(ghaPath, GHA_SNIPPET.trim() + '\n', 'utf8');
  console.log(`\n  ✓ GitHub Actions スニペット: ${ghaPath}`);

  console.log('\n完了！\n');

  // CI 用終了コード
  process.exit(errors.length > 0 ? 1 : 0);
}

main().catch(err => { console.error(err); rl.close(); process.exit(1); });
