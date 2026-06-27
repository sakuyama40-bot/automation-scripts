#!/usr/bin/env node
'use strict';

const readline = require('readline');
const fs       = require('fs');
const path     = require('path');

const rl  = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

// ─── プリセット定義 ───────────────────────────────────────────────
const PRESETS = {
  1: {
    name:   'Prettier デフォルト',
    config: {
      printWidth: 80, tabWidth: 2, useTabs: false,
      semi: true, singleQuote: false, trailingComma: 'all',
      bracketSpacing: true, arrowParens: 'always', endOfLine: 'lf',
    },
  },
  2: {
    name:   'Airbnb スタイル',
    config: {
      printWidth: 100, tabWidth: 2, useTabs: false,
      semi: true, singleQuote: true, trailingComma: 'all',
      bracketSpacing: true, arrowParens: 'always', endOfLine: 'lf',
    },
  },
  3: {
    name:   'Google スタイル',
    config: {
      printWidth: 80, tabWidth: 2, useTabs: false,
      semi: true, singleQuote: true, trailingComma: 'all',
      bracketSpacing: true, arrowParens: 'always', endOfLine: 'lf',
    },
  },
  4: {
    name:   'Standard JS スタイル（セミコロンなし）',
    config: {
      printWidth: 80, tabWidth: 2, useTabs: false,
      semi: false, singleQuote: true, trailingComma: 'none',
      bracketSpacing: true, arrowParens: 'avoid', endOfLine: 'lf',
    },
  },
};

// ─── カスタム設定を対話的に収集 ──────────────────────────────────
async function askCustomConfig() {
  const yn  = (v) => v === 'y';
  const num = (v, def) => { const n = parseInt(v, 10); return isNaN(n) ? def : n; };

  const printWidthRaw = (await ask('  printWidth（行の最大文字数） [80]: ')).trim();
  const tabWidthRaw   = (await ask('  tabWidth（インデント幅） [2]: ')).trim();
  const useTabsAns    = (await ask('  useTabs（タブ使用）? [y/N]: ')).trim().toLowerCase();
  const semiAns       = (await ask('  semi（セミコロン付与）? [Y/n]: ')).trim().toLowerCase();
  const singleAns     = (await ask('  singleQuote（シングルクォート）? [y/N]: ')).trim().toLowerCase();
  const tcAns         = (await ask('  trailingComma [none/es5/all] [all]: ')).trim() || 'all';
  const bsAns         = (await ask('  bracketSpacing（オブジェクトスペース）? [Y/n]: ')).trim().toLowerCase();
  const apAns         = (await ask('  arrowParens（アロー関数カッコ）[always/avoid] [always]: ')).trim() || 'always';
  const eolAns        = (await ask('  endOfLine [lf/crlf/auto] [lf]: ')).trim() || 'lf';

  return {
    printWidth:    num(printWidthRaw, 80),
    tabWidth:      num(tabWidthRaw, 2),
    useTabs:       yn(useTabsAns),
    semi:          semiAns !== 'n',
    singleQuote:   yn(singleAns),
    trailingComma: ['none','es5','all'].includes(tcAns) ? tcAns : 'all',
    bracketSpacing:bsAns !== 'n',
    arrowParens:   apAns === 'avoid' ? 'avoid' : 'always',
    endOfLine:     ['lf','crlf','auto'].includes(eolAns) ? eolAns : 'lf',
  };
}

// ─── 設定サマリー表示 ────────────────────────────────────────────
function showConfigSummary(cfg) {
  console.log('');
  console.log(`    printWidth    : ${cfg.printWidth}`);
  console.log(`    tabWidth      : ${cfg.tabWidth}  useTabs: ${cfg.useTabs}`);
  console.log(`    semi          : ${cfg.semi}  singleQuote: ${cfg.singleQuote}`);
  console.log(`    trailingComma : ${cfg.trailingComma}`);
  console.log(`    bracketSpacing: ${cfg.bracketSpacing}  arrowParens: ${cfg.arrowParens}`);
  console.log(`    endOfLine     : ${cfg.endOfLine}`);
  console.log('');
}

// ─── .prettierignore 生成 ────────────────────────────────────────
function buildIgnore() {
  return [
    'node_modules/',
    'dist/',
    'build/',
    'coverage/',
    '.next/',
    '*.min.js',
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
  ].join('\n') + '\n';
}

// ─── ESLint 連携パッチ ───────────────────────────────────────────
// .eslintrc.json が存在し、extends に prettier がなければ末尾に追加
function patchEslint(projDir) {
  const candidates = ['.eslintrc.json', '.eslintrc.js', '.eslintrc.cjs'];
  for (const name of candidates) {
    const p = path.join(projDir, name);
    if (!fs.existsSync(p)) continue;
    if (name !== '.eslintrc.json') return { found: true, patched: false, file: name };

    const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
    const ext = cfg.extends;
    const list = Array.isArray(ext) ? ext : (ext ? [ext] : []);
    if (list.includes('prettier')) return { found: true, patched: false, file: name };

    list.push('prettier');
    cfg.extends = list;
    fs.copyFileSync(p, p + '.bak');
    fs.writeFileSync(p, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
    return { found: true, patched: true, file: name };
  }
  return { found: false, patched: false, file: null };
}

// ─── package.json scripts 更新 ───────────────────────────────────
function updatePackageJson(projDir) {
  const pkgPath = path.join(projDir, 'package.json');
  if (!fs.existsSync(pkgPath)) return false;
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  if (!pkg.scripts) pkg.scripts = {};
  if (!pkg.scripts.format)        pkg.scripts.format        = 'prettier --write .';
  if (!pkg.scripts['format:check']) pkg.scripts['format:check'] = 'prettier --check .';
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  return true;
}

// ─── ファイル書き込み（バックアップ付き） ────────────────────────
function writeWithBackup(filePath, content) {
  const existed = fs.existsSync(filePath);
  if (existed) fs.copyFileSync(filePath, filePath + '.bak');
  fs.writeFileSync(filePath, content, 'utf8');
  return existed;
}

// ─── メイン ──────────────────────────────────────────────────────
async function main() {
  console.log('\n========================================');
  console.log('  Prettier 設定自動生成ツール');
  console.log('========================================\n');

  const dir     = (await ask('対象プロジェクトのパス [.]: ')).trim() || '.';
  const projDir = path.resolve(dir);

  if (!fs.existsSync(projDir)) {
    console.log(`\nエラー: ディレクトリが見つかりません（${projDir}）`);
    rl.close(); return;
  }

  // プリセット or カスタム選択
  console.log('\n設定スタイルを選んでください:');
  Object.entries(PRESETS).forEach(([id, p]) => console.log(`  ${id}. ${p.name}`));
  console.log('  5. カスタム（各項目を個別に設定）');

  const choice = (await ask('\n番号を入力 [1]: ')).trim() || '1';

  let config;
  if (choice === '5') {
    console.log('\n各オプションを入力してください（Enter でデフォルト値を使用）:');
    config = await askCustomConfig();
  } else {
    const preset = PRESETS[choice] || PRESETS[1];
    console.log(`\n選択: ${preset.name}`);
    config = preset.config;
    showConfigSummary(config);
    const ok = (await ask('この設定で生成しますか？ [Y/n]: ')).trim().toLowerCase();
    if (ok === 'n') { console.log('キャンセルしました。'); rl.close(); return; }
  }

  // ESLint 連携確認
  const doEslint = (await ask('\nESLint と連携しますか（eslint-config-prettier を追加）? [y/N]: ')).trim().toLowerCase();

  rl.close();

  // .prettierrc.json
  const rcPath   = path.join(projDir, '.prettierrc.json');
  const rcExisted = writeWithBackup(rcPath, JSON.stringify(config, null, 2) + '\n');

  // .prettierignore
  const ignorePath    = path.join(projDir, '.prettierignore');
  const ignoreExisted = writeWithBackup(ignorePath, buildIgnore());

  // package.json
  updatePackageJson(projDir);

  // ESLint 連携
  let eslintResult = { found: false, patched: false, file: null };
  if (doEslint === 'y') {
    eslintResult = patchEslint(projDir);
  }

  // 結果表示
  console.log('\n─── 生成結果 ────────────────────────────');
  console.log(`  ✓ ${rcPath}${rcExisted ? '  (.bak バックアップ済み)' : ''}`);
  console.log(`  ✓ ${ignorePath}${ignoreExisted ? '  (.bak バックアップ済み)' : ''}`);
  console.log('  ✓ package.json に format / format:check スクリプトを追加');

  if (doEslint === 'y') {
    if (eslintResult.patched) {
      console.log(`  ✓ ${eslintResult.file} の extends 末尾に "prettier" を追加（.bak済み）`);
    } else if (eslintResult.found) {
      console.log(`  ℹ ${eslintResult.file} — すでに prettier が設定されているかスキップ`);
    } else {
      console.log('  ℹ .eslintrc.json が見つかりませんでした（手動で追加してください）');
    }
  }

  // インストールコマンド
  const pkgs = ['prettier'];
  if (doEslint === 'y') pkgs.push('eslint-config-prettier');

  console.log('\n  次のステップ:');
  console.log(`  1. npm install --save-dev ${pkgs.join(' ')}`);
  console.log('  2. npm run format         # 全ファイル整形');
  console.log('  3. npm run format:check   # CI 用（差分チェックのみ）');
  console.log('──────────────────────────────────────────\n');
  console.log('完了！\n');
}

main().catch(err => { console.error(err); rl.close(); process.exit(1); });
