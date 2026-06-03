# GitHub CLI Workflow

This project uses an issue-first workflow with GitHub CLI.

## 0. Bootstrap Local Runtime

Run the pinned runtime setup before validation commands:

```bash
nvm use
corepack enable
corepack prepare npm@11.12.1 --activate
npm --version
npm run env:check
```

Continue only when npm resolves to `11.12.1`.

## 1. Create Issue

```bash
gh issue create \
  --title "feat: short description" \
  --body "Scope, acceptance criteria, and validation plan"
```

## 2. Create Branch From Issue Context

Option A:

```bash
gh issue develop <issue-number> --name "feat/<issue-number>-short-slug"
```

Option B:

```bash
git checkout -b "feat/<issue-number>-short-slug"
```

## 3. Open Pull Request

```bash
gh pr create \
  --base main \
  --head "feat/<issue-number>-short-slug" \
  --title "feat: short description" \
  --body-file .github/pull_request_template.md
```

Then edit PR body to include:

- `Closes #<issue-number>` in `## Related Issues`
- Validation evidence from npm commands

## 4. Review and Merge

```bash
gh pr view <pr-number>
gh pr merge <pr-number> --squash
```

## 5. Required Local Validation Before Review

```bash
npm run env:check
npm run lint:all
npm run check:secrets
npm run test
```

## Fallback Without gh

- Create issue and PR in GitHub web UI.
- Push branch with `git push -u origin <branch-name>`.
