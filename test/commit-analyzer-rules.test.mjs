import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const commitAnalyzer = require('@semantic-release/commit-analyzer');

const noopLogger = {
  log: () => undefined,
  error: () => undefined,
  warn: () => undefined,
};

function loadAnalyzerConfig() {
  const releaserc = JSON.parse(readFileSync(path.join(repoRoot, '.releaserc.json'), 'utf8'));
  const analyzerPlugin = releaserc.plugins.find(
    (entry) => Array.isArray(entry) && entry[0] === '@semantic-release/commit-analyzer',
  );
  return analyzerPlugin?.[1] ?? {};
}

async function analyzeCommitMessage(message) {
  const config = loadAnalyzerConfig();
  return commitAnalyzer.analyzeCommits(config, {
    commits: [{ message, hash: 'abc123' }],
    cwd: repoRoot,
    logger: noopLogger,
  });
}

test('commit-analyzer loads custom release rules from .releaserc.json', () => {
  const config = loadAnalyzerConfig();
  assert.ok(config.releaseRules);
  assert.ok(config.releaseRules.some((rule) => rule.breaking === true && rule.release === 'major'));
  assert.ok(config.releaseRules.some((rule) => rule.type === 'feat' && rule.release === 'minor'));
  assert.ok(config.releaseRules.some((rule) => rule.type === 'fix' && rule.release === 'patch'));
});

test('commit-analyzer maps feat commits to minor releases', async () => {
  const result = await analyzeCommitMessage('feat: add browse filter');
  assert.equal(result, 'minor');
});

test('commit-analyzer maps fix commits to patch releases', async () => {
  const result = await analyzeCommitMessage('fix: correct manifest path');
  assert.equal(result, 'patch');
});

test('commit-analyzer maps breaking feat commits to major releases', async () => {
  const result = await analyzeCommitMessage('feat!: drop legacy route');
  assert.equal(result, 'major');
});

test('commit-analyzer maps chore commits to no release', async () => {
  const result = await analyzeCommitMessage('chore: sync deps');
  assert.equal(result, null);
});
