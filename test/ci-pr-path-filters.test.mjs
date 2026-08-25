import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectChangedPaths,
  matchPathGroups,
} from '../scripts/ci-pr-path-filters.mjs';

test('package-lock.json turns slides on and agents off', () => {
  const matches = matchPathGroups(['package-lock.json']);
  assert.equal(matches.slides, true);
  assert.equal(matches.agents, false);
});

test('package.json turns slides on and agents off', () => {
  const matches = matchPathGroups(['package.json']);
  assert.equal(matches.slides, true);
  assert.equal(matches.agents, false);
});

test('agents.json turns checksum on', () => {
  const matches = matchPathGroups(['agents.json']);
  assert.equal(matches.agents, true);
  assert.equal(matches.slides, false);
});

test('docs-only README turns no extras on', () => {
  const matches = matchPathGroups(['README.md']);
  assert.equal(matches.slides, false);
  assert.equal(matches.agents, false);
});

test('src-only change turns no extras on', () => {
  const matches = matchPathGroups(['src/index.js']);
  assert.equal(matches.slides, false);
  assert.equal(matches.agents, false);
});

test('pr-baseline.yml turns every extra this job defines on', () => {
  const matches = matchPathGroups(['.github/workflows/pr-baseline.yml']);
  assert.equal(matches.slides, true);
  assert.equal(matches.agents, true);
});

test('ci-pr-path-filters.mjs turns every extra this job defines on', () => {
  const matches = matchPathGroups(['scripts/ci-pr-path-filters.mjs']);
  assert.equal(matches.slides, true);
  assert.equal(matches.agents, true);
});

test('rename previous_filename is collected for matching', () => {
  const paths = collectChangedPaths([
    { filename: 'src/index.js', previous_filename: 'docs/slides/old.md' },
  ]);
  const matches = matchPathGroups(paths);
  assert.equal(matches.slides, true);
  assert.equal(matches.agents, false);
});
