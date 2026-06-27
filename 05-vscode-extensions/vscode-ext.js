#!/usr/bin/env node
'use strict';

const readline = require('readline');
const fs       = require('fs');
const path     = require('path');

const rl  = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

// ─── 拡張機能カタログ ─────────────────────────────────────────────
const CATEGORIES = {
  '1': {
    label: 'Node.js / JavaScript',
    extensions: [
      { id: 'dbaeumer.vscode-eslint',            name: 'ESLint',                desc: 'Lintエラーをリアルタイム表示' },
      { id: 'esbenp.prettier-vscode',            name: 'Prettier',              desc: 'コード自動フォーマット' },
      { id: 'christian-kohler.npm-intellisense', name: 'npm Intellisense',      desc: 'importのnpmパッケージ補完' },
      { id: 'eg2.vscode-npm-script',             name: 'npm Script Runner',     desc: 'npm scriptsをサイドバーから実行' },
      { id: 'ms-vscode.js-debug-nightly',        name: 'JavaScript Debugger',   desc: 'Node.jsデバッガー強化版' },
    ],
  },
  '2': {
    label: 'TypeScript',
    extensions: [
      { id: 'ms-vscode.vscode-typescript-next',  name: 'TypeScript Nightly',    desc: '最新のTypeScript言語サポート' },
      { id: 'yoavbls.pretty-ts-errors',          name: 'Pretty TS Errors',      desc: 'TypeScriptエラーを読みやすく表示' },
    ],
  },
  '3': {
    label: 'Python',
    extensions: [
      { id: 'ms-python.python',                  name: 'Python',                desc: 'Python言語サポート一式' },
      { id: 'ms-python.pylint',                  name: 'Pylint',                desc: 'Pythonコード品質チェック' },
      { id: 'ms-python.black-formatter',         name: 'Black Formatter',       desc: 'Pythonコード自動フォーマット' },
      { id: 'ms-toolsai.jupyter',                name: 'Jupyter',               desc: 'Jupyterノートブックサポート' },
    ],
  },
  '4': {
    label: 'Git / バージョン管理',
    extensions: [
      { id: 'eamodio.gitlens',                   name: 'GitLens',               desc: 'git blame・履歴をインライン表示' },
      { id: 'mhutchie.git-graph',                name: 'Git Graph',             desc: 'ブランチ履歴をグラフで可視化' },
      { id: 'donjayamanne.githistory',           name: 'Git History',           desc: 'ファイル・行ごとのgit履歴表示' },
    ],
  },
  '5': {
    label: 'Markdown / ドキュメント',
    extensions: [
      { id: 'yzhang.markdown-all-in-one',        name: 'Markdown All in One',   desc: 'プレビュー・目次・ショートカット' },
      { id: 'davidanson.vscode-markdownlint',    name: 'markdownlint',          desc: 'Markdownの書き方チェック' },
      { id: 'bierner.github-markdown-preview',   name: 'GitHub Markdown Preview', desc: 'GitHubスタイルのプレビュー' },
    ],
  },
  '6': {
    label: 'Docker / コンテナ',
    extensions: [
      { id: 'ms-azuretools.vscode-docker',       name: 'Docker',                desc: 'Dockerfile・docker-compose補完・管理' },
      { id: 'ms-vscode-remote.remote-containers', name: 'Dev Containers',       desc: 'コンテナ内で開発環境を再現' },
    ],
  },
  '7': {
    label: '生産性 / UI改善',
    extensions: [
      { id: 'pkief.material-icon-theme',         name: 'Material Icon Theme',   desc: 'ファイルアイコンを見やすく' },
      { id: 'oderwat.indent-rainbow',            name: 'Indent Rainbow',        desc: 'インデントを色分けして視認性向上' },
      { id: 'aaron-bond.better-comments',        name: 'Better Comments',       desc: 'TODO/FIXME等のコメントを色分け' },
      { id: 'streetsidesoftware.code-spell-checker', name: 'Code Spell Checker', desc: '英単語スペルチェック' },
      { id: 'formulahendry.code-runner',         name: 'Code Runner',           desc: '選択コードをワンクリックで実行' },
    ],
  },
  '8': {
    label: 'REST API 開発',
    extensions: [
      { id: 'humao.rest-client',                 name: 'REST Client',           desc: '.http ファイルでAPIテストを記述・実行' },
      { id: 'rangav.vscode-thunder-client',      name: 'Thunder Client',        desc: 'VS Code内蔵のPostman代替' },
    ],
  },
  '9': {
    label: 'Claude Code / AI開発',
    extensions: [
      { id: 'github.copilot',                    name: 'GitHub Copilot',        desc: 'AIコード補完（Claude Codeと併用可）' },
      { id: 'continue.continue',                 name: 'Continue',              desc: 'オープンソースのAIコーディングアシスタント' },
    ],
  },
};

// デフォルト: Node.js + Git + 生産性
const DEFAULT = '1,4,7';

// ─── 選択パース ───────────────────────────────────────────────────
function parseSelection(input) {
  return [...new Set(
    input.split(/[,\s]+/).map(s => s.trim()).filter(s => CATEGORIES[s])
  )];
}

// ─── extensions.json 生成 ─────────────────────────────────────────
function buildExtensionsJson(keys) {
  const seen = new Set();
  const recommendations = [];
  for (const k of keys) {
    for (const ext of CATEGORIES[k].extensions) {
      if (!seen.has(ext.id)) {
        seen.add(ext.id);
        recommendations.push(ext.id);
      }
    }
  }
  return { recommendations };
}

// ─── 既存ファイルとマージ ─────────────────────────────────────────
function mergeExtensions(existingPath, newObj) {
  const existing = JSON.parse(fs.readFileSync(existingPath, 'utf8'));
  const existingSet = new Set(existing.recommendations || []);
  const toAdd = newObj.recommendations.filter(id => !existingSet.has(id));
  if (toAdd.length === 0) return null;
  return { recommendations: [...(existing.recommendations || []), ...toAdd] };
}

// ─── VS Code settings.json（オプション） ─────────────────────────
function buildSettingsJson(keys) {
  const settings = {};
  if (keys.includes('1') || keys.includes('2')) {
    settings['editor.defaultFormatter']   = 'esbenp.prettier-vscode';
    settings['editor.formatOnSave']       = true;
    settings['editor.codeActionsOnSave']  = { 'source.fixAll.eslint': 'explicit' };
    settings['[javascript]']              = { 'editor.defaultFormatter': 'esbenp.prettier-vscode' };
  }
  if (keys.includes('2')) {
    settings['[typescript]'] = { 'editor.defaultFormatter': 'esbenp.prettier-vscode' };
  }
  if (keys.includes('3')) {
    settings['python.defaultInterpreterPath'] = 'python';
    settings['editor.formatOnSave']           = true;
    settings['[python]']                      = { 'editor.defaultFormatter': 'ms-python.black-formatter' };
  }
  if (keys.includes('5')) {
    settings['[markdown]'] = { 'editor.formatOnSave': false };
  }
  return settings;
}

// ─── メイン ──────────────────────────────────────────────────────
async function main() {
  console.log('\n========================================');
  console.log('  VS Code 推奨拡張機能 生成ツール');
  console.log('========================================\n');

  console.log('カテゴリを選んでください（複数可・カンマ区切り）:\n');
  for (const [k, v] of Object.entries(CATEGORIES)) {
    const extCount = v.extensions.length;
    console.log(`  ${k.padStart(2)}. ${v.label.padEnd(26)} (${extCount}個)`);
  }

  const input  = (await ask(`\n番号を入力 [${DEFAULT}]: `)).trim() || DEFAULT;
  const keys   = parseSelection(input);

  if (keys.length === 0) {
    console.log('有効なカテゴリが選択されていません。');
    rl.close(); return;
  }

  console.log('\n選択:');
  keys.forEach(k => {
    console.log(`  ✓ ${CATEGORIES[k].label}`);
    CATEGORIES[k].extensions.forEach(e => console.log(`      - ${e.name}: ${e.desc}`));
  });

  const withSettings = (await ask('\n.vscode/settings.json も生成しますか？ [y/N]: ')).trim().toLowerCase() === 'y';
  const dir          = (await ask('出力先ディレクトリ [.]: ')).trim() || '.';

  rl.close();

  const targetDir  = path.resolve(dir);
  const vscodeDir  = path.join(targetDir, '.vscode');
  const extPath    = path.join(vscodeDir, 'extensions.json');
  const setPath    = path.join(vscodeDir, 'settings.json');

  if (!fs.existsSync(targetDir)) {
    console.log(`\nエラー: ディレクトリが見つかりません（${targetDir}）`); return;
  }

  fs.mkdirSync(vscodeDir, { recursive: true });

  // extensions.json
  const newExtObj = buildExtensionsJson(keys);
  let finalExtObj;

  if (fs.existsSync(extPath)) {
    const merged = mergeExtensions(extPath, newExtObj);
    if (merged === null) {
      console.log('\n  - extensions.json は既に最新です。変更なし。');
      finalExtObj = JSON.parse(fs.readFileSync(extPath, 'utf8'));
    } else {
      finalExtObj = merged;
      fs.writeFileSync(extPath, JSON.stringify(merged, null, 2) + '\n', 'utf8');
      console.log(`\n  ✓ .vscode/extensions.json を更新（追加: ${merged.recommendations.length - (JSON.parse(fs.readFileSync(extPath, 'utf8')).recommendations?.length || 0)}件）`);
    }
  } else {
    fs.writeFileSync(extPath, JSON.stringify(newExtObj, null, 2) + '\n', 'utf8');
    finalExtObj = newExtObj;
    console.log(`\n  ✓ .vscode/extensions.json 作成（${newExtObj.recommendations.length}件）`);
  }

  // settings.json（オプション）
  if (withSettings) {
    const settingsObj = buildSettingsJson(keys);
    if (Object.keys(settingsObj).length > 0) {
      if (fs.existsSync(setPath)) {
        const existing = JSON.parse(fs.readFileSync(setPath, 'utf8'));
        const merged   = { ...settingsObj, ...existing }; // 既存設定を優先
        fs.writeFileSync(setPath, JSON.stringify(merged, null, 2) + '\n', 'utf8');
        console.log('  ✓ .vscode/settings.json を更新（既存設定を優先）');
      } else {
        fs.writeFileSync(setPath, JSON.stringify(settingsObj, null, 2) + '\n', 'utf8');
        console.log('  ✓ .vscode/settings.json 作成');
      }
    }
  }

  // インストールコマンド表示
  console.log('\n─── 一括インストールコマンド ─────────────');
  const installCmd = finalExtObj.recommendations
    .map(id => `code --install-extension ${id}`)
    .join('\n');
  console.log(installCmd);
  console.log('──────────────────────────────────────────');

  // インストールスクリプトを保存
  const installScriptPath = path.join(vscodeDir, 'install-extensions.sh');
  fs.writeFileSync(
    installScriptPath,
    '#!/bin/bash\n# VS Code 拡張機能一括インストール\n' + installCmd + '\n',
    'utf8'
  );
  console.log(`\n  ✓ .vscode/install-extensions.sh も保存しました\n`);
  console.log('完了！\n');
}

main().catch(err => { console.error(err); rl.close(); process.exit(1); });
