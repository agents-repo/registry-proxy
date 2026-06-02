# Copilot Project Instructions

This repository implements a Cloudflare Worker proxy for registry assets.

## Before Coding (Required)

1. Read [../docs/AI_GUIDELINES.md](../docs/AI_GUIDELINES.md).
2. Read [../docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md).
3. Read [../CONTRIBUTING.md](../CONTRIBUTING.md).
4. Confirm no secret values are introduced into tracked files.

## Guardrails

- Worker must remain read-only unless issue explicitly changes method policy.
- Path mapping must resolve to GitHub Raw upstream paths.
- Use `env.GITHUB_TOKEN` for upstream auth when available.
- Use `caches.default` for cache-first response behavior.
- Never hardcode or commit token values.

## Required Validation

- Verify target endpoints return expected statuses.
- Confirm cache behavior with repeated requests.
- Confirm secret hygiene checks before finalizing.
