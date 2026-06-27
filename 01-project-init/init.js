#!/usr/bin/env node
'use strict';

const readline = require('readline');
const fs = require('fs');
const path = require('path');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

// ─── プロジェクトタイプ定義 ───────────────────────────────────────
const TYPES = {
  '1': { label: 'Node.js CLIツール',      key: 'cli'    },
  '2': { label: 'Express APIサーバー',    key: 'api'    },
  '3': { label: '汎用自動化スクリプト',    key: 'script' },
  '4': { label: 'フルセット（全部入り）',  key: 'full'   },
};

// ─── package.json テンプレート ────────────────────────────────────
function buildPackageJson(name, description, type) {
  const scripts = {
    cli:    { start: 'node src/index.js', dev: 'node --watch src/index.js', test: 'echo "No tests yet"' },
    api:    { start: 'node src/index.js', dev: 'node --watch src/index.js', test: 'echo "No tests yet"' },
    script: { start: 'node src/index.js', dev: 'node --watch src/index.js', test: 'echo "No tests yet"' },
    full:   { start: 'node src/index.js', dev: 'node --watch src/index.js', build: 'echo "No build"', test: 'echo "No tests yet"', lint: 'eslint src/', format: 'prettier --write src/' },
  };

  const deps = {
    cli:    {},
    api:    { express: '^4.18.2', dotenv: '^16.0.3' },
    script: { dotenv: '^16.0.3' },
    full:   { express: '^4.18.2', dotenv: '^16.0.3' },
  };

  const devDeps = {
    cli:    {},
    api:    {},
    script: {},
    full:   { eslint: '^8.0.0', prettier: '^3.0.0' },
  };

  const pkg = { name, version: '1.0.0', description, main: 'src/index.js', scripts: scripts[type] };
  if (Object.keys(deps[type]).length)    pkg.dependencies    = deps[type];
  if (Object.keys(devDeps[type]).length) pkg.devDependencies = devDeps[type];
  return pkg;
}

// ─── src/index.js テンプレート ────────────────────────────────────
const INDEX = {
  cli: `#!/usr/bin/env node
'use strict';

async function main() {
  const args = process.argv.slice(2);
  console.log('起動しました。引数:', args);
  // ここにCLI処理を書く
}

main().catch(err => { console.error(err); process.exit(1); });
`,
  api: `'use strict';

require('dotenv').config();
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/', (_req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => console.log(\`サーバー起動: http://localhost:\${PORT}\`));
`,
  script: `'use strict';

require('dotenv').config();

async function main() {
  console.log('スクリプト開始');
  // ここに処理を書く
}

main().catch(err => { console.error('エラー:', err); process.exit(1); });
`,
  full: `'use strict';

require('dotenv').config();
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/', (_req, res) => res.json({ status: 'ok', type: 'fullset' }));

app.listen(PORT, () => console.log(\`サーバー起動: http://localhost:\${PORT}\`));
`,
};

// ─── 共通ファイル ─────────────────────────────────────────────────
const GITIGNORE = `node_modules/\n.env\n*.log\n.DS_Store\ndist/\ncoverage/\n`;

const ENV_EXAMPLE = `# .env.example — .envにコピーして値を埋める
PORT=3000
# DATABASE_URL=
# API_KEY=
`;

// ─── ディレクトリ構成 ─────────────────────────────────────────────
const DIRS = {
  cli:    ['src', 'src/commands'],
  api:    ['src', 'src/routes', 'src/middleware'],
  script: ['src', 'src/utils'],
  full:   ['src', 'src/routes', 'src/middleware', 'src/utils', 'src/commands'],
};

function write(filePath, content) {
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('  ✓', path.relative(process.cwd(), filePath));
}

// ─── メイン ──────────────────────────────────────────────────────
async function main() {
  console.log('\n========================================');
  console.log('  プロジェクト初期化ツール');
  console.log('========================================\n');

  const name = (await ask('プロジェクト名 [my-project]: ')).trim() || 'my-project';
  const desc = (await ask('説明（任意）: ')).trim() || '';

  console.log('\nプロジェクトタイプを選んでください:');
  for (const [k, v] of Object.entries(TYPES)) console.log(`  ${k}. ${v.label}`);

  const typeInput = (await ask('\n番号を入力 [3]: ')).trim() || '3';
  const chosen = TYPES[typeInput] || TYPES['3'];

  const defaultOut = `./${name}`;
  const outInput = (await ask(`\n作成先 [${defaultOut}]: `)).trim() || defaultOut;
  rl.close();

  const target = path.resolve(outInput);
  console.log(`\n「${chosen.label}」を作成中: ${target}\n`);

  // ディレクトリ作成
  for (const d of DIRS[chosen.key]) {
    fs.mkdirSync(path.join(target, d), { recursive: true });
  }

  // ファイル生成
  write(path.join(target, 'package.json'),   JSON.stringify(buildPackageJson(name, desc, chosen.key), null, 2) + '\n');
  write(path.join(target, 'src', 'index.js'), INDEX[chosen.key]);
  write(path.join(target, '.gitignore'),      GITIGNORE);
  write(path.join(target, '.env.example'),    ENV_EXAMPLE);

  console.log('\n========================================');
  console.log('  完了！');
  console.log('========================================');
  console.log(`\n次のステップ:`);
  console.log(`  cd ${outInput}`);
  if (['api', 'script', 'full'].includes(chosen.key)) console.log(`  npm install`);
  console.log(`  npm run dev\n`);
}

main().catch(err => { console.error(err); rl.close(); process.exit(1); });
