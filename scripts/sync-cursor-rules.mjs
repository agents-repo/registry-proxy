#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const CONFIG = {
  SOURCE: '.github/copilot-instructions.md',
  TARGET: '.cursor/rules/agents-registry-proxy.mdc',
  DESCRIPTION: 'Registry proxy project guidelines (mirrors copilot-instructions.md)',
  GENERATED_COMMENT:
    '<!-- Generated from .github/copilot-instructions.md — do not edit; run npm run sync:cursor-rules -->',
  TITLE_TRANSFORMS: [],
};

function printHelp() {
  console.log(`Usage:
  npm run sync:cursor-rules
  npm run sync:cursor-rules -- --check
  npm run sync:cursor-rules -- --help

Sync ${CONFIG.SOURCE} -> ${CONFIG.TARGET}
`);
}

const SOURCE_DIR = path.posix.dirname(CONFIG.SOURCE);
const TARGET_DIR = path.posix.dirname(CONFIG.TARGET);

function rewriteRelativeLinks(body) {
  return body.replace(/\[([^\]]*)\]\(([^)]+)\)/g, (match, text, url) => {
    if (/^(?:[a-z][a-z0-9+.-]*:|#)/i.test(url)) {
      return match;
    }

    const resolvedFromRoot = path.posix.normalize(path.posix.join(SOURCE_DIR, url));
    const rewritten = path.posix.relative(TARGET_DIR, resolvedFromRoot);
    const rewrittenText = text === url ? rewritten : text;
    return `[${rewrittenText}](${rewritten})`;
  });
}

function transformSource(source) {
  let body = source;
  for (const [from, to] of CONFIG.TITLE_TRANSFORMS) {
    body = body.replaceAll(from, to);
  }
  body = rewriteRelativeLinks(body);

  return [
    '---',
    `description: ${CONFIG.DESCRIPTION}`,
    'alwaysApply: true',
    '---',
    '',
    CONFIG.GENERATED_COMMENT,
    '',
    body.trimEnd(),
    '',
  ].join('\n');
}

function normalizeEol(text) {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function isGeneratedMirrorFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8').includes(CONFIG.GENERATED_COMMENT);
  } catch {
    return false;
  }
}

function listStaleMdcFiles(rulesDir, keepFileName) {
  if (!fs.existsSync(rulesDir)) {
    return [];
  }

  const stale = [];
  for (const entry of fs.readdirSync(rulesDir)) {
    if (!entry.endsWith('.mdc') || entry === keepFileName) {
      continue;
    }

    const filePath = path.join(rulesDir, entry);
    if (!isGeneratedMirrorFile(filePath)) {
      continue;
    }

    stale.push(filePath);
  }
  return stale;
}

function checkMirror() {
  const sourcePath = path.join(REPO_ROOT, CONFIG.SOURCE);
  const targetPath = path.join(REPO_ROOT, CONFIG.TARGET);

  if (!fs.existsSync(sourcePath)) {
    console.error(`Error: missing source file: ${CONFIG.SOURCE}`);
    process.exit(1);
  }

  const expected = transformSource(normalizeEol(fs.readFileSync(sourcePath, 'utf-8')));
  const issues = [];

  if (!fs.existsSync(targetPath)) {
    issues.push({ kind: 'missing', path: CONFIG.TARGET });
  } else {
    const actual = normalizeEol(fs.readFileSync(targetPath, 'utf-8'));
    if (actual !== expected) {
      issues.push({ kind: 'modified', path: CONFIG.TARGET });
    }
  }

  const rulesDir = path.dirname(targetPath);
  const keepFileName = path.basename(targetPath);
  for (const stalePath of listStaleMdcFiles(rulesDir, keepFileName)) {
    issues.push({ kind: 'stale', path: path.relative(REPO_ROOT, stalePath) });
  }

  if (issues.length > 0) {
    console.error('IDE mirror drift detected for cursor-rules sync');
    for (const issue of issues) {
      console.error(`  [${issue.kind}] ${issue.path}`);
    }
    process.exit(1);
  }

  console.log('Cursor rule mirror is up to date');
}

function writeMirror() {
  const sourcePath = path.join(REPO_ROOT, CONFIG.SOURCE);
  const targetPath = path.join(REPO_ROOT, CONFIG.TARGET);

  if (!fs.existsSync(sourcePath)) {
    console.error(`Error: missing source file: ${CONFIG.SOURCE}`);
    process.exit(1);
  }

  const content = transformSource(normalizeEol(fs.readFileSync(sourcePath, 'utf-8')));
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content, 'utf-8');

  const rulesDir = path.dirname(targetPath);
  const keepFileName = path.basename(targetPath);
  for (const stalePath of listStaleMdcFiles(rulesDir, keepFileName)) {
    fs.rmSync(stalePath, { force: true });
    console.log(`  removed stale ${path.relative(REPO_ROOT, stalePath)}`);
  }

  console.log(`Synced ${CONFIG.TARGET}`);
}

const argv = process.argv.slice(2);
if (argv.includes('--help') || argv.includes('-h')) {
  printHelp();
} else if (argv.includes('--check')) {
  checkMirror();
} else {
  writeMirror();
}
