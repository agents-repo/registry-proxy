# Contributing

## Project Focus

This repository is a Cloudflare Worker proxy and governance baseline for registry access. Contributions should prioritize deterministic behavior, operational safety, and clear documentation.

## Before You Start

1. Open an issue with a matching issue form under `.github/ISSUE_TEMPLATE/`.
2. Confirm scope and acceptance criteria in the issue.
3. Classify the change type and branch prefix before implementation.

## Required Workflow

Contributors and agents MUST follow this lifecycle before implementation:

1. Inspect issue scope:
   `gh issue view <number> --repo agents-repo/registry-proxy`
2. Create a branch from issue number and slug.
3. Push the branch to the remote repository.
4. Open a draft pull request using `.github/pull_request_template.md` before
   implementation commits. Pull requests MUST be created as drafts
   (`gh pr create --draft`).
5. Implement, validate, then hand off. After validation passes, the developer
   manually marks the pull request ready for review in GitHub. Agents MUST NOT
   merge pull requests into `main`, push directly to `main`, or mark pull
   requests ready for review.

All contributors MUST integrate changes to `main` only through merged pull
requests. Direct commits or pushes to `main` MUST NOT be used.

GitHub requires a pushed remote branch before opening a pull request. An empty
branch push is acceptable when opening the draft PR before implementation
commits.

See [docs/CLI_WORKFLOW.md](../docs/CLI_WORKFLOW.md) for command examples and
the organization
[Required Workflow](https://github.com/agents-repo/.github/blob/main/CONTRIBUTING.md#required-workflow)
for shared norms.

## GitHub Communication Method (Preferred)

Use `gh` CLI for issue and pull request communication when possible.

Repo-wide instructions live in `.github/copilot-instructions.md`. Path-scoped
Copilot instructions under `.github/instructions/*.instructions.md` remain in
effect for matching files and supplement the repo-wide guide.

## IDE deployment mirrors

| Path | Source |
| --- | --- |
| `.cursor/rules/agents-registry-proxy.mdc` | `.github/copilot-instructions.md` |

Regenerate after editing `copilot-instructions.md`:

```bash
npm run sync:cursor-rules
```

Do not edit `.cursor/rules/` directly.

## Branch Naming

Branch names MUST follow `<prefix>/<issue-number>-<slug>`.

Allowed prefixes:

- `fix/` for defects
- `feat/` for features
- `chore/` for maintenance
- `docs/` for documentation

## Commit Message Convention

Use conventional commit prefixes:

- `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`

Breaking changes should use `!` and include a `BREAKING CHANGE:` footer.

## Pull Request Expectations

1. Keep PRs focused and reviewable.
2. Every PR targeting `main` MUST include `Closes #<issue-number>` in
   `## Related Issues`.
3. Include command outputs for validation evidence.
4. Use deterministic language for behavior and policy updates.
5. Apply `.github/pull_request_template.md` sections fully.

## Validation

Before requesting review:

1. Run `npm run env:check`.
2. Run `npm run lint:all`.
3. Run `npm run check:secrets`.
4. Run `npm run test`.

## Security Rules

- Do not commit credentials or tokens.
- Keep `GITHUB_TOKEN` in Cloudflare secrets only.
- Preserve read-only proxy behavior unless issue scope explicitly changes it.
