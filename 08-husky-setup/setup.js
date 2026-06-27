#!/usr/bin/env node
'use strict';

const readline     = require('readline');
const fs           = require('fs');
const path         = require('path');
const { execSync } = require('child_process');

const rl  = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (prompt) => new Promise(resolve => rl.question(prompt, resolve));
const askDefault = async (prompt, def) => (await ask(`${prompt} [${def}]: `)).trim() || def;

// ─── npm コマンド実行ヘルパー ─────────────────────────────────────
function run(cmd, cwd) {
  console.log(`  $ ${cmd}`);
  execSync(cmd, { cwd, stdio: 'inherit' });
}

function runSilent(cmd, cwd) {
  try {
    return execSync(cmd, { cwd, encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }).trim();
  } catch { return null; }
}

// ─── package.json 読み書き ────────────────────────────────────────
function readPkg(dir) {
  const p = path.join(dir, 'package.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function writePkg(dir, pkg) {
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify(pkg, null, 2) + '\n',
    'utf8'
  );
}

// ─── インストール済みチェック ─────────────────────────────────────
function isInstalled(pkg, dir) {
  return fs.existsSync(path.join(dir, 'node_modules', pkg));
}

function hasDep(pkg, pkgJson) {
  return !!(pkgJson.dependencies?.[pkg] || pkgJson.devDependencies?.[pkg]);
}

// ─── lint-staged 設定生成 ─────────────────────────────────────────
function buildLintStagedConfig(useEslint, usePrettier, fileTypes) {
  const jsPattern  = fileTypes.includes('ts')
    ? '*.{js,mjs,cjs,ts,tsx}'
    : '*.{js,mjs,cjs}';

  const jsActions = [];
  if (useEslint)   jsActions.push('eslint --fix');
  if (usePrettier) jsActions.push('prettier --write');

  const config = {};

  if (jsActions.length > 0) config[jsPattern] = jsActions;
  if (usePrettier) {
    if (fileTypes.includes('json')) config['*.json'] = ['prettier --write'];
    if (fileTypes.includes('md'))   config['*.md']   = ['prettier --write'];
    if (fileTypes.includes('css'))  config['*.css']  = ['prettier --write'];
  }

  return config;
}

// ─── husky pre-commit フック ──────────────────────────────────────
function writePreCommitHook(dir) {
  const huskyDir  = path.join(dir, '.husky');
  fs.mkdirSync(huskyDir, { recursive: true });
  const hookPath  = path.join(huskyDir, 'pre-commit');
  fs.writeFileSync(hookPath, 'npx lint-staged\n', 'utf8');
  // Unix 実行権限（Windows では不要だが git が読む）
  try { fs.chmodSync(hookPath, '755'); } catch { /* Windows では無視 */ }
  return hookPath;
}

// ─── ESLint 設定ファイル生成（存在しない場合） ───────────────────
function writeEslintConfig(dir) {
  const candidates = ['.eslintrc.js', '.eslintrc.json', '.eslintrc.cjs', 'eslint.config.js', 'eslint.config.mjs'];
  if (candidates.some(f => fs.existsSync(path.join(dir, f)))) {
    console.log('  - ESLint 設定ファイルが既に存在するためスキップ');
    return;
  }
  const config = {
    env:     { node: true, es2022: true },
    extends: ['eslint:recommended'],
    parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    rules:   {},
  };
  fs.writeFileSync(path.join(dir, '.eslintrc.json'), JSON.stringify(config, null, 2) + '\n', 'utf8');
  console.log('  ✓ .eslintrc.json を生成しました');
}

// ─── Prettier 設定ファイル生成（存在しない場合） ─────────────────
function writePrettierConfig(dir) {
  const candidates = ['.prettierrc', '.prettierrc.json', '.prettierrc.js', 'prettier.config.js'];
  if (candidates.some(f => fs.existsSync(path.join(dir, f)))) {
    console.log('  - Prettier 設定ファイルが既に存在するためスキップ');
    return;
  }
  const config = { semi: true, singleQuote: true, tabWidth: 2, trailingComma: 'es5', printWidth: 100 };
  fs.writeFileSync(path.join(dir, '.prettierrc.json'), JSON.stringify(config, null, 2) + '\n', 'utf8');
  console.log('  ✓ .prettierrc.json を生成しました');
}

// ─── メイン ──────────────────────────────────────────────────────
async function main() {
  console.log('\n========================================');
  console.log('  husky + lint-staged セットアップツール');
  console.log('========================================\n');
  console.log('このツールは対象プロジェクトに npm パッケージをインストールします。\n');

  // 対象ディレクトリ
  const dir     = (await ask('対象プロジェクトのパス [.]: ')).trim() || '.';
  const projDir = path.resolve(dir);
  const pkgPath = path.join(projDir, 'package.json');

  if (!fs.existsSync(pkgPath)) {
    console.log(`\nエラー: package.json が見つかりません（${projDir}）`);
    console.log('先に 01-project-init を実行してください。');
    rl.close(); return;
  }

  const pkg = readPkg(projDir);
  console.log(`\n対象: ${projDir}`);
  console.log(`プロジェクト: ${pkg.name || '(名前なし)'}\n`);

  // 既存チェック
  if (hasDep('husky', pkg)) {
    console.log('⚠️  husky はすでに設定されています。');
    const overwrite = (await ask('再セットアップしますか？ [y/N]: ')).trim().toLowerCase();
    if (overwrite !== 'y') { rl.close(); return; }
  }

  // ツール選択
  console.log('使用するツールを選んでください:');
  console.log('  1. ESLint + Prettier（推奨）');
  console.log('  2. ESLint のみ');
  console.log('  3. Prettier のみ');
  console.log('  4. lint-staged のみ（ツールは別途設定済み）');
  const toolChoice = (await ask('\n番号を入力 [1]: ')).trim() || '1';

  const useEslint   = ['1','2'].includes(toolChoice);
  const usePrettier = ['1','3'].includes(toolChoice);

  // ファイルタイプ選択
  console.log('\n対象ファイルタイプを選んでください（複数可・カンマ区切り）:');
  console.log('  js, ts, json, md, css');
  const typesInput  = (await ask('入力 [js,json,md]: ')).trim() || 'js,json,md';
  const fileTypes   = typesInput.split(',').map(s => s.trim()).filter(Boolean);

  // インストールするパッケージ確定
  const toInstall = ['husky', 'lint-staged'];
  if (useEslint   && !hasDep('eslint', pkg))   toInstall.push('eslint');
  if (usePrettier && !hasDep('prettier', pkg)) toInstall.push('prettier');

  // 確認
  console.log('\n─── 実行内容の確認 ──────────────────────');
  console.log(`  インストール: ${toInstall.join(', ')}`);
  console.log(`  ESLint: ${useEslint ? 'あり' : 'なし'}`);
  console.log(`  Prettier: ${usePrettier ? 'あり' : 'なし'}`);
  console.log(`  対象ファイル: ${fileTypes.join(', ')}`);
  console.log('──────────────────────────────────────────');

  const confirm = (await ask('\n実行しますか？ [y/N]: ')).trim().toLowerCase();
  if (confirm !== 'y') { console.log('キャンセルしました。'); rl.close(); return; }

  rl.close();

  console.log('\n─── インストール ────────────────────────');
  run(`npm install --save-dev ${toInstall.join(' ')}`, projDir);

  console.log('\n─── husky 初期化 ────────────────────────');
  // husky v9: npx husky init が .husky/ と prepare スクリプトを自動作成
  try {
    run('npx husky init', projDir);
  } catch {
    // フォールバック: 手動で .husky/ を作成
    fs.mkdirSync(path.join(projDir, '.husky'), { recursive: true });
  }

  // pre-commit フック上書き（husky init が作成するものを lint-staged 用に更新）
  const hookPath = writePreCommitHook(projDir);
  console.log(`  ✓ ${hookPath} を設定しました`);

  console.log('\n─── package.json 更新 ───────────────────');
  const updatedPkg = readPkg(projDir); // npm install 後に再読み込み

  // prepare スクリプト追加（npm install 時に husky を自動セットアップ）
  if (!updatedPkg.scripts) updatedPkg.scripts = {};
  if (!updatedPkg.scripts.prepare) {
    updatedPkg.scripts.prepare = 'husky';
    console.log('  ✓ scripts.prepare = "husky" を追加');
  }

  // lint-staged 設定
  updatedPkg['lint-staged'] = buildLintStagedConfig(useEslint, usePrettier, fileTypes);
  console.log('  ✓ lint-staged 設定を追加:');
  console.log(JSON.stringify(updatedPkg['lint-staged'], null, 4).split('\n').map(l => '    ' + l).join('\n'));

  writePkg(projDir, updatedPkg);

  // 設定ファイル生成
  console.log('\n─── 設定ファイル ────────────────────────');
  if (useEslint)   writeEslintConfig(projDir);
  if (usePrettier) writePrettierConfig(projDir);

  // 動作確認
  console.log('\n─── 動作確認 ────────────────────────────');
  console.log('  lint-staged の設定確認:');
  const check = runSilent('npx lint-staged --list-different 2>&1 || true', projDir);
  if (check !== null) console.log('  ✓ lint-staged が応答しました');

  console.log('\n========================================');
  console.log('  セットアップ完了！');
  console.log('========================================\n');
  console.log('次回から git commit 時に自動で以下が実行されます:');
  if (useEslint)   console.log('  • ESLint --fix（構文エラーを自動修正）');
  if (usePrettier) console.log('  • Prettier --write（フォーマット統一）');
  console.log('\n手動実行:');
  console.log('  npx lint-staged       # ステージされたファイルのみ');
  console.log('  npx eslint src/ --fix # 全ファイル対象\n');
}

main().catch(err => { console.error(err); rl.close(); process.exit(1); });
