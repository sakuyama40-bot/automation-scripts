#!/usr/bin/env node
'use strict';

// ─── セットアップツール ───────────────────────────────────────────
// 対象プロジェクトに scripts/pipeline.js を生成し package.json を更新する

const readline = require('readline');
const fs       = require('fs');
const path     = require('path');

const rl  = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (prompt) => new Promise(resolve => rl.question(prompt, resolve));
const askDefault = async (prompt, def) => (await ask(`${prompt} [${def}]: `)).trim() || def;

// ─── ステップ定義 ─────────────────────────────────────────────────
const STEP_PRESETS = {
  lint:   { name: 'lint',   defaultCmd: 'npm run lint',           envs: ['development','staging','production'] },
  test:   { name: 'test',   defaultCmd: 'npm test',               envs: ['development','staging','production'] },
  build:  { name: 'build',  defaultCmd: 'npm run build',          envs: ['staging','production'] },
  deploy: { name: 'deploy', defaultCmd: 'npm run deploy:prod',    envs: ['production'] },
};

// ─── パイプラインランナー テンプレート ───────────────────────────
function buildPipelineScript(steps, projectName) {
  const stepsJson = JSON.stringify(steps, null, 2)
    .split('\n').map((l, i) => (i === 0 ? l : '  ' + l)).join('\n');

  return `#!/usr/bin/env node
'use strict';

// ${projectName} — デプロイパイプライン
// 使い方:
//   node scripts/pipeline.js                    # 開発環境
//   node scripts/pipeline.js --env staging      # ステージング
//   node scripts/pipeline.js --env production   # 本番
//   node scripts/pipeline.js --dry-run          # 実行せずに確認
//   node scripts/pipeline.js --skip lint,test   # 指定ステップをスキップ

const { execSync } = require('child_process');

// ─── 引数パース ────────────────────────────────────────
const args    = process.argv.slice(2);
const ENV     = args.includes('--env')     ? args[args.indexOf('--env') + 1]     : 'development';
const DRY     = args.includes('--dry-run');
const SKIPPED = args.includes('--skip')
  ? args[args.indexOf('--skip') + 1].split(',').map(s => s.trim())
  : [];

// ─── ANSI カラー（依存なし） ────────────────────────────
const C = {
  reset:  '\\x1b[0m',
  bold:   '\\x1b[1m',
  green:  '\\x1b[32m',
  red:    '\\x1b[31m',
  yellow: '\\x1b[33m',
  cyan:   '\\x1b[36m',
  gray:   '\\x1b[90m',
};
const color = (c, s) => c + s + C.reset;

// ─── ステップ定義 ───────────────────────────────────────
const ALL_STEPS = ${stepsJson};

// 現在の環境で実行すべきステップを絞り込む
const STEPS = ALL_STEPS.filter(s => s.envs.includes(ENV) && !SKIPPED.includes(s.name));

// ─── ユーティリティ ─────────────────────────────────────
function timestamp() {
  return new Date().toTimeString().slice(0, 8);
}
function duration(ms) {
  return ms < 1000 ? \`\${ms}ms\` : \`\${(ms / 1000).toFixed(1)}s\`;
}

// ─── パイプライン実行 ───────────────────────────────────
async function runPipeline() {
  console.log('');
  console.log(color(C.bold, '='.repeat(50)));
  console.log(color(C.bold, \`  デプロイパイプライン: \${projectName}\`));
  console.log(color(C.bold, \`  環境: \${ENV}\${DRY ? '  (DRY RUN)' : ''}\`));
  console.log(color(C.bold, '='.repeat(50)));
  console.log('');

  if (STEPS.length === 0) {
    console.log(color(C.yellow, \`環境 "\${ENV}" で実行するステップがありません。\`));
    process.exit(0);
  }

  console.log(color(C.cyan, \`実行ステップ (\${STEPS.length}件):\`));
  STEPS.forEach((s, i) => console.log(\`  \${i + 1}. \${s.name}: \${color(C.gray, s.cmd)}\`));
  if (SKIPPED.length > 0) {
    console.log(color(C.yellow, \`スキップ: \${SKIPPED.join(', ')}\`));
  }
  console.log('');

  const results  = [];
  const total_t0 = Date.now();

  for (const step of STEPS) {
    const t0   = Date.now();
    const tag  = \`[\${timestamp()}] [\${step.name}]\`;

    console.log(color(C.cyan, \`\${tag} 開始...\`));

    if (DRY) {
      console.log(color(C.gray, \`  $ \${step.cmd}  (dry-run)\`));
      results.push({ name: step.name, status: 'skipped', ms: 0 });
      continue;
    }

    try {
      execSync(step.cmd, { stdio: 'inherit' });
      const ms = Date.now() - t0;
      console.log(color(C.green, \`\${tag} ✓ 完了 (\${duration(ms)})\`));
      results.push({ name: step.name, status: 'ok', ms });
    } catch (err) {
      const ms = Date.now() - t0;
      console.log(color(C.red, \`\${tag} ✗ 失敗 (\${duration(ms)})\`));
      results.push({ name: step.name, status: 'failed', ms });
      console.log('');
      console.log(color(C.red, '─── パイプライン中断 ─────────────────'));
      printSummary(results, Date.now() - total_t0);
      process.exit(1);
    }

    console.log('');
  }

  printSummary(results, Date.now() - total_t0);
}

function printSummary(results, totalMs) {
  console.log(color(C.bold, '─── サマリー ─────────────────────────'));
  results.forEach(r => {
    const icon = r.status === 'ok' ? color(C.green, '✓') : r.status === 'skipped' ? color(C.yellow, '-') : color(C.red, '✗');
    const dur  = r.status === 'skipped' ? '(dry-run)' : duration(r.ms);
    console.log(\`  \${icon} \${r.name.padEnd(12)} \${dur}\`);
  });
  console.log(color(C.bold, \`  合計: \${duration(totalMs)}\`));
  console.log('');
  const allOk = results.every(r => r.status === 'ok' || r.status === 'skipped');
  if (allOk) {
    console.log(color(C.green, \`  ✅ パイプライン完了\`));
  }
  console.log('');
}

runPipeline().catch(err => { console.error(err); process.exit(1); });
`;
}

// ─── package.json 更新 ────────────────────────────────────────────
function updatePackageJson(projDir, steps) {
  const pkgPath = path.join(projDir, 'package.json');
  const pkg     = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  if (!pkg.scripts) pkg.scripts = {};

  // パイプライン実行スクリプト追加
  pkg.scripts['pipeline']          = 'node scripts/pipeline.js';
  pkg.scripts['pipeline:staging']  = 'node scripts/pipeline.js --env staging';
  pkg.scripts['pipeline:prod']     = 'node scripts/pipeline.js --env production';
  pkg.scripts['pipeline:dry']      = 'node scripts/pipeline.js --dry-run';

  // 各ステップのスクリプトが未定義なら雛形を追加
  for (const s of steps) {
    if (!pkg.scripts[s.name]) {
      pkg.scripts[s.name] = `echo "${s.name}: TODO - コマンドを設定してください"`;
    }
  }

  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  return pkg;
}

// ─── メイン ──────────────────────────────────────────────────────
async function main() {
  console.log('\n========================================');
  console.log('  デプロイパイプライン セットアップ');
  console.log('========================================\n');

  const dir     = (await ask('対象プロジェクトのパス [.]: ')).trim() || '.';
  const projDir = path.resolve(dir);

  if (!fs.existsSync(path.join(projDir, 'package.json'))) {
    console.log(`\nエラー: package.json が見つかりません（${projDir}）`);
    rl.close(); return;
  }

  const pkg  = JSON.parse(fs.readFileSync(path.join(projDir, 'package.json'), 'utf8'));
  const name = pkg.name || path.basename(projDir);
  console.log(`\nプロジェクト: ${name}\n`);

  // ステップ設定
  console.log('パイプラインに含めるステップを選んでください（複数可・カンマ区切り）:');
  console.log('  1. lint   — コード品質チェック（全環境）');
  console.log('  2. test   — テスト実行（全環境）');
  console.log('  3. build  — ビルド（staging/prod のみ）');
  console.log('  4. deploy — デプロイ（prod のみ）');

  const stepInput  = (await ask('\n番号を入力 [1,2,3,4]: ')).trim() || '1,2,3,4';
  const stepNums   = stepInput.split(',').map(s => s.trim());
  const stepKeys   = { '1':'lint', '2':'test', '3':'build', '4':'deploy' };
  const chosenKeys = stepNums.map(n => stepKeys[n]).filter(Boolean);

  if (chosenKeys.length === 0) {
    console.log('ステップが選択されていません。'); rl.close(); return;
  }

  // 各ステップのコマンドを確認
  console.log('\n各ステップのコマンドを設定してください:');
  const steps = [];
  for (const key of chosenKeys) {
    const preset = STEP_PRESETS[key];
    const cmd    = await askDefault(`  ${key}`, preset.defaultCmd);
    steps.push({ name: key, cmd, envs: preset.envs });
  }

  // 追加デプロイコマンド（カスタム）
  const customCmd = (await ask('\n追加のカスタムステップ（任意、例: rsync -av dist/ user@server:/var/www）: ')).trim();
  if (customCmd) {
    const customName = await askDefault('  ステップ名', 'upload');
    steps.push({ name: customName, cmd: customCmd, envs: ['staging','production'] });
  }

  rl.close();

  // scripts/ ディレクトリ作成
  const scriptsDir = path.join(projDir, 'scripts');
  fs.mkdirSync(scriptsDir, { recursive: true });

  // pipeline.js 生成
  const scriptPath    = path.join(scriptsDir, 'pipeline.js');
  const scriptContent = buildPipelineScript(steps, name);
  const existed       = fs.existsSync(scriptPath);
  if (existed) fs.copyFileSync(scriptPath, scriptPath + '.bak');
  fs.writeFileSync(scriptPath, scriptContent, 'utf8');

  // package.json 更新
  updatePackageJson(projDir, steps);

  // 結果表示
  console.log('\n─── 生成結果 ────────────────────────────');
  console.log(`  ✓ ${scriptPath}${existed ? '  (.bak にバックアップ済み)' : ''}`);
  console.log('  ✓ package.json に以下のスクリプトを追加:');
  console.log('      npm run pipeline          # development');
  console.log('      npm run pipeline:staging  # staging');
  console.log('      npm run pipeline:prod     # production');
  console.log('      npm run pipeline:dry      # dry-run（確認用）');
  console.log('\n  ステップ構成:');
  steps.forEach(s => {
    console.log(`    ${s.name.padEnd(12)} ${s.cmd}`);
    console.log(`                 対象: ${s.envs.join(', ')}`);
  });
  console.log('──────────────────────────────────────────\n');
  console.log('まず dry-run で確認することをおすすめします:');
  console.log('  npm run pipeline:dry\n');
  console.log('完了！\n');
}

main().catch(err => { console.error(err); rl.close(); process.exit(1); });
