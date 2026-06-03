#!/usr/bin/env bash
set -euo pipefail

# Scan tracked files for common token patterns.
if git grep -nE "ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|GITHUB_TOKEN[[:space:]]*=[[:space:]]*.+" -- . >/dev/null; then
  echo "Secret-like patterns detected in tracked files."
  git grep -nE "ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|GITHUB_TOKEN[[:space:]]*=[[:space:]]*.+" -- .
  exit 1
fi

echo "Secret scan passed."
