# registry-proxy

Cloudflare Worker proxy for files in the GitHub repository agents-repo/registry only. It forwards read requests to GitHub Raw by default, applies edge caching, and optionally uses the GitHub Contents API with a GitHub token stored as a Cloudflare secret.

## Development Environment

Use pinned runtime versions for consistent local and CI behavior.

- Node.js: `24.15.0` (`.nvmrc` and `.node-version`)
- npm: `11.12.1` (`packageManager` in `package.json`)

Setup:

```bash
nvm use
corepack enable
corepack prepare npm@11.12.1 --activate
node --version
npm --version
npm ci
npm run env:check
```

Expected version output before continuing:

- Node.js: `v24.15.0`
- npm: `11.12.1`

If npm still resolves to a different version, ensure Corepack-managed npm is active in your shell before running project scripts.

Validation commands:

```bash
npm run lint:all
npm run check:secrets
npm run test
```

## Overview

This project exposes registry content through a Workers endpoint so web clients do not hit GitHub Raw directly. The Worker is read-only by default (GET only), reduces repeated upstream calls through edge caching, and centralizes token handling in Cloudflare.

Scope is intentionally strict:

- Owner is fixed to agents-repo.
- Repository is fixed to registry.
- The Worker does not proxy arbitrary GitHub repositories.

## How It Works

1. A request hits the Worker endpoint in one of the supported formats: `/<ref>/<path>` or `/<path>?ref=<ref>`.
1. The Worker maps the request to upstream content: `https://raw.githubusercontent.com/agents-repo/registry/<ref>/<path>`, or when `GITHUB_TOKEN` is present, `https://api.github.com/repos/agents-repo/registry/contents/<path>?ref=<ref>` with `Accept: application/vnd.github.raw`.
1. The Worker checks `caches.default` for a cached response.
1. On cache miss, it fetches upstream without Authorization for GitHub Raw, or with `Authorization: Bearer <GITHUB_TOKEN>` and `Accept: application/vnd.github.raw` for the Contents API.
1. Successful upstream responses with status 200 are cached and returned to the caller.

Guidance routes:

- `/`
- `/main`
- `/main/`

These routes return JSON usage guidance and do not proxy upstream.

If no ref is provided for a file request, the Worker returns a `400` JSON response with valid usage examples.

## Deploy

1. Install Wrangler and authenticate with Cloudflare.
2. Optional but recommended: set a GitHub token secret for higher upstream reliability and rate-limit headroom:
   - `wrangler secret put GITHUB_TOKEN`
3. Deploy:
   - `./scripts/deploy.sh`
   - or `wrangler deploy`

Detailed deployment and validation steps are in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Usage Examples

Worker URL pattern:

- `https://<worker>.workers.dev/<ref>/<path>`
- `https://<worker>.workers.dev/<path>?ref=<ref>`

Examples:

- Main branch:
  - `https://<worker>.workers.dev/main/packages/index.json`
  - `https://<worker>.workers.dev/packages/index.json?ref=main`
- Named branch:
  - `https://<worker>.workers.dev/packages/index.json?ref=release-2026-06`
- Tag:
  - `https://<worker>.workers.dev/packages/index.json?ref=v1.0.0`
- Commit SHA:
  - `https://<worker>.workers.dev/packages/index.json?ref=d34db33fd34db33fd34db33fd34db33fd34db33f`

Notes:

- If both path ref and query ref are present, query ref is used.
- Non-GET methods are rejected with `405 Method Not Allowed`.

## Release Workflow

- Conventional commit mapping is used for semantic releases.
- Tags follow `v<MAJOR>.<MINOR>.<PATCH>`.
- Releases publish only from `main`.
- Manual workflow dispatch supports dry runs via `dry_run=true`.

## Use in Webapp

Point your client to your workers.dev URL and include a ref using one of the supported formats:

- `/main/packages/index.json`
- `/packages/index.json?ref=main`

Example:

- `https://<worker>.workers.dev/main/packages/index.json`

## Project Docs

- [CONTRIBUTING.md](CONTRIBUTING.md)
- [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md)
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- [docs/CLI_WORKFLOW.md](docs/CLI_WORKFLOW.md)
- [docs/AI_GUIDELINES.md](docs/AI_GUIDELINES.md)

## Governance Index

- Issue forms: `.github/ISSUE_TEMPLATE/`
- Pull request template: `.github/pull_request_template.md`
- Copilot project instructions: `.github/copilot-instructions.md`
- CI workflows: `.github/workflows/`
- Code ownership: `.github/CODEOWNERS`

## MIT License

Licensed under MIT. See [LICENSE](LICENSE).
