import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');

function makeTempRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'proxy-cursor-sync-'));
  fs.mkdirSync(path.join(dir, '.github'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  fs.copyFileSync(
    path.join(REPO_ROOT, 'scripts', 'sync-cursor-rules.mjs'),
    path.join(dir, 'scripts', 'sync-cursor-rules.mjs'),
  );
  return dir;
}

const tempRepos = [];

afterEach(() => {
  while (tempRepos.length > 0) {
    fs.rmSync(tempRepos.pop(), { recursive: true, force: true });
  }
});

describe('sync-cursor-rules', () => {
  it('writes mirror with frontmatter and generated comment', async () => {
    const repo = makeTempRepo();
    tempRepos.push(repo);
    const source = '# Copilot Project Instructions\n\n## Guardrails\n';
    fs.writeFileSync(path.join(repo, '.github', 'copilot-instructions.md'), source, 'utf-8');

    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileAsync = promisify(execFile);
    await execFileAsync('node', ['scripts/sync-cursor-rules.mjs'], { cwd: repo });

    const output = fs.readFileSync(
      path.join(repo, '.cursor', 'rules', 'agents-registry-proxy.mdc'),
      'utf-8',
    );
    assert.match(output, /alwaysApply: true/);
    assert.match(output, /Generated from \.github\/copilot-instructions\.md/);
    assert.match(output, /# Copilot Project Instructions/);
  });

  it('exits non-zero on drift when --check', async () => {
    const repo = makeTempRepo();
    tempRepos.push(repo);
    fs.writeFileSync(
      path.join(repo, '.github', 'copilot-instructions.md'),
      '# Source\n',
      'utf-8',
    );
    fs.mkdirSync(path.join(repo, '.cursor', 'rules'), { recursive: true });
    fs.writeFileSync(
      path.join(repo, '.cursor', 'rules', 'agents-registry-proxy.mdc'),
      'stale\n',
      'utf-8',
    );

    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileAsync = promisify(execFile);
    await assert.rejects(
      () => execFileAsync('node', ['scripts/sync-cursor-rules.mjs', '--check'], { cwd: repo }),
      (error) => error.code === 1,
    );
  });

  it('ignores unrelated .mdc files during --check', async () => {
    const repo = makeTempRepo();
    tempRepos.push(repo);
    fs.writeFileSync(
      path.join(repo, '.github', 'copilot-instructions.md'),
      '# Source\n',
      'utf-8',
    );

    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileAsync = promisify(execFile);
    await execFileAsync('node', ['scripts/sync-cursor-rules.mjs'], { cwd: repo });

    fs.writeFileSync(
      path.join(repo, '.cursor', 'rules', 'custom-rule.mdc'),
      '---\nalwaysApply: false\n---\n',
      'utf-8',
    );

    await execFileAsync('node', ['scripts/sync-cursor-rules.mjs', '--check'], { cwd: repo });
  });

  it('treats CRLF mirror content as in sync when logically identical', async () => {
    const repo = makeTempRepo();
    tempRepos.push(repo);
    fs.writeFileSync(
      path.join(repo, '.github', 'copilot-instructions.md'),
      '# Source\n',
      'utf-8',
    );

    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileAsync = promisify(execFile);
    await execFileAsync('node', ['scripts/sync-cursor-rules.mjs'], { cwd: repo });

    const mirrorPath = path.join(repo, '.cursor', 'rules', 'agents-registry-proxy.mdc');
    const content = fs.readFileSync(mirrorPath, 'utf-8');
    fs.writeFileSync(mirrorPath, content.replace(/\n/g, '\r\n'), 'utf-8');

    await execFileAsync('node', ['scripts/sync-cursor-rules.mjs', '--check'], { cwd: repo });
  });
});
