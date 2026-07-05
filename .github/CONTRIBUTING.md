# Contributing

## Project Focus

This repository is a Cloudflare Worker proxy and governance baseline for registry access. Contributions should prioritize deterministic behavior, operational safety, and clear documentation.

## Before You Start

1. Open an issue with a matching issue form under `.github/ISSUE_TEMPLATE/`.
2. Confirm scope and acceptance criteria in the issue.
3. Classify the change type and branch prefix before implementation.

## GitHub Communication Method (Preferred)

Use `gh` CLI for issue and pull request communication when possible.

Recommended flow:

1. Inspect issue scope.
2. Create a branch from issue number and slug.
3. Open a draft pull request using `.github/pull_request_template.md`.
4. Hand off for human review. Agents MUST NOT merge pull requests into `main`,
   push directly to `main`, or mark PRs ready to merge without maintainer
   direction.

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

Branch names should follow `<prefix>/<issue-number>-<slug>`.

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
2. Include `Closes #<issue-number>` in `## Related Issues` when linked.
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
