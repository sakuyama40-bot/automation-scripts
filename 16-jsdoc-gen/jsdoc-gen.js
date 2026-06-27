#!/usr/bin/env node
'use strict';

const readline = require('readline');
const fs       = require('fs');
const path     = require('path');

const rl  = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

// ─── ファイルスキャン ────────────────────────────────────────────
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.next', 'coverage', '.git']);
const SRC_EXTS  = new Set(['.js', '.ts', '.mjs', '.cjs', '.jsx', '.tsx']);

function walkFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) results.push(...walkFiles(path.join(dir, entry.name)));
    } else if (SRC_EXTS.has(path.extname(entry.name).toLowerCase())) {
      results.push(path.join(dir, entry.name));
    }
  }
  return results;
}

// ─── JSDoc コメント抽出 ──────────────────────────────────────────
// /** ... */ の後に続くコードも取得
function extractBlocks(source) {
  const blocks = [];
  const re     = /\/\*\*([\s\S]*?)\*\/([ \t]*\n?((?:(?!\/\*\*)[\s\S])*?)(?=\/\*\*|\s*$))/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    const rawComment = m[1];
    const codeAfter  = (m[3] || '').trim().split('\n')[0].trim(); // 直後の1行だけ
    blocks.push({ rawComment, codeAfter });
  }
  return blocks;
}

// ─── JSDoc パーサー（行ベース） ──────────────────────────────────
function parseJsDoc(rawComment) {
  const lines = rawComment
    .split('\n')
    .map(l => l.replace(/^\s*\*\s?/, '').trimEnd());

  const result = {
    description: [],
    params:      [],
    returns:     null,
    throws:      [],
    examples:    [],
    deprecated:  null,
    since:       null,
    see:         [],
  };

  let tag     = null;   // 現在処理中のタグ
  let tagBuf  = [];     // タグのバッファ行

  function flushTag() {
    if (tag === null) {
      result.description.push(...tagBuf);
    } else {
      const body = tagBuf.join('\n');
      processTag(tag, body, result);
    }
    tagBuf = [];
  }

  for (const line of lines) {
    const m = line.match(/^@(\w+)(.*)/);
    if (m) {
      flushTag();
      tag    = m[1].toLowerCase();
      tagBuf = [m[2].trim()];
    } else {
      tagBuf.push(line);
    }
  }
  flushTag();

  result.description = result.description.join('\n').trim();
  return result;
}

function processTag(tag, body, result) {
  const s = body.trim();
  switch (tag) {
    case 'param':
    case 'parameter': {
      // {type} [name] - desc  or  {type} name desc
      const m = s.match(/^\{([^}]*)\}\s+(\[?[\w$.]+(?:=[^\]\s]*)?\]?)\s*[-–]?\s*([\s\S]*)/);
      if (m) {
        const rawName  = m[2];
        const optional = rawName.startsWith('[');
        const name     = rawName.replace(/^\[|\]$/g, '').split('=')[0];
        result.params.push({ type: m[1].trim(), name, optional, description: m[3].trim() });
      } else {
        // {type} のない簡易形式
        result.params.push({ type: '', name: s.split(/\s/)[0], optional: false, description: s });
      }
      break;
    }
    case 'returns':
    case 'return': {
      const m = s.match(/^\{([^}]*)\}\s*([\s\S]*)/);
      result.returns = m
        ? { type: m[1].trim(), description: m[2].trim() }
        : { type: 'any', description: s };
      break;
    }
    case 'throws':
    case 'exception': {
      const m = s.match(/^\{([^}]*)\}\s*([\s\S]*)/);
      result.throws.push(m
        ? { type: m[1].trim(), description: m[2].trim() }
        : { type: 'Error', description: s });
      break;
    }
    case 'example':
      result.examples.push(s);
      break;
    case 'deprecated':
      result.deprecated = s || 'この機能は非推奨です。';
      break;
    case 'since':
      result.since = s;
      break;
    case 'see':
      result.see.push(s);
      break;
    // @type, @typedef, @property 等は無視
  }
}

// ─── コード行から宣言名を取得 ────────────────────────────────────
function extractDecl(codeLine) {
  const s = codeLine.trim();
  // export default function / async function
  let m = s.match(/^(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/);
  if (m) return { kind: 'function', name: m[1], sig: `${m[1]}(${m[2].trim()})` };
  // export const foo = (...) =>  /  export const foo = function
  m = s.match(/^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\(([^)]*)\)|(\w+))\s*=>/);
  if (m) return { kind: 'function', name: m[1], sig: `${m[1]}(${(m[2] || m[3] || '').trim()})` };
  // export const foo = function(...)
  m = s.match(/^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?function\s*\(([^)]*)\)/);
  if (m) return { kind: 'function', name: m[1], sig: `${m[1]}(${m[2].trim()})` };
  // class
  m = s.match(/^(?:export\s+(?:default\s+)?)?(?:abstract\s+)?class\s+(\w+)/);
  if (m) return { kind: 'class', name: m[1], sig: `class ${m[1]}` };
  // method (先頭が識別子 + ()  ※ if/for/while は除外)
  m = s.match(/^(?:(?:async|static|public|private|protected|get|set)\s+)*(\w+)\s*\(([^)]*)\)/);
  if (m && !['if','for','while','switch','catch'].includes(m[1])) {
    return { kind: 'method', name: m[1], sig: `${m[1]}(${m[2].trim()})` };
  }
  // interface / type
  m = s.match(/^(?:export\s+)?(?:interface|type)\s+(\w+)/);
  if (m) return { kind: 'type', name: m[1], sig: m[1] };
  return null;
}

// ─── Markdown ドキュメント生成 ───────────────────────────────────
function buildMarkdown(relPath, blocks) {
  const entries = [];

  for (const { rawComment, codeAfter } of blocks) {
    const doc  = parseJsDoc(rawComment);
    const decl = extractDecl(codeAfter);
    // 説明もなく宣言も取れない場合はスキップ
    if (!doc.description && !decl && doc.params.length === 0) continue;
    entries.push({ doc, decl, raw: codeAfter });
  }

  if (entries.length === 0) return null;

  const lines = [`## \`${relPath}\``, ``];

  for (const { doc, decl } of entries) {
    const title = decl ? `\`${decl.sig}\`` : '（無名）';
    const kindTag = decl ? ` <sup>${decl.kind}</sup>` : '';
    lines.push(`### ${title}${kindTag}`, ``);

    if (doc.deprecated) {
      lines.push(`> ⚠️ **非推奨:** ${doc.deprecated}`, ``);
    }
    if (doc.description) {
      lines.push(doc.description, ``);
    }

    if (doc.params.length > 0) {
      lines.push(`**パラメータ:**`, ``);
      lines.push(`| 名前 | 型 | 必須 | 説明 |`);
      lines.push(`|---|---|---|---|`);
      for (const p of doc.params) {
        const opt  = p.optional ? 'オプション' : '必須';
        const type = p.type ? `\`${p.type}\`` : '—';
        lines.push(`| \`${p.name}\` | ${type} | ${opt} | ${p.description || '—'} |`);
      }
      lines.push(``);
    }

    if (doc.returns) {
      const rtype = doc.returns.type ? `\`${doc.returns.type}\`` : '';
      const rdesc = doc.returns.description || '';
      lines.push(`**戻り値:** ${[rtype, rdesc].filter(Boolean).join(' — ')}`, ``);
    }

    if (doc.throws.length > 0) {
      lines.push(`**例外:**`, ``);
      for (const t of doc.throws) {
        lines.push(`- \`${t.type}\` — ${t.description}`);
      }
      lines.push(``);
    }

    if (doc.examples.length > 0) {
      lines.push(`**使用例:**`, ``);
      for (const ex of doc.examples) {
        // すでにコードブロックかチェック
        if (ex.startsWith('```')) {
          lines.push(ex);
        } else {
          lines.push('```js', ex, '```');
        }
        lines.push(``);
      }
    }

    if (doc.since) lines.push(`**Since:** ${doc.since}`, ``);
    if (doc.see.length > 0) {
      lines.push(`**参照:** ${doc.see.join(' / ')}`, ``);
    }

    lines.push(`---`, ``);
  }

  return lines.join('\n');
}

// ─── メイン ──────────────────────────────────────────────────────
async function main() {
  console.log('\n========================================');
  console.log('  JSDoc → Markdown API ドキュメント生成');
  console.log('========================================\n');

  const dir      = (await ask('対象プロジェクトのパス [.]: ')).trim() || '.';
  const projDir  = path.resolve(dir);
  const srcRaw   = (await ask('ソースディレクトリ [src]: ')).trim() || 'src';
  const srcDir   = path.resolve(projDir, srcRaw);
  const outRaw   = (await ask('出力ファイル [docs/API.md]: ')).trim() || 'docs/API.md';
  const outPath  = path.resolve(projDir, outRaw);

  rl.close();

  // ファイル収集
  const files = walkFiles(srcDir);
  console.log(`\n${files.length} ファイルをスキャン中...\n`);

  if (files.length === 0) {
    console.log(`  ⚠️  ソースファイルが見つかりません（${srcDir}）`);
    return;
  }

  // ドキュメント生成
  const today   = new Date();
  const dateStr = `${today.getFullYear()}年${String(today.getMonth()+1).padStart(2,'0')}月${String(today.getDate()).padStart(2,'0')}日`;
  const sections = [
    `# API ドキュメント`,
    ``,
    `**生成日:** ${dateStr}`,
    `**ソース:** \`${srcRaw}/\``,
    ``,
    `---`,
    ``,
  ];

  let totalEntries  = 0;
  let processedFiles = 0;

  for (const filePath of files) {
    const source   = fs.readFileSync(filePath, 'utf8');
    const blocks   = extractBlocks(source);
    if (blocks.length === 0) continue;

    const relPath  = path.relative(projDir, filePath).replace(/\\/g, '/');
    const section  = buildMarkdown(relPath, blocks);
    if (!section) continue;

    sections.push(section);
    const entryCount = (section.match(/^### /gm) || []).length;
    totalEntries += entryCount;
    processedFiles++;
    console.log(`  ✓ ${relPath}  (${entryCount}件)`);
  }

  if (totalEntries === 0) {
    console.log('\n  JSDoc コメント（/** */）が見つかりませんでした。');
    return;
  }

  // ファイル保存
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, sections.join('\n'), 'utf8');

  console.log(`\n──────────────────────────────────────────`);
  console.log(`  ✓ ファイル数   : ${processedFiles} / ${files.length}`);
  console.log(`  ✓ ドキュメント : ${totalEntries} 件`);
  console.log(`  ✓ 出力         : ${outPath}`);
  console.log(`──────────────────────────────────────────\n`);
  console.log('完了！\n');
}

main().catch(err => { console.error(err); rl.close(); process.exit(1); });
