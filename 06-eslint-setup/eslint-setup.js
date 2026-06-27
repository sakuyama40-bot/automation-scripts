#!/usr/bin/env node
'use strict';

const readline = require('readline');
const fs       = require('fs');
const path     = require('path');

const rl  = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

// ─── プロジェクトタイプ定義 ───────────────────────────────────────
const PROJECT_TYPES = [
  { id: 1, label: 'Node.js（基本）',           key: 'node' },
  { id: 2, label: 'Node.js + TypeScript',      key: 'node-ts' },
  { id: 3, label: 'React（JSX）',              key: 'react' },
  { id: 4, label: 'React + TypeScript（TSX）', key: 'react-ts' },
  { id: 5, label: 'Next.js',                   key: 'next' },
];

// ─── 必要パッケージ ───────────────────────────────────────────────
const PACKAGES = {
  base:    ['eslint'],
  ts:      ['@typescript-eslint/parser', '@typescript-eslint/eslint-plugin'],
  react:   ['eslint-plugin-react', 'eslint-plugin-react-hooks'],
  next:    ['eslint-config-next'],
  prettier:['eslint-config-prettier'],
};

function getRequiredPackages(typeKey, usePrettier) {
  const pkgs = [...PACKAGES.base];
  if (typeKey.includes('ts'))    pkgs.push(...PACKAGES.ts);
  if (typeKey.includes('react')) pkgs.push(...PACKAGES.react);
  if (typeKey === 'next')        pkgs.push(...PACKAGES.next);
  if (usePrettier)               pkgs.push(...PACKAGES.prettier);
  return [...new Set(pkgs)];
}

// ─── .eslintrc.json 設定生成 ─────────────────────────────────────
function buildConfig(typeKey, opts) {
  const { useEsm, useJest, usePrettier } = opts;
  const sourceType = useEsm ? 'module' : 'commonjs';

  // 共通 env
  const env = { es2022: true };
  if (typeKey !== 'next') {
    env[typeKey.includes('react') ? 'browser' : 'node'] = true;
    env.commonjs = !useEsm;
  }
  if (useJest) env.jest = true;

  const configs = {
    node: {
      env,
      extends: usePrettier ? ['eslint:recommended', 'prettier'] : ['eslint:recommended'],
      parserOptions: { ecmaVersion: 2022, sourceType },
      rules: {
        'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
        'no-console':     'off',
        'eqeqeq':         ['error', 'always'],
        'no-var':         'error',
        'prefer-const':   'error',
      },
    },

    'node-ts': {
      env,
      extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
        ...(usePrettier ? ['prettier'] : []),
      ],
      parser:  '@typescript-eslint/parser',
      plugins: ['@typescript-eslint'],
      parserOptions: { ecmaVersion: 2022, sourceType },
      rules: {
        '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
        '@typescript-eslint/no-explicit-any': 'warn',
        'no-console': 'off',
        'eqeqeq':     ['error', 'always'],
        'prefer-const': 'error',
      },
    },

    react: {
      env,
      extends: [
        'eslint:recommended',
        'plugin:react/recommended',
        'plugin:react-hooks/recommended',
        ...(usePrettier ? ['prettier'] : []),
      ],
      plugins: ['react', 'react-hooks'],
      parserOptions: { ecmaVersion: 2022, sourceType, ecmaFeatures: { jsx: true } },
      settings: { react: { version: 'detect' } },
      rules: {
        'react/prop-types':          'off',
        'react/react-in-jsx-scope':  'off',
        'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
        'prefer-const':   'error',
      },
    },

    'react-ts': {
      env,
      extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
        'plugin:react/recommended',
        'plugin:react-hooks/recommended',
        ...(usePrettier ? ['prettier'] : []),
      ],
      parser:  '@typescript-eslint/parser',
      plugins: ['@typescript-eslint', 'react', 'react-hooks'],
      parserOptions: {
        ecmaVersion: 2022, sourceType,
        ecmaFeatures: { jsx: true },
      },
      settings: { react: { version: 'detect' } },
      rules: {
        'react/prop-types':                   'off',
        'react/react-in-jsx-scope':           'off',
        '@typescript-eslint/no-unused-vars':  ['warn', { argsIgnorePattern: '^_' }],
        '@typescript-eslint/no-explicit-any': 'warn',
        'prefer-const': 'error',
      },
    },

    next: {
      extends: [
        'next/core-web-vitals',
        ...(usePrettier ? ['prettier'] : []),
      ],
      rules: {
        'prefer-const': 'error',
        'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      },
    },
  };

  return configs[typeKey] || configs.node;
}

// ─── .eslintignore 生成 ──────────────────────────────────────────
function buildIgnore(typeKey) {
  const lines = [
    'node_modules/',
    'dist/',
    'build/',
    'coverage/',
    '*.min.js',
  ];
  if (typeKey === 'next') lines.push('.next/');
  return lines.join('\n') + '\n';
}

// ─── package.json scripts 更新 ───────────────────────────────────
function updatePackageJson(projDir, typeKey) {
  const pkgPath = path.join(projDir, 'package.json');
  if (!fs.existsSync(pkgPath)) return false;
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  if (!pkg.scripts) pkg.scripts = {};
  const ext = typeKey.includes('ts') || typeKey === 'next'
    ? '--ext .js,.jsx,.ts,.tsx'
    : '--ext .js,.jsx';
  if (!pkg.scripts.lint)      pkg.scripts.lint      = `eslint . ${ext}`;
  if (!pkg.scripts['lint:fix']) pkg.scripts['lint:fix'] = `eslint . ${ext} --fix`;
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
  console.log('  ESLint 設定自動生成ツール');
  console.log('========================================\n');

  const dir     = (await ask('対象プロジェクトのパス [.]: ')).trim() || '.';
  const projDir = path.resolve(dir);

  if (!fs.existsSync(projDir)) {
    console.log(`\nエラー: ディレクトリが見つかりません（${projDir}）`);
    rl.close(); return;
  }

  // プロジェクトタイプ選択
  console.log('\nプロジェクトタイプを選んでください:');
  PROJECT_TYPES.forEach(t => console.log(`  ${t.id}. ${t.label}`));
  const typeInput = (await ask('\n番号を入力 [1]: ')).trim() || '1';
  const typeObj   = PROJECT_TYPES.find(t => t.id === +typeInput) || PROJECT_TYPES[0];
  const typeKey   = typeObj.key;
  console.log(`  → ${typeObj.label}`);

  // オプション
  const useEsmAns     = (await ask('\nES Modules (import/export) を使いますか？ [y/N]: ')).trim().toLowerCase();
  const useJestAns    = (await ask('Jest 環境を有効にしますか？ [y/N]: ')).trim().toLowerCase();
  const usePrettierAns= (await ask('Prettier と連携しますか？（eslint-config-prettier）[y/N]: ')).trim().toLowerCase();

  rl.close();

  const opts = {
    useEsm:      useEsmAns === 'y',
    useJest:     useJestAns === 'y',
    usePrettier: usePrettierAns === 'y',
  };

  // 設定生成
  const config     = buildConfig(typeKey, opts);
  const configJson = JSON.stringify(config, null, 2) + '\n';
  const ignoreText = buildIgnore(typeKey);

  // ファイル書き込み
  const rcPath     = path.join(projDir, '.eslintrc.json');
  const ignorePath = path.join(projDir, '.eslintignore');

  const rcExisted     = writeWithBackup(rcPath, configJson);
  const ignoreExisted = writeWithBackup(ignorePath, ignoreText);

  // package.json 更新
  const pkgUpdated = updatePackageJson(projDir, typeKey);

  // 必要パッケージ
  const pkgs       = getRequiredPackages(typeKey, opts.usePrettier);
  const installCmd = `npm install --save-dev ${pkgs.join(' ')}`;

  // 結果表示
  console.log('\n─── 生成結果 ────────────────────────────');
  console.log(`  ✓ ${rcPath}${rcExisted ? '  (.bak バックアップ済み)' : ''}`);
  console.log(`  ✓ ${ignorePath}${ignoreExisted ? '  (.bak バックアップ済み)' : ''}`);
  if (pkgUpdated) {
    console.log('  ✓ package.json に lint / lint:fix スクリプトを追加');
  }
  console.log('\n  設定概要:');
  console.log(`    タイプ    : ${typeObj.label}`);
  console.log(`    モジュール: ${opts.useEsm ? 'ESM (import/export)' : 'CommonJS (require)'}`);
  console.log(`    Jest 環境 : ${opts.useJest ? 'あり' : 'なし'}`);
  console.log(`    Prettier  : ${opts.usePrettier ? '連携あり' : 'なし'}`);

  console.log('\n  次のステップ:');
  console.log('  1. パッケージをインストール:');
  console.log(`     ${installCmd}`);
  console.log('  2. 動作確認:');
  console.log('     npm run lint');
  console.log('  3. 自動修正:');
  console.log('     npm run lint:fix');
  console.log('──────────────────────────────────────────\n');
  console.log('完了！\n');
}

main().catch(err => { console.error(err); rl.close(); process.exit(1); });
