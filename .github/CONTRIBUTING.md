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
3. Open a pull request using `.github/pull_request_template.md`.

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
