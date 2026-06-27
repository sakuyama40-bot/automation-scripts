#!/usr/bin/env node
'use strict';

const readline = require('readline');
const fs = require('fs');
const path = require('path');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (prompt) => new Promise(resolve => rl.question(prompt, resolve));
const askDefault = async (prompt, def) => {
  const ans = (await ask(`${prompt} [${def}]: `)).trim();
  return ans || def;
};

// ─── プロジェクトタイプ ───────────────────────────────────────────
const TYPES = {
  '1': 'cli',
  '2': 'api',
  '3': 'script',
  '4': 'library',
  '5': 'full',
};

const TYPE_LABELS = {
  cli:     'Node.js CLIツール',
  api:     'Express APIサーバー',
  script:  '汎用自動化スクリプト',
  library: 'ライブラリ / パッケージ',
  full:    'フルプロジェクト',
};

// ─── テンプレート関数 ─────────────────────────────────────────────

function renderCli(d) {
  return `# ${d.name}

${d.description}

## 必要な環境

- Node.js ${d.nodeVersion}+

## インストール

\`\`\`bash
git clone <repository-url>
cd ${d.slug}
npm install
\`\`\`

## 使い方

\`\`\`bash
${d.command}
\`\`\`

${d.example ? `### 実行例\n\n\`\`\`bash\n${d.example}\n\`\`\`\n` : ''}
## オプション

| オプション | 説明 |
|---|---|
| `--help` | ヘルプを表示 |
| `--version` | バージョンを表示 |

## ディレクトリ構成

\`\`\`
${d.slug}/
├── src/
│   ├── index.js       # エントリポイント
│   └── commands/      # コマンド定義
├── package.json
└── README.md
\`\`\`

## ライセンス

${d.license}
`;
}

function renderApi(d) {
  return `# ${d.name}

${d.description}

## 必要な環境

- Node.js ${d.nodeVersion}+

## セットアップ

\`\`\`bash
git clone <repository-url>
cd ${d.slug}
npm install
cp .env.example .env
# .env を編集して環境変数を設定
\`\`\`

## 起動

\`\`\`bash
# 開発
npm run dev

# 本番
npm start
\`\`\`

サーバーは `http://localhost:${d.port}` で起動します。

## 環境変数

| 変数名 | 説明 | デフォルト |
|---|---|---|
| `PORT` | ポート番号 | `${d.port}` |
| `NODE_ENV` | 実行環境 | `development` |

詳細は `.env.example` を参照してください。

## エンドポイント

| メソッド | パス | 説明 |
|---|---|---|
| GET | `/` | ヘルスチェック |
${d.endpoints}

## ディレクトリ構成

\`\`\`
${d.slug}/
├── src/
│   ├── index.js       # エントリポイント
│   ├── routes/        # ルーティング
│   └── middleware/    # ミドルウェア
├── .env.example
├── package.json
└── README.md
\`\`\`

## ライセンス

${d.license}
`;
}

function renderScript(d) {
  return `# ${d.name}

${d.description}

## 必要な環境

- Node.js ${d.nodeVersion}+

## セットアップ

\`\`\`bash
git clone <repository-url>
cd ${d.slug}
npm install
cp .env.example .env
# .env に必要な情報を記入
\`\`\`

## 実行

\`\`\`bash
npm start
\`\`\`

${d.schedule ? `### 定期実行（cron 例）\n\n\`\`\`bash\n${d.schedule}\n\`\`\`\n` : ''}
## 設定（.env）

\`\`\`
# .env.example を参照
\`\`\`

## 処理の流れ

1. TODO: 処理ステップ1
2. TODO: 処理ステップ2
3. TODO: 処理ステップ3

## 注意事項

- 実行前に `.env` の設定を必ず確認してください
- 外部APIへの送信は本番実行前に必ず確認を取ってください

## ディレクトリ構成

\`\`\`
${d.slug}/
├── src/
│   ├── index.js       # エントリポイント
│   └── utils/         # ユーティリティ
├── .env.example
├── package.json
└── README.md
\`\`\`

## ライセンス

${d.license}
`;
}

function renderLibrary(d) {
  return `# ${d.name}

${d.description}

[![npm version](https://img.shields.io/npm/v/${d.slug}.svg)](https://www.npmjs.com/package/${d.slug})

## インストール

\`\`\`bash
npm install ${d.slug}
\`\`\`

## 使い方

\`\`\`js
const ${d.importName} = require('${d.slug}');

// TODO: 基本的な使い方をここに書く
\`\`\`

## API

### \`${d.mainFunction}(options)\`

| パラメータ | 型 | 説明 |
|---|---|---|
| `options` | `Object` | 設定オプション |

**戻り値:** TODO

## 必要な環境

- Node.js ${d.nodeVersion}+

## ライセンス

${d.license}
`;
}

function renderFull(d) {
  return `# ${d.name}

${d.description}

## 必要な環境

- Node.js ${d.nodeVersion}+

## セットアップ

\`\`\`bash
git clone <repository-url>
cd ${d.slug}
npm install
cp .env.example .env
\`\`\`

## 開発

\`\`\`bash
npm run dev      # 開発サーバー起動
npm test         # テスト実行
npm run lint     # Lint チェック
npm run format   # フォーマット
\`\`\`

## 本番デプロイ

\`\`\`bash
npm run build
npm start
\`\`\`

## 環境変数

`.env.example` を `.env` にコピーして値を設定してください。

## ディレクトリ構成

\`\`\`
${d.slug}/
├── src/
│   ├── index.js
│   ├── routes/
│   ├── middleware/
│   ├── utils/
│   └── commands/
├── tests/
├── .env.example
├── .gitignore
├── package.json
└── README.md
\`\`\`

## ライセンス

${d.license}
`;
}

const RENDERERS = { cli: renderCli, api: renderApi, script: renderScript, library: renderLibrary, full: renderFull };

// ─── スラッグ変換 ─────────────────────────────────────────────────
function toSlug(name) {
  return name.trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/[^\w-]/g, '');
}

// ─── タイプ別の追加質問 ───────────────────────────────────────────
async function askExtra(type, d) {
  switch (type) {
    case 'cli':
      d.command  = await askDefault('実行コマンド（例: node src/index.js --input file.csv）', `node src/index.js`);
      d.example  = (await ask('実行例（任意、Enterでスキップ）: ')).trim();
      break;
    case 'api':
      d.port      = await askDefault('ポート番号', '3000');
      const ep    = (await ask('主なエンドポイント（例: POST /api/users → ユーザー作成, Enterでスキップ）: ')).trim();
      d.endpoints = ep
        ? ep.split(',').map(e => {
            const [path, desc] = e.split('→').map(s => s.trim());
            const [method, p]  = path.trim().split(' ');
            return `| ${method || 'GET'} | \`${p || path}\` | ${desc || ''} |`;
          }).join('\n')
        : '| GET | `/api/example` | サンプル |';
      break;
    case 'script':
      d.schedule = (await ask('定期実行スケジュール例（例: 0 9 * * * node src/index.js、Enterでスキップ）: ')).trim();
      break;
    case 'library':
      d.importName   = await askDefault('import変数名（例: myLib）', toSlug(d.name).replace(/-./g, c => c[1].toUpperCase()));
      d.mainFunction = await askDefault('主な関数名（例: processData）', 'main');
      break;
    case 'full':
      break;
  }
}

// ─── メイン ──────────────────────────────────────────────────────
async function main() {
  console.log('\n========================================');
  console.log('  README テンプレート生成ツール');
  console.log('========================================\n');

  const name    = await askDefault('プロジェクト名', 'my-project');
  const desc    = (await ask('概要（1〜2文）: ')).trim() || 'TODO: プロジェクトの概要を書いてください。';

  console.log('\nプロジェクトタイプを選んでください:');
  for (const [k, v] of Object.entries(TYPE_LABELS)) console.log(`  ${Object.keys(TYPE_LABELS).indexOf(k) + 1}. ${v}`);

  const typeNum = (await ask('\n番号を入力 [3]: ')).trim() || '3';
  const typeKey = TYPES[typeNum] || 'script';

  const nodeVersion = await askDefault('Node.jsの最低バージョン', '18');

  console.log('\nライセンスを選んでください:');
  console.log('  1. MIT（デフォルト）');
  console.log('  2. ISC');
  console.log('  3. なし（プライベートプロジェクト）');
  const licNum = (await ask('番号を入力 [1]: ')).trim() || '1';
  const license = licNum === '2' ? 'ISC' : licNum === '3' ? 'UNLICENSED' : 'MIT';

  const d = { name, description: desc, slug: toSlug(name), nodeVersion, license };

  console.log(`\n--- ${TYPE_LABELS[typeKey]} の追加情報 ---`);
  await askExtra(typeKey, d);

  const dir        = (await ask('\n出力先ディレクトリ [.]: ')).trim() || '.';
  const targetDir  = path.resolve(dir);
  const outputPath = path.join(targetDir, 'README.md');

  rl.close();

  if (!fs.existsSync(targetDir)) {
    console.log(`\nエラー: ディレクトリが見つかりません（${targetDir}）`);
    return;
  }

  if (fs.existsSync(outputPath)) {
    console.log('\n警告: README.md が既に存在します。README.md.bak にバックアップして上書きします。');
    fs.copyFileSync(outputPath, outputPath + '.bak');
  }

  const content = RENDERERS[typeKey](d);
  fs.writeFileSync(outputPath, content, 'utf8');

  const lineCount = content.split('\n').length;
  console.log(`\n  ✓ README.md 生成完了（${lineCount}行）`);
  console.log(`  場所: ${outputPath}`);

  // プレビュー（先頭20行）
  console.log('\n─── プレビュー（先頭20行）──────────────');
  content.split('\n').slice(0, 20).forEach(l => console.log('  ' + l));
  console.log('  ...');
  console.log('─────────────────────────────────────────\n');
  console.log('完了！\n');
}

main().catch(err => { console.error(err); rl.close(); process.exit(1); });
