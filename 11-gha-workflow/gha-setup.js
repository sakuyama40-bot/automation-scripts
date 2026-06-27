#!/usr/bin/env node
'use strict';

const readline = require('readline');
const fs       = require('fs');
const path     = require('path');

const rl  = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

// ─── パッケージマネージャー設定 ──────────────────────────────────
const PM = {
  npm:  { cache: 'npm',  install: 'npm ci',                        run: 'npm run' },
  yarn: { cache: 'yarn', install: 'yarn install --frozen-lockfile', run: 'yarn' },
  pnpm: { cache: 'pnpm', install: 'pnpm install --frozen-lockfile', run: 'pnpm' },
};

// ─── YAML ビルダー ───────────────────────────────────────────────

function buildCI(opts) {
  const { pm, nodeVersions, branches, useLint, useTypecheck, useTest } = opts;
  const { cache, install, run } = PM[pm];
  const branchList = branches.map(b => `[${b}]`).join(', ');
  const matrix     = nodeVersions.length > 1
    ? `    strategy:\n      matrix:\n        node-version: [${nodeVersions.map(v => `'${v}'`).join(', ')}]\n`
    : '';
  const nodeRef = nodeVersions.length > 1
    ? `\${{ matrix.node-version }}`
    : nodeVersions[0];
  const steps = [
    `      - uses: actions/checkout@v4`,
    `      - name: Node.js ${nodeVersions.length > 1 ? '${{ matrix.node-version }}' : nodeVersions[0]} セットアップ`,
    `        uses: actions/setup-node@v4`,
    `        with:`,
    `          node-version: '${nodeRef}'`,
    `          cache: '${cache}'`,
    `      - name: 依存関係インストール`,
    `        run: ${install}`,
  ];
  if (useLint)      steps.push(`      - name: Lint\n        run: ${run} lint`);
  if (useTypecheck) steps.push(`      - name: 型チェック\n        run: ${run} typecheck`);
  if (useTest)      steps.push(`      - name: テスト\n        run: ${run} test`);

  return `name: CI

on:
  push:
    branches: [${branches.map(b => `'${b}'`).join(', ')}]
  pull_request:
    branches: [${branches.map(b => `'${b}'`).join(', ')}]

jobs:
  ci:
    runs-on: ubuntu-latest
${matrix}    steps:
${steps.join('\n')}
`;
}

function buildDeploy(opts) {
  const { pm, nodeVersion, deployTarget, buildCmd, deployCmd } = opts;
  const { cache, install } = PM[pm];

  if (deployTarget === 'pages') {
    return `name: GitHub Pages デプロイ

on:
  push:
    branches: ['main']

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: 'pages'
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '${nodeVersion}'
          cache: '${cache}'
      - run: ${install}
      - run: ${buildCmd}
      - uses: actions/upload-pages-artifact@v3
        with:
          path: './dist'

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/deploy-pages@v4
        id: deployment
`;
  }

  // カスタムデプロイ
  return `name: デプロイ

on:
  push:
    branches: ['main']

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '${nodeVersion}'
          cache: '${cache}'
      - run: ${install}
      - name: ビルド
        run: ${buildCmd}
      - name: デプロイ
        run: ${deployCmd}
        env:
          DEPLOY_KEY: \${{ secrets.DEPLOY_KEY }}
`;
}

function buildPublish(opts) {
  const { pm, nodeVersion, registry } = opts;
  const { cache, install } = PM[pm];
  const registryUrl = registry === 'github'
    ? 'https://npm.pkg.github.com'
    : 'https://registry.npmjs.org';
  const tokenSecret = registry === 'github' ? 'GITHUB_TOKEN' : 'NPM_TOKEN';

  return `name: npm パッケージ公開

on:
  release:
    types: [published]

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '${nodeVersion}'
          cache: '${cache}'
          registry-url: '${registryUrl}'
      - run: ${install}
      - name: ビルド
        run: npm run build --if-present
      - name: 公開
        run: npm publish
        env:
          NODE_AUTH_TOKEN: \${{ secrets.${tokenSecret} }}
`;
}

function buildDependabot(opts) {
  const { pm, interval, targetBranch } = opts;
  const ecosystem = pm === 'npm' ? 'npm' : pm;

  return `version: 2
updates:
  - package-ecosystem: '${ecosystem}'
    directory: '/'
    schedule:
      interval: '${interval}'
    target-branch: '${targetBranch}'
    open-pull-requests-limit: 10
    labels:
      - 'dependencies'
`;
}

// ─── ワークフロー選択肢 ──────────────────────────────────────────
const WORKFLOWS = {
  1: { label: 'CI（lint / typecheck / test）',    key: 'ci' },
  2: { label: 'デプロイ（GitHub Pages / カスタム）', key: 'deploy' },
  3: { label: 'npm パッケージ公開',                key: 'publish' },
  4: { label: 'Dependabot（依存関係自動更新）',     key: 'dependabot' },
};

// ─── ヘルパー ────────────────────────────────────────────────────
function parseMulti(input, max) {
  if (!input.trim()) return Object.keys(WORKFLOWS).map(Number);
  return [...new Set(
    input.split(',').map(s => parseInt(s.trim(), 10)).filter(n => n >= 1 && n <= max)
  )];
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const existed = fs.existsSync(filePath);
  if (existed) fs.copyFileSync(filePath, filePath + '.bak');
  fs.writeFileSync(filePath, content, 'utf8');
  return existed;
}

// ─── 共通オプション収集 ──────────────────────────────────────────
async function askCommon() {
  const pmRaw = (await ask('パッケージマネージャー [npm/yarn/pnpm] [npm]: ')).trim().toLowerCase();
  const pm    = PM[pmRaw] ? pmRaw : 'npm';

  const nodeRaw     = (await ask('Node.js バージョン（複数はカンマ区切り） [20.x]: ')).trim();
  const nodeVersions = nodeRaw
    ? nodeRaw.split(',').map(s => s.trim()).filter(Boolean)
    : ['20.x'];

  const branchRaw = (await ask('対象ブランチ（カンマ区切り） [main]: ')).trim();
  const branches  = branchRaw
    ? branchRaw.split(',').map(s => s.trim()).filter(Boolean)
    : ['main'];

  return { pm, nodeVersions, branches };
}

// ─── メイン ──────────────────────────────────────────────────────
async function main() {
  console.log('\n========================================');
  console.log('  GitHub Actions ワークフロー生成ツール');
  console.log('========================================\n');

  const dir     = (await ask('対象プロジェクトのパス [.]: ')).trim() || '.';
  const projDir = path.resolve(dir);
  const wfDir   = path.join(projDir, '.github', 'workflows');

  // ワークフロー選択
  console.log('\n生成するワークフローを選んでください（複数可・カンマ区切り）:');
  Object.entries(WORKFLOWS).forEach(([id, w]) => console.log(`  ${id}. ${w.label}`));

  const wfInput    = (await ask('\n番号を入力 [1,2,3,4]: ')).trim();
  const selectedIds = parseMulti(wfInput || '1,2,3,4', 4);
  const selected   = selectedIds.map(id => WORKFLOWS[id]).filter(Boolean);

  if (selected.length === 0) {
    console.log('選択されませんでした。'); rl.close(); return;
  }

  // 共通オプション
  console.log('\n─── 共通設定 ────────────────────────────');
  const common = await askCommon();

  const generated = [];

  // CI
  if (selected.find(w => w.key === 'ci')) {
    console.log('\n─── CI 設定 ─────────────────────────────');
    const useLint      = (await ask('lint を実行しますか？ [Y/n]: ')).trim().toLowerCase() !== 'n';
    const useTypecheck = (await ask('typecheck を実行しますか？ [y/N]: ')).trim().toLowerCase() === 'y';
    const useTest      = (await ask('test を実行しますか？ [Y/n]: ')).trim().toLowerCase() !== 'n';

    const yaml = buildCI({ ...common, useLint, useTypecheck, useTest });
    const out  = writeFile(path.join(wfDir, 'ci.yml'), yaml);
    generated.push({ file: path.join(wfDir, 'ci.yml'), existed: out });
  }

  // Deploy
  if (selected.find(w => w.key === 'deploy')) {
    console.log('\n─── デプロイ設定 ────────────────────────');
    console.log('デプロイ先を選んでください:');
    console.log('  1. GitHub Pages');
    console.log('  2. カスタムコマンド（SSH / rsync など）');
    const dtChoice = (await ask('番号 [1]: ')).trim() || '1';
    const deployTarget = dtChoice === '2' ? 'custom' : 'pages';

    const buildCmd  = (await ask('ビルドコマンド [npm run build]: ')).trim() || 'npm run build';
    let deployCmd   = '';
    if (deployTarget === 'custom') {
      deployCmd = (await ask('デプロイコマンド [rsync -av dist/ user@host:/var/www]: ')).trim()
        || 'rsync -av dist/ user@host:/var/www';
    }

    const yaml = buildDeploy({ pm: common.pm, nodeVersion: common.nodeVersions[0], deployTarget, buildCmd, deployCmd });
    const out  = writeFile(path.join(wfDir, 'deploy.yml'), yaml);
    generated.push({ file: path.join(wfDir, 'deploy.yml'), existed: out });
  }

  // Publish
  if (selected.find(w => w.key === 'publish')) {
    console.log('\n─── npm 公開設定 ────────────────────────');
    console.log('レジストリを選んでください:');
    console.log('  1. npm (registry.npmjs.org)');
    console.log('  2. GitHub Packages');
    const regChoice = (await ask('番号 [1]: ')).trim() || '1';
    const registry  = regChoice === '2' ? 'github' : 'npm';

    const yaml = buildPublish({ pm: common.pm, nodeVersion: common.nodeVersions[0], registry });
    const out  = writeFile(path.join(wfDir, 'publish.yml'), yaml);
    generated.push({ file: path.join(wfDir, 'publish.yml'), existed: out });
  }

  // Dependabot
  if (selected.find(w => w.key === 'dependabot')) {
    console.log('\n─── Dependabot 設定 ─────────────────────');
    const intRaw = (await ask('更新頻度 [daily/weekly/monthly] [weekly]: ')).trim().toLowerCase();
    const interval = ['daily','weekly','monthly'].includes(intRaw) ? intRaw : 'weekly';

    const dbPath = path.join(projDir, '.github', 'dependabot.yml');
    const yaml   = buildDependabot({ pm: common.pm, interval, targetBranch: common.branches[0] });
    const out    = writeFile(dbPath, yaml);
    generated.push({ file: dbPath, existed: out });
  }

  rl.close();

  // 結果表示
  console.log('\n─── 生成結果 ────────────────────────────');
  for (const { file, existed } of generated) {
    const rel = path.relative(projDir, file).replace(/\\/g, '/');
    console.log(`  ✓ ${rel}${existed ? '  (.bak バックアップ済み)' : ''}`);
  }

  console.log('\n  次のステップ:');
  console.log('  git add .github/');
  console.log('  git commit -m "ci: GitHub Actions ワークフロー追加"');
  if (generated.find(g => g.file.includes('publish'))) {
    console.log('\n  npm 公開ワークフローを使う場合:');
    console.log('  → GitHub リポジトリ設定で NPM_TOKEN シークレットを追加してください');
  }
  console.log('──────────────────────────────────────────\n');
  console.log('完了！\n');
}

main().catch(err => { console.error(err); rl.close(); process.exit(1); });
