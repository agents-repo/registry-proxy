# GitHub CLI Workflow

This project uses a required issue → branch → push → draft PR workflow with
GitHub CLI. See `.github/CONTRIBUTING.md` **Required Workflow** for normative
rules.

## 0. Bootstrap Local Runtime

Run the pinned runtime setup before validation commands:

```bash
nvm use
corepack enable npm
corepack prepare npm@12.0.1 --activate
npm --version
npm run env:check
```

Continue only when npm resolves to `12.0.1`.

## 1. Create Issue

```bash
gh issue create \
  --title "feat: short description" \
  --body "Scope, acceptance criteria, and validation plan"
```

Use the matching issue form under `.github/ISSUE_TEMPLATE/` when available.

## 2. Create Branch From Issue Context

Option A:

```bash
gh issue develop <issue-number> --name "feat/<issue-number>-<slug>"
```

Option B:

```bash
git checkout main && git pull
git checkout -b "feat/<issue-number>-<slug>"
```

## 3. Push Branch and Open Draft Pull Request

GitHub cannot open a pull request when the head and base branches are
identical. Push at least one commit on the task branch so its head differs from
`main` before opening the draft PR (for example an empty commit):

```bash
git commit --allow-empty -m "chore: scaffold draft PR for #<issue-number>"
git push -u origin HEAD

gh pr create --draft \
  --base main \
  --head "feat/<issue-number>-<slug>" \
  --title "feat: short description" \
  --body-file .github/pull_request_template.md
```

Then fill in the template placeholders:

- Replace the `## Related Issues` placeholder with an unbackticked
  `Closes #<issue-number>` (or a security-advisory identifier per the
  **Workflow exceptions** section of `.github/CONTRIBUTING.md` when
  applicable)
- Add validation evidence from npm commands

Open the draft PR before implementation commits (`gh pr create --draft`), then
push additional commits to the same branch as work progresses.

## 4. Implement and Validate

```bash
npm run env:check
npm run lint:all
npm run check:secrets
npm run test
```

## 5. Mark Ready and Merge (Human Maintainers Only)

After validation passes, the developer manually marks the pull request ready
for review in GitHub. Agents and automation MUST NOT mark pull requests ready
for review.

```bash
gh pr view <pr-number>
```

Human maintainers merge after review. Agents and automation MUST NOT run
`gh pr merge` or push directly to `main`.

```bash
gh pr merge <pr-number> --squash
```

## Fallback Without gh

- Create issue and PR in GitHub web UI.
- Push branch with `git push -u origin <branch-name>`.
