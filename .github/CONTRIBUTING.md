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
2. **Maintainer emergency hotfix** — Work on a `fix/<issue-number>-<slug>`
   branch only with prior maintainer approval documented in an issue or
   advisory. Do not use a separate `hotfix/` prefix. Delivery to `main` is
   still via merged pull request (no direct push).

## GitHub Communication Method (Preferred)

Use `gh` CLI for issue and pull request communication when possible.

Repo-wide instructions live in `.github/copilot-instructions.md`. Path-scoped
GitHub Copilot instructions under `.github/instructions/*.instructions.md` remain in
effect for matching files and supplement the repo-wide guide.

## IDE setup

### Project guidelines (repo-specific)

| Install target | Path | Source |
| --- | --- | --- |
| GitHub Copilot | `.github/copilot-instructions.md` | **Canonical** — edit here |
| Cursor | `.cursor/rules/agents-registry-proxy.mdc` | Mirrored from copilot-instructions |
| Claude Code | `CLAUDE.md` | Mirrored from copilot-instructions |
| OpenAI Codex | `AGENTS.md` | Mirrored from copilot-instructions |

Regenerate mirrors after editing `copilot-instructions.md`:

```bash
npm run sync:ide-instructions
```

Do not edit `.cursor/rules/`, `CLAUDE.md`, or `AGENTS.md` directly.

### Registry workflow packages (CLI)

Install and refresh catalog packages with the [agents-repo CLI](https://github.com/agents-repo/cli).
`agents.json` points at `https://registry-proxy.maiconfz.workers.dev` (organization
catalog proxy).

Bootstrap only when `agents.json` is missing (one-time; use a published CLI
release or `npm exec agents-repo -- init` after `npm ci`):

```bash
npm exec agents-repo -- init --targets github-copilot claude-code cursor openai-codex
```

Use the npm scripts for bulk install, update, and CI (CLI version is pinned in
`package.json` / `package-lock.json`, distinct from registry packages in
`agents-lock.json`):

```bash
npm run agents:install   # bulk sync from agents.json
npm run agents:update    # refresh within semver ranges
npm run agents:ci        # same command pr-baseline uses after npm ci
```

Commit `agents.json`, `agents-lock.json`, and extracted paths (`.github/agents/`, `.cursor/skills/`, `.claude/agents/`, `.agents/skills/`). Do not hand-edit extracted package files.

PR baseline runs `npm run agents:ci` to reinstall from the committed registry lock and fail on extract drift ([agents-repo/.github#32](https://github.com/agents-repo/.github/issues/32), [agents-repo/.github#34](https://github.com/agents-repo/.github/issues/34)).

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

## Security Rules

- Do not commit credentials or tokens.
- Keep `GITHUB_TOKEN` in Cloudflare secrets only.
- Preserve read-only proxy behavior unless issue scope explicitly changes it.
