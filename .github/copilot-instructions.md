# Copilot Project Instructions

This repository implements a Cloudflare Worker proxy for registry assets.

## Before Coding (Required)

1. Read [../docs/AI_GUIDELINES.md](../docs/AI_GUIDELINES.md).
2. Read [../docs/CLI_WORKFLOW.md](../docs/CLI_WORKFLOW.md).
3. Read [../docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md).
4. Read [CONTRIBUTING.md](CONTRIBUTING.md).
5. Use an issue form under `.github/ISSUE_TEMPLATE/` before implementation.
6. Confirm no secret values are introduced into tracked files.

## Required Workflow (Task Start)

Before implementation, agents MUST:

1. Open a tracking issue (matching issue form when available).
2. Create a branch named `<prefix>/<issue-number>-<slug>`.
3. Push the branch and open a draft pull request targeting `main` with
   `Closes #<issue-number>` before implementation commits. Pull requests MUST
   be created as drafts (`gh pr create --draft`).

Agents MAY push additional commits to the task branch when requested.
Agents MUST NOT push to `main`, merge PRs into `main`, or mark pull requests
ready for review.
After validation, the developer manually marks the pull request ready for
review; agents MUST NOT perform that step.
Agents MUST complete requested implementation work on the task branch, then
hand off. Ready-for-review and merge are for a human maintainer.

Task start in this organization authorizes workflow scaffolding (issue,
branch, draft PR) even when generic tooling rules defer commits until
requested. Repo-level agent instructions govern this workspace and supersede
generic commit or pull request timing rules for workflow setup steps.

## Issue and PR Template Enforcement

When opening tracking issues, agents MUST use the issue form under
`.github/ISSUE_TEMPLATE/` that matches the task type:

- bug or inconsistency: `.github/ISSUE_TEMPLATE/bug-inconsistency.yml`
- feature proposal: `.github/ISSUE_TEMPLATE/feature-proposal.yml`
- task or chore: `.github/ISSUE_TEMPLATE/task-chore.yml`

When opening a pull request, the agent MUST follow
`.github/pull_request_template.md`.

The agent MUST report template usage in its final PR handoff summary.

If the available tool path cannot programmatically apply a template, the
agent MUST explicitly state that limitation and MUST include all required
sections from the intended template in the issue or PR body.

## Guardrails

- Worker must remain read-only unless issue explicitly changes method policy.
- Path mapping must resolve to GitHub Raw upstream paths.
- Use `env.GITHUB_TOKEN` for upstream auth when available.
- Use `caches.default` for cache-first response behavior.
- Never hardcode or commit token values.

## Default Branch Integration (Agents)

- AI agents and coding assistants MUST NOT merge pull requests into `main`
  (including `gh pr merge`, squash/rebase merge, or local `git merge` followed
  by push).
- AI agents MUST NOT push commits directly to `main`.
- Integration to `main` is a human-only, manual step performed by maintainers
  after review. All contributors MUST deliver changes to `main` only through
  merged pull requests.
- Agents MUST hand off at PR creation and state that merge is for a human
  maintainer.

## Required Validation

- Run `npm run env:check`.
- Run `npm run lint:all`.
- Run `npm run check:secrets`.
- Run `npm run test`.
- Verify target endpoints return expected statuses.
- Confirm cache behavior with repeated requests.
