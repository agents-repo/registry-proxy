# registry-proxy

![License](https://img.shields.io/github/license/agents-repo/registry-proxy) ![PR baseline checks](https://github.com/agents-repo/registry-proxy/actions/workflows/pr-baseline.yml/badge.svg?event=pull_request) [![Quality gate status](https://sonarcloud.io/api/project_badges/measure?project=agents-repo_registry-proxy&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=agents-repo_registry-proxy) ![Release](https://img.shields.io/github/v/release/agents-repo/registry-proxy?sort=semver) ![Stars](https://img.shields.io/github/stars/agents-repo/registry-proxy?style=flat) <!-- markdownlint-disable-line MD013 -->

![Conventional Commits](https://img.shields.io/badge/Conventional%20Commits-1.0.0-FE5196?style=flat&logo=conventionalcommits&logoColor=white) ![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-2.1-4baaaa) ![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg) ![Top language](https://img.shields.io/github/languages/top/agents-repo/registry-proxy) ![Node.js](https://img.shields.io/badge/Node.js-24-339933?style=flat&logo=nodedotjs&logoColor=white) ![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-F38020?style=flat&logo=cloudflare&logoColor=white) <!-- markdownlint-disable-line MD013 -->

---

Cloudflare Worker proxy for files in the GitHub repository agents-repo/registry only. It forwards read requests to GitHub Raw by default, applies edge caching, counts successful ZIP downloads in Cloudflare D1, and optionally uses the GitHub Contents API with a GitHub token stored as a Cloudflare secret.

## Development Environment

Use pinned runtime versions for consistent local and CI behavior.

- Node.js: `24.18.0` (`.nvmrc` and `.node-version`)
- npm: `12.0.1` (`packageManager` in `package.json`)

Setup:

```bash
nvm use
corepack enable npm
corepack prepare npm@12.0.1 --activate
node --version
npm --version
npm ci
npm run env:check
```

### npm 12 install scripts

npm 12 may block dependency install scripts until approved. This repository
currently has no allowlisted scripts; CI verifies `npm ci` leaves no
unreviewed scripts. If a future dependency needs install scripts:

```bash
npm install-scripts ls
npm install-scripts approve <name>@<version>
```

`npm install-scripts approve` writes the `allowScripts` entry to
`package.json`; commit that change with your dependency update.

Expected version output before continuing:

- Node.js: `v24.18.0`
- npm: `12.0.1`

If npm still resolves to a different version, ensure Corepack-managed npm is active in your shell before running project scripts.

Validation commands:

```bash
npm run lint:all
npm run check:secrets
npm run test
```

## Overview

This project exposes registry content through a Workers endpoint so web
clients do not hit GitHub Raw directly. Production origin is
`https://registry.agents-repo.org` (Custom Domain on the Agents Repo
Cloudflare account). The personal
`https://registry-proxy.maiconfz.workers.dev` URL remains live for existing
clients. The Worker is read-only by default (GET only), reduces repeated
upstream calls through edge caching, and centralizes token handling in
Cloudflare.

Scope is intentionally strict:

- Owner is fixed to agents-repo.
- Repository is fixed to registry.
- The Worker does not proxy arbitrary GitHub repositories.

## How It Works

1. A request hits the Worker endpoint in one of the supported formats:
   `/<ref>/<path>`, `/<path>`, `/<path>?ref=<ref>`, `/pkg/...`, `/tags`, or `/stats`.
1. The Worker maps the request to upstream content: `https://raw.githubusercontent.com/agents-repo/registry/<ref>/<path>`, or when `GITHUB_TOKEN` is present, `https://api.github.com/repos/agents-repo/registry/contents/<path>?ref=<ref>` with `Accept: application/vnd.github.raw`.
1. The Worker checks `caches.default` for a cached response.
1. On cache miss, it fetches upstream without Authorization for GitHub Raw, or with `Authorization: Bearer <GITHUB_TOKEN>` and `Accept: application/vnd.github.raw` for the Contents API.
1. Successful upstream responses with status 200 are cached and returned to the caller.
1. HTTP 200 versioned ZIP artifacts increment D1 download counts in the background.
1. For HTTP 200 file responses, the Worker normalizes `Content-Type` from the
   requested path extension when mapped, and falls back to
   `application/octet-stream` for unmapped extensions served as
   `application/vnd.github.raw`. See [Content-Type normalization](docs/ARCHITECTURE.md#content-type-normalization) for the full from-to table.

Guidance routes:

- `/`
- `/main`
- `/main/`

These routes return JSON usage guidance and do not proxy upstream.

When `ref` is omitted for a non-path-style file request (including `/packages/...`,
`/README.md`, and `/pkg/...`), the Worker defaults to Git ref `main`. Path-style
`/<ref>/<path>` and explicit `?ref=` are unchanged. Prefer an explicit release
line such as `?ref=v2.x` when you need catalog-line resolution rather than
branch `main`.

## Deploy

1. Install Wrangler and authenticate to the Agents Repo Cloudflare account (see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)).
2. Optional but recommended: set a GitHub token secret for higher upstream reliability and rate-limit headroom:
   - `npx wrangler secret put GITHUB_TOKEN`
3. Apply D1 migrations before deploy (`./scripts/migrate.sh`). See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
4. Deploy:
   - `./scripts/deploy.sh`
   - or `npx --ignore-scripts wrangler deploy`

Detailed deployment and validation steps are in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Usage Examples

Worker URL pattern:

- `https://registry.agents-repo.org/<ref>/<path>`
- `https://registry.agents-repo.org/<path>` (defaults to ref `main`)
- `https://registry.agents-repo.org/<path>?ref=<ref>`

Examples:

- Main branch:
  - `https://registry.agents-repo.org/main/packages/index.json`
  - `https://registry.agents-repo.org/packages/index.json`
  - `https://registry.agents-repo.org/packages/index.json?ref=main`
  - `https://registry.agents-repo.org/README.md`
- Named branch:
  - `https://registry.agents-repo.org/packages/index.json?ref=release-2026-06`
- Tag:
  - `https://registry.agents-repo.org/packages/index.json?ref=v2.0.0`
- Namespaced package artifact (v2+ layout):
  - `https://registry.agents-repo.org/v2.x/packages/agents-repo/hello-agent/versions/1.0.0/1.0.0-cursor.zip`
- Commit SHA:
  - `https://registry.agents-repo.org/packages/index.json?ref=d34db33fd34db33fd34db33fd34db33fd34db33f`

## `/pkg/` chat instruction aliases

Chat-web consumers use shorter `/pkg/` paths that always resolve to immutable
version snapshots under `packages/<namespace>/<package-id>/versions/<version>/...`.
For `/pkg/` routes, query `ref` is optional and defaults to `main`. Path-style
`/<ref>/pkg/...` is not supported. Pass `?ref=v2.x` (or another release line)
when you need a catalog tag rather than branch `main`.

Supported shapes:

- Version in path (matches `instructions.json` path fields):
  - `/pkg/<namespace>/<package-id>/<version>/agents/<agent-id>.agent.md`
  - `/pkg/<namespace>/<package-id>/<version>/flows/<flow-id>.agent.md`
  - `/pkg/<namespace>/<package-id>/<version>/instructions.json`
  - Optional `?ref=<ref>` on any of the above
- Short alias (optional `version` query; otherwise `latest` from `versions/manifest.json`):
  - `/pkg/<namespace>/<package-id>/agents/<agent-id>[?ref=<ref>][&version=<semver>]`
  - `/pkg/<namespace>/<package-id>/flows/<flow-id>[?ref=<ref>][&version=<semver>]`
  - `/pkg/<namespace>/<package-id>/instructions.json[?ref=<ref>][&version=<semver>]`

Canonical proxy equivalent for the same flow instruction (pinned `1.0.0` at ref `v2.x`):

- Alias:
  - `https://registry.agents-repo.org/pkg/agents-repo/hello-agent/flows/hello-agents?ref=v2.x&version=1.0.0`
- Canonical:
  - `https://registry.agents-repo.org/v2.x/packages/agents-repo/hello-agent/versions/1.0.0/flows/hello-agents.agent.md`

Example without explicit ref (uses `main`):

- `https://registry.agents-repo.org/pkg/agents-repo/hello-agent/1.0.1/agents/hello-agent.agent.md`

## Tags listing

`GET /tags` returns all release tag names for `agents-repo/registry` as a JSON array in GitHub API shape: `[{ "name": "v1.2.0" }, ...]`.

- No ref parameter required.
- Responses include CORS `Access-Control-Allow-Origin: *`.
- Successful responses are edge-cached like file proxy responses.
- When `GITHUB_TOKEN` is configured, upstream uses authenticated GitHub API requests.

Example:

```bash
curl -s "https://registry.agents-repo.org/tags"
```

## Download stats

`GET /stats` returns package download totals counted from successful ZIP GETs
through this Worker (including cache hits). Each ZIP `200` inserts one D1
`download_events` row with a UTC ISO-8601 `downloaded_at` timestamp. `/stats`
aggregates those events (no hourly rollup).

- Root meta route (not `/main/stats` — that is a file path).
- Query `ref` is ignored: `/stats?ref=v2.x` is still stats.
- `GET /stats` → `{ "packages": [{ "namespace", "package", "downloads",
  "downloads_7d", "downloads_30d", "downloads_365d" }] }`
- Optional `?period=all|7d|30d|365d` changes sort order only (default `all`).
  Unknown period → HTTP 400.
- Windows are rolling (`datetime('now', '-7 days')` and the same pattern for
  30d and 365d). `downloads` is all-time.
- `GET /stats/packages/<namespace>/<package-id>` → four package totals plus
  per-artifact all-time rows
- Unknown packages return HTTP 200 with zeros
- Missing D1 returns HTTP 503
- Responses include CORS `Access-Control-Allow-Origin: *` and
  `Cache-Control: public, max-age=60`

Migration `0002` drops undated `download_counts` and creates `download_events`.
Apply it **before** deploying this Worker. That reset is intentional (no backfill).

Example:

```bash
curl -s "https://registry.agents-repo.org/stats"
curl -s "https://registry.agents-repo.org/stats?period=365d"
curl -s "https://registry.agents-repo.org/stats/packages/agents-repo/hello-agent"
```

Notes:

- Legacy flat package paths are rejected with HTTP 400
  (`legacy_flat_path_not_supported`): a bare package id (for example
  `packages/hello-agent`) or any path whose second segment is `versions` under
  that id (for example `packages/hello-agent/versions/1.0.0/...`). Other paths
  under a flat id (such as `packages/hello-agent/metadata.json`) are proxied
  upstream. Use namespaced paths: `packages/<namespace>/<package-id>/...`.
- If both path ref and query ref are present, query ref is used.
- Non-GET methods are rejected with `405 Method Not Allowed`.

## Release Workflow

- Conventional commit mapping is used for semantic releases.
- Tags follow `v<MAJOR>.<MINOR>.<PATCH>`.
- Releases publish only from `main`.
- Manual workflow dispatch supports dry runs via `dry_run=true`.

## Use in Webapp

Point your client to `https://registry.agents-repo.org` and include a ref using one of the supported formats:

- `/main/packages/index.json`
- `/packages/index.json?ref=main`

Example:

- `https://registry.agents-repo.org/main/packages/index.json`

## Project Docs

- [Ecosystem overview](https://github.com/agents-repo/.github/blob/main/docs/ecosystem.md) (organization platform map)
- [CONTRIBUTING.md](CONTRIBUTING.md)
- [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md)
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- [docs/CLI_WORKFLOW.md](docs/CLI_WORKFLOW.md)
- [docs/AI_GUIDELINES.md](docs/AI_GUIDELINES.md)
- Presentation slides: [docs/slides/README.md](docs/slides/README.md)

## Docs and repository pages

For user guides and cross-repo documentation, see
[agents-repo.org/docs/](https://agents-repo.org/docs/).
For this repository's overview on the public site, see
[agents-repo.org/repositories/registry-proxy/](https://agents-repo.org/repositories/registry-proxy/).

When you change a user-facing or contributor workflow in this
repository, update the corresponding page(s) in
[agents-repo/webapp](https://github.com/agents-repo/webapp) under
`src/content/docs/` in the same PR or an immediate follow-up.

## Governance Index

- Issue forms: `.github/ISSUE_TEMPLATE/`
- Pull request template: `.github/pull_request_template.md`
- GitHub Copilot project instructions: `.github/copilot-instructions.md`
- Cursor project rules: `.cursor/rules/agents-registry-proxy.mdc`
- IDE instruction sync: `npm run sync:ide-instructions` (after editing `.github/copilot-instructions.md`)
- CI workflows: `.github/workflows/`
- Code ownership: `.github/CODEOWNERS`

## MIT License

Licensed under MIT. See [LICENSE](LICENSE).
