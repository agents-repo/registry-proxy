# Registry proxy — project guidelines

This repository implements a Cloudflare Worker proxy for registry assets.

## Before Coding (Required)

1. Read [docs/AI_GUIDELINES.md](../docs/AI_GUIDELINES.md).
2. Read [docs/proxy-vs-registry.md](../docs/proxy-vs-registry.md).
3. Read [docs/local-validation-without-cloudflare.md](../docs/local-validation-without-cloudflare.md).
4. Read [docs/CLI_WORKFLOW.md](../docs/CLI_WORKFLOW.md).
5. Read [docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md).
6. Read [CONTRIBUTING.md](CONTRIBUTING.md).
7. Use an issue form under `.github/ISSUE_TEMPLATE/` before implementation.
8. Confirm no secret values are introduced into tracked files.

## Registry spec dependencies

Path and ZIP semantics are defined upstream in
[agents-repo/registry](https://github.com/agents-repo/registry) `specs/`.
Read before changing worker routing:

- [package-format.md](https://github.com/agents-repo/registry/blob/main/specs/package-format.md)
- [chat-consumption.md](https://github.com/agents-repo/registry/blob/main/specs/chat-consumption.md)
- [manifest-schema.md](https://github.com/agents-repo/registry/blob/main/specs/manifest-schema.md)

See [docs/proxy-vs-registry.md](../docs/proxy-vs-registry.md).

## Required Workflow (Task Start)

Follow `.github/CONTRIBUTING.md` **Required Workflow** (issue form → branch →
draft PR before implementation). Agents MUST NOT push to `main`, merge PRs into
`main`, or mark pull requests ready for review.

## Issue and PR Template Enforcement

Use the matching `.github/ISSUE_TEMPLATE/` form and
`.github/pull_request_template.md`. See `.github/CONTRIBUTING.md` for branch
prefixes (`chore/`, `fix/`, `feat/`, `docs/` — no `spec/` in this repo).

## Guardrails

- Worker HTTP API must remain GET-only unless an issue explicitly changes method
  policy. D1 increments on successful ZIP GETs are a GET side-effect.
- Path mapping must resolve to GitHub Raw upstream paths.
- Use `env.GITHUB_TOKEN` for upstream auth when available.
- Use `caches.default` for cache-first response behavior.
- Use `env.DOWNLOADS` (D1) for ZIP download counts. Do not store counts in KV.
- Never hardcode or commit token values.

## GitHub Communication (gh CLI)

Prefer `gh` for issues and draft PRs. See `.github/CONTRIBUTING.md`.

## Default Branch Integration (Agents)

Agents MUST NOT merge or push to `main`. Integration is human-only after review.

## Required Validation

- Run `npm run env:check`.
- Run `npm run lint:all`.
- Run `npm run check:secrets`.
- Run `npm run test`.
- Verify target endpoints return expected statuses.
- Confirm cache behavior with repeated requests.
- When changing D1 schema or deploy, apply migrations before deploy:
  `./scripts/migrate.sh`
  (`scripts/deploy.sh` does not apply migrations).

PR baseline extras (Chrome/`slides:check` and `agents:ci`) are path-filtered.
npm lockfiles do **not** trigger `agents:ci`. See the organization
[PR baseline extras (path filters)](https://github.com/agents-repo/.github/blob/main/CONTRIBUTING.md#pr-baseline-extras-path-filters).

## Pre-ready handoff

Before handoff on a task branch, agents MUST complete the organization
[Pre-ready agent handoff](https://github.com/agents-repo/.github/blob/main/CONTRIBUTING.md#pre-ready-agent-handoff)
norm, run **Required Validation** above, perform a self-review, and update the
**draft** PR with evidence. Agents MUST NOT mark pull requests ready for review.
After editing `.github/copilot-instructions.md`, run `npm run sync:ide-instructions`. See
`docs/AI_GUIDELINES.md`
for contributor-oriented detail.

## Cursor Cloud environment

See [agents-repo/.github docs/cursor-cloud.md](https://github.com/agents-repo/.github/blob/main/docs/cursor-cloud.md).
Path-scoped Copilot norms: `.github/instructions/`. Local `wrangler` needs
Cloudflare credentials; unit tests (`npm run test`) do not.
