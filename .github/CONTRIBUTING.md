# Contributing

## Project Focus

This repository is a Cloudflare Worker proxy and governance baseline for registry access. Contributions should prioritize deterministic behavior, operational safety, and clear documentation.

## Docs and repository pages

For user guides and cross-repo documentation, see
[agents-repo.org/docs/](https://agents-repo.org/docs/).
For this repository's overview on the public site, see
[agents-repo.org/repositories/registry-proxy/](https://agents-repo.org/repositories/registry-proxy/).

When you change a user-facing or contributor workflow in this
repository, update the corresponding page(s) in
[agents-repo/webapp](https://github.com/agents-repo/webapp) under
`src/content/docs/` in the same PR or an immediate follow-up.

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
2. **Maintainer emergency hotfix** — Work on a `fix/<issue-number>-<slug>`
   branch only with prior maintainer approval documented in an issue or
   advisory. Do not use a separate `hotfix/` prefix. Delivery to `main` is
   still via merged pull request (no direct push).

## GitHub Communication Method (Preferred)

Use `gh` CLI for issue and pull request communication when possible.

Repo-wide instructions live in `.cursor/rules/agents-registry-proxy.mdc`. Path-scoped
rules sync to `.github/instructions/*.instructions.md` for GitHub Copilot. Path-scoped
GitHub Copilot instructions under `.github/instructions/*.instructions.md` remain in
effect for matching files and supplement the repo-wide guide.

## IDE setup

### Project guidelines (repo-specific)

| Install target | Path | Source |
| --- | --- | --- |
| Cursor | `.cursor/rules/agents-registry-proxy.mdc` (+ path `*.mdc`) | **Canonical** — edit here |
| GitHub Copilot | `.github/copilot-instructions.md`, `.github/instructions/*` | Generated |
| Claude Code | `CLAUDE.md` | Generated |
| OpenAI Codex | `AGENTS.md` | Generated |

Regenerate mirrors after editing `.cursor/rules/`:

```bash
npm run sync:ide-instructions
```

Do not edit `.github/copilot-instructions.md`, `CLAUDE.md`, or `AGENTS.md` directly.

### Registry workflow packages (org hub)

This repository does not commit `agents.json`. Shared planning/review packages
install in [agents-repo/.github](https://github.com/agents-repo/.github). See
[org-workspace-and-agents.md](https://github.com/agents-repo/.github/blob/main/docs/org-workspace-and-agents.md).
PR baseline does not run `agents:verify` here; see [docs/ci.md](https://github.com/agents-repo/.github/blob/main/docs/ci.md).

## Branch Naming

Branch names MUST follow `<prefix>/<issue-number>-<slug>`, where `<slug>` is
short lowercase kebab-case. This repository has no normative `specs/` tree—do
not use `spec/` branches or `spec-change.yml`.

| Work type | Prefix | Example |
| --- | --- | --- |
| Bug or inconsistency | `fix/` | `fix/42-proxy-cache-mismatch` |
| Feature proposal | `feat/` | `feat/8-install-package` |
| Task or chore | `chore/` | `chore/31-sync-workflow-docs` |
| Documentation-only work | `docs/` | `docs/88-update-pr-guidance` |

Governance and documentation changes use `docs/` or `chore/` with the matching
issue form.

See the organization [branch prefix reference](https://github.com/agents-repo/.github/blob/main/CONTRIBUTING.md#branch-prefix-reference)
for the canonical cross-repo mapping.

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
2. Run `npm run lint:all` (includes `lint:workflows` / actionlint). When bumping
   `ACTIONLINT_VERSION` in `scripts/lint-workflows.mjs`, replace
   `scripts/actionlint_<version>_checksums.txt` with the matching file from the
   [actionlint GitHub release](https://github.com/rhysd/actionlint/releases) and
   remove the previous version's checksums file. Keep the same pin across
   organization repositories. See the organization
   [GitHub Actions workflow linting](https://github.com/agents-repo/.github/blob/main/CONTRIBUTING.md#github-actions-workflow-linting)
   norm.
3. Run `npm run check:secrets`.
4. Run `npm run test`.

SonarQube Cloud Automatic Analysis reads `.sonarcloud.properties`, not
`sonar-project.properties` (that filename is ignored while Automatic Analysis
is on). `sonar.sources` and `sonar.tests` must be disjoint directory lists (no
wildcards). Do not set `sonar.sources` to `.` while `sonar.tests` lists nested
directories; analysis fails with “Source and test paths overlap”. This
repository sets `sonar.sources=src,scripts,docs` and `sonar.tests=test`.
Coverage report paths are unsupported under Automatic Analysis.

## Security Rules

- Do not commit credentials or tokens.
- Keep `GITHUB_TOKEN` in Cloudflare secrets only.
- Preserve read-only proxy behavior unless issue scope explicitly changes it.
