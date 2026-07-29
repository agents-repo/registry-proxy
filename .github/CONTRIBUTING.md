# Contributing

## Project Focus

This repository is a Cloudflare Worker proxy and governance baseline for registry access. Contributions should prioritize deterministic behavior, operational safety, and clear documentation.

## Before You Start

1. Open an issue with a matching issue form under `.github/ISSUE_TEMPLATE/`.
2. Confirm scope and acceptance criteria in the issue.
3. Classify the change type and branch prefix before implementation.

## Required Workflow

Contributors and agents MUST follow this full lifecycle.

### Task setup (before implementation)

1. Inspect issue scope:
   `gh issue view <number> --repo agents-repo/registry-proxy`
2. Create a branch from issue number and slug.
3. Push the branch to the remote repository.
4. Open a draft pull request using `.github/pull_request_template.md` before
   implementation commits. Pull requests MUST be created as drafts
   (`gh pr create --draft`).

### Delivery (after draft PR)

1. Implement, validate, then hand off. After validation passes, the developer
   manually marks the pull request ready for review in GitHub. Agents MUST NOT
   merge pull requests into `main`, push directly to `main`, or mark pull
   requests ready for review.

All contributors MUST integrate changes to `main` only through merged pull
requests. Direct commits or pushes to `main` MUST NOT be used.

GitHub cannot open a pull request when the head and base branches are
identical. Before `gh pr create --draft`, push at least one commit on the task
branch so its head differs from `main` (for example
`git commit --allow-empty -m "chore: scaffold draft PR for #<issue-number>"`).
An empty commit is sufficient when no file changes are needed yet.
Implementation commits may follow on the same branch.

See [docs/CLI_WORKFLOW.md](../docs/CLI_WORKFLOW.md) for command examples and
the organization
[Required Workflow](https://github.com/agents-repo/.github/blob/main/CONTRIBUTING.md#required-workflow)
for shared norms.

## Workflow exceptions

1. **Security vulnerabilities** — Follow the private advisory flow. In
   `## Related Issues`, use `Closes #<issue-number>` when maintainers provide
   a linked private or advisory tracking issue. Otherwise, reference the
   private security advisory identifier (for example `GHSA-...`) in
   `## Related Issues` and coordinate linkage with maintainers.
2. **Maintainer emergency hotfix** — Work on a hotfix branch only with prior
   maintainer approval documented in an issue or advisory. Delivery to `main`
   is still via merged pull request (no direct push).

## GitHub Communication Method (Preferred)

Use `gh` CLI for issue and pull request communication when possible.

Repo-wide instructions live in `.github/copilot-instructions.md`. Path-scoped
GitHub Copilot instructions under `.github/instructions/*.instructions.md` remain in
effect for matching files and supplement the repo-wide guide.

## IDE deployment mirrors

| Tool | Path | Source |
| --- | --- | --- |
| GitHub Copilot | `.github/copilot-instructions.md` | (canonical) |
| Cursor | `.cursor/rules/agents-registry-proxy.mdc` | `.github/copilot-instructions.md` |

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

Governance and documentation changes use `docs/` or `chore/` with the
matching issue form. This repository has no separate spec-change form.

## Commit Message Convention

Use conventional commit prefixes:

- `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`

Breaking changes should use `!` and include a `BREAKING CHANGE:` footer.

## Pull Request Expectations

1. Keep PRs focused and reviewable.
2. Every PR targeting `main` MUST include a tracking reference in
   `## Related Issues`: `Closes #<issue-number>` for standard tasks, or the
   security-advisory format described in **Workflow exceptions** when
   applicable.
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
