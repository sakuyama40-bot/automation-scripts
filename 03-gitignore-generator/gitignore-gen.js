#!/usr/bin/env node
'use strict';

const readline = require('readline');
const fs = require('fs');
const path = require('path');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

// ─── カテゴリ定義 ─────────────────────────────────────────────────
const CATEGORIES = {
  '1': {
    label: 'Node.js / npm',
    content: `### Node.js ###
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
.npm
.node_repl_history
*.tgz
.yarn-integrity
dist/
build/
out/
coverage/
.nyc_output/
*.min.js
`,
  },
  '2': {
    label: 'Python',
    content: `### Python ###
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
venv/
env/
ENV/
.venv/
dist/
build/
*.egg-info/
.eggs/
*.egg
.pytest_cache/
.mypy_cache/
.ruff_cache/
`,
  },
  '3': {
    label: 'VS Code',
    content: `### VS Code ###
.vscode/settings.json
.vscode/tasks.json
.vscode/launch.json
*.code-workspace
.history/
`,
  },
  '4': {
    label: 'Windows',
    content: `### Windows ###
Thumbs.db
Thumbs.db:encryptable
ehthumbs.db
ehthumbs_vista.db
Desktop.ini
$RECYCLE.BIN/
*.cab
*.msi
*.msix
*.msm
*.msp
*.lnk
`,
  },
  '5': {
    label: 'macOS',
    content: `### macOS ###
.DS_Store
.AppleDouble
.LSOverride
._*
.Spotlight-V100
.Trashes
.fseventsd
.TemporaryItems
`,
  },
  '6': {
    label: 'Docker',
    content: `### Docker ###
docker-compose.override.yml
.docker/
`,
  },
  '7': {
    label: 'React / Next.js',
    content: `### React / Next.js ###
.next/
.nuxt/
.cache/
.parcel-cache/
storybook-static/
`,
  },
  '8': {
    label: 'Claude Code / AI開発',
    content: `### Claude Code / AI ###
.claude/settings.local.json
*.prompt.tmp
llm-cache/
.aider*
`,
  },
  '9': {
    label: 'ログ・一時ファイル（共通）',
    content: `### Logs & Temp ###
*.log
logs/
tmp/
temp/
*.tmp
*.swp
*.swo
*~
`,
  },
  '10': {
    label: '環境変数ファイル（共通・常に推奨）',
    content: `### Environment ###
.env
.env.local
.env.*.local
.env.development.local
.env.test.local
.env.production.local
`,
  },
};

// ─── デフォルト選択（この環境に最適） ────────────────────────────
const DEFAULT = '1,3,4,9,10';

// ─── 選択パース ───────────────────────────────────────────────────
function parseSelection(input) {
  return input
    .split(/[,\s]+/)
    .map(s => s.trim())
    .filter(s => CATEGORIES[s]);
}

// ─── .gitignore 生成 ──────────────────────────────────────────────
function buildGitignore(keys) {
  const header = `# .gitignore — 自動生成: ${new Date().toLocaleDateString('ja-JP')}\n`;
  const body = keys.map(k => CATEGORIES[k].content).join('\n');
  return header + '\n' + body;
}

// ─── 既存ファイルにない行だけ追記 ────────────────────────────────
function mergeGitignore(existingPath, newContent) {
  const existing = fs.readFileSync(existingPath, 'utf8');
  const existingLines = new Set(existing.split(/\r?\n/).map(l => l.trim()));

  const newLines = newContent.split(/\r?\n/);
  const toAppend = newLines.filter(line => {
    const t = line.trim();
    return t && !t.startsWith('#') && !existingLines.has(t);
  });

  if (toAppend.length === 0) return null; // 追加なし

  const appendBlock = '\n# --- 追記分 ---\n' + toAppend.join('\n') + '\n';
  return existing + appendBlock;
}

// ─── メイン ──────────────────────────────────────────────────────
async function main() {
  console.log('\n========================================');
  console.log('  .gitignore 生成ツール');
  console.log('========================================\n');

  console.log('カテゴリを選んでください（複数可・カンマ区切り）:\n');
  for (const [k, v] of Object.entries(CATEGORIES)) {
    console.log(`  ${k.padStart(2)}. ${v.label}`);
  }

  const input   = (await ask(`\n番号を入力 [${DEFAULT}]: `)).trim() || DEFAULT;
  const keys    = parseSelection(input);

  if (keys.length === 0) {
    console.log('有効なカテゴリが選択されていません。');
    rl.close();
    return;
  }

  console.log('\n選択されたカテゴリ:');
  keys.forEach(k => console.log(`  ✓ ${CATEGORIES[k].label}`));

  const dir        = (await ask('\n出力先ディレクトリ [.]: ')).trim() || '.';
  const targetDir  = path.resolve(dir);
  const outputPath = path.join(targetDir, '.gitignore');

  rl.close();

  if (!fs.existsSync(targetDir)) {
    console.log(`\nエラー: ディレクトリが見つかりません（${targetDir}）`);
    return;
  }

  const newContent = buildGitignore(keys);

  if (!fs.existsSync(outputPath)) {
    // 新規作成
    fs.writeFileSync(outputPath, newContent, 'utf8');
    const lineCount = newContent.split('\n').filter(l => l && !l.startsWith('#')).length;
    console.log(`\n  ✓ .gitignore 作成完了（無視パターン: ${lineCount}件）`);
  } else {
    // 既存ファイルあり → マージ
    console.log('\n既存の .gitignore が見つかりました。不足しているパターンのみ追記します。');
    const merged = mergeGitignore(outputPath, newContent);
    if (merged === null) {
      console.log('  - 追加すべきパターンはありません。変更なし。');
    } else {
      fs.writeFileSync(outputPath, merged, 'utf8');
      console.log('  ✓ .gitignore を更新しました（追記のみ）');
    }
  }

  // プレビュー（先頭30行）
  console.log('\n─── .gitignore プレビュー（先頭30行）────');
  const lines = fs.readFileSync(outputPath, 'utf8').split('\n').slice(0, 30);
  lines.forEach(l => console.log('  ' + l));
  if (fs.readFileSync(outputPath, 'utf8').split('\n').length > 30) console.log('  ...');
  console.log('─────────────────────────────────────────\n');

  console.log('完了！\n');
}

main().catch(err => { console.error(err); rl.close(); process.exit(1); });
