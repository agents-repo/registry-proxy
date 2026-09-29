import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectChangedPaths,
  matchPathGroups,
} from '../scripts/ci-pr-path-filters.mjs';

test('package-lock.json turns slides on', () => {
  const matches = matchPathGroups(['package-lock.json']);
  assert.equal(matches.slides, true);
});

test('package.json turns slides on', () => {
  const matches = matchPathGroups(['package.json']);
  assert.equal(matches.slides, true);
});

test('docs-only README turns no extras on', () => {
  const matches = matchPathGroups(['README.md']);
  assert.equal(matches.slides, false);
});

test('src-only change turns no extras on', () => {
  const matches = matchPathGroups(['src/index.js']);
  assert.equal(matches.slides, false);
});

test('pr-baseline.yml turns every extra this job defines on', () => {
  const matches = matchPathGroups(['.github/workflows/pr-baseline.yml']);
  assert.equal(matches.slides, true);
});

test('ci-pr-path-filters.mjs turns every extra this job defines on', () => {
  const matches = matchPathGroups(['scripts/ci-pr-path-filters.mjs']);
  assert.equal(matches.slides, true);
});

test('rename previous_filename is collected for matching', () => {
  const paths = collectChangedPaths([
    { filename: 'src/index.js', previous_filename: 'docs/slides/old.md' },
  ]);
  const matches = matchPathGroups(paths);
  assert.equal(matches.slides, true);
});
