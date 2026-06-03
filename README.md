# registry-proxy

Cloudflare Worker proxy for the agents-repo package registry. It forwards read requests to GitHub Raw, applies edge caching, and optionally authenticates upstream requests with a GitHub token stored as a Cloudflare secret.

## Development Environment

Use pinned runtime versions for consistent local and CI behavior.

- Node.js: `24.15.0` (`.nvmrc` and `.node-version`)
- npm: `11.12.1` (`packageManager` in `package.json`)

Setup:

```bash
nvm use
corepack enable
corepack prepare npm@11.12.1 --activate
npm ci
npm run env:check
```

Validation commands:

```bash
npm run lint:all
npm run check:secrets
npm run test
```

## Overview

This project exposes registry content through a Workers endpoint so web clients do not hit GitHub Raw directly. The Worker is read-only by default (GET only), reduces repeated upstream calls through edge caching, and centralizes token handling in Cloudflare.

## How It Works

1. A request hits the Worker endpoint, for example `/packages/index.json`.
2. The Worker maps the path to the upstream GitHub Raw URL.
3. The Worker checks `caches.default` for a cached response.
4. On cache miss, it fetches upstream with `Authorization: token <GITHUB_TOKEN>` when the secret exists.
5. Successful upstream responses are cached and returned to the caller.

Default upstream base URL:

- `https://raw.githubusercontent.com/agents-repo/registry/main`

Optional env override:

- `UPSTREAM_BASE_URL`

## Deploy

1. Install Wrangler and authenticate with Cloudflare.
2. Set the GitHub token as a secret:
   - `wrangler secret put GITHUB_TOKEN`
3. Deploy:
   - `./scripts/deploy.sh`
   - or `wrangler deploy`

Detailed deployment and validation steps are in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Release Workflow

- Conventional commit mapping is used for semantic releases.
- Tags follow `v<MAJOR>.<MINOR>.<PATCH>`.
- Releases publish only from `main`.
- Manual workflow dispatch supports dry runs via `dry_run=true`.

## Use in Webapp

Point your client to your workers.dev URL, then request registry paths directly:

- `/packages/index.json`
- `/packages//manifest.json`

Example:

- `https://<worker>.workers.dev/packages/index.json`

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
