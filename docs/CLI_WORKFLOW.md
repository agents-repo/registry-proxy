# GitHub CLI Workflow

This project uses an issue-first workflow with GitHub CLI.

## 1. Create Issue

```bash
gh issue create \
  --title "Bootstrap registry-proxy worker" \
  --body "Implements worker proxy, docs, and governance artifacts." \
  --label "feature"
```

## 2. Create Branch From Issue Context

Option A:

```bash
gh issue develop <issue-number> --name "feat/registry-proxy-bootstrap-<issue-number>"
```

Option B:

```bash
git checkout -b "feat/registry-proxy-bootstrap-<issue-number>"
```

## 3. Open Pull Request

```bash
gh pr create \
  --base main \
  --head "feat/registry-proxy-bootstrap-<issue-number>" \
  --title "Bootstrap registry-proxy worker" \
  --body "Fixes #<issue-number>"
```

## 4. Review and Merge

```bash
gh pr view <pr-number>
gh pr merge <pr-number> --squash
```

## Fallback Without gh

- Create issue and PR in GitHub web UI.
- Push branch with `git push -u origin <branch-name>`.
