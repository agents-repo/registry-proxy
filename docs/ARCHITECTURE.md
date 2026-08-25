# Architecture

## Goal

Proxy registry files through Cloudflare Workers with caching, using GitHub Raw by default and the GitHub Contents API for authenticated upstream access.

## Request Lifecycle

1. Client requests a registry path on `https://registry.agents-repo.org`, `GET /tags` for tag listing, or `GET /stats` for download totals.
2. Worker normalizes the path and builds the upstream URL (file content or tags API). Stats routes do not proxy upstream.
3. Worker checks `caches.default` by resolved upstream URL.
4. On miss, Worker fetches GitHub Raw when no token is present, or GitHub Contents API with `Accept: application/vnd.github.raw` when `GITHUB_TOKEN` is present. Tag listing always uses the GitHub tags API with optional token auth.
5. Worker returns upstream response and caches successful results.
6. For HTTP 200 file responses, Worker normalizes `Content-Type` from the
   requested path extension when mapped (see **Content-Type normalization**).
7. For HTTP 200 versioned ZIP artifacts, Worker inserts a D1 download event in
   `ctx.waitUntil` (cache hit and miss). A D1 failure does not fail the ZIP
   response.

## Components

- Worker runtime: request parsing, mapping, fetch, response handling.
- Cloudflare edge cache: response reuse for repeated GET requests.
- Cloudflare D1 (`DOWNLOADS`): timestamped ZIP download events (`download_events`).
- Cloudflare secret: `GITHUB_TOKEN` for authenticated GitHub Contents API and tags API access.

## Path Mapping

- Incoming path: `/main/packages/index.json`
- Upstream base: `https://raw.githubusercontent.com/agents-repo/registry`
- Resolved upstream: `https://raw.githubusercontent.com/agents-repo/registry/main/packages/index.json`
- Authenticated upstream (when token exists): `https://api.github.com/repos/agents-repo/registry/contents/packages/index.json?ref=main`
- Omitted ref (non-path-style): `/packages/index.json` and `/README.md` resolve with default ref `main`

## Content-Type normalization

Applied to all file-proxy HTTP 200 responses (cache hit and miss), not only
`/pkg/`. Non-200 responses keep the upstream `Content-Type` unchanged.
Extension is taken from the final path basename (case-insensitive), ignoring
query strings.

### Extension mappings

When the basename extension is listed below, the Worker sets the response
`Content-Type` to the mapped value. This overrides any upstream type, including
`application/vnd.github.raw`.

| Extension | Response `Content-Type` |
| --- | --- |
| `.css` | `text/css; charset=utf-8` |
| `.htm` | `text/html; charset=utf-8` |
| `.html` | `text/html; charset=utf-8` |
| `.js` | `text/javascript; charset=utf-8` |
| `.json` | `application/json; charset=utf-8` |
| `.md` | `text/plain; charset=utf-8` |
| `.svg` | `image/svg+xml` |
| `.txt` | `text/plain; charset=utf-8` |
| `.xml` | `application/xml; charset=utf-8` |
| `.yaml` | `text/yaml; charset=utf-8` |
| `.yml` | `text/yaml; charset=utf-8` |
| `.zip` | `application/zip` |

### Unmapped extensions

When the extension is not in the table above:

| Upstream `Content-Type` | Response `Content-Type` |
| --- | --- |
| `application/vnd.github.raw` | `application/octet-stream` |
| any other | unchanged (upstream value preserved) |

## Tags Listing

- Incoming path: `/tags` (root meta route only; no ref parameter)
- Upstream: `https://api.github.com/repos/agents-repo/registry/tags?per_page=100` with pagination until all pages are fetched
- Response: aggregated JSON array `[{ "name": "v1.2.0" }, ...]` (GitHub-compatible)
- Cache key: stable tags API URL for page 1
- Edge cache TTL: **300 seconds** (`TAGS_EDGE_TTL_SECONDS`). The worker stores
  `X-Registry-Proxy-Tags-Cached-At` on cached `/tags` responses and re-fetches
  upstream when that age exceeds the TTL. Client responses include
  `Cache-Control: public, max-age=300`. Cached `cache.put` entries omit
  `Cache-Control` so the Workers Cache API does not evict them before the worker
  TTL check.
- Path-style routes such as `/main/tags` remain file proxy requests, not tag listing

## Download stats

- Incoming paths MUST start with `/stats` (root meta route, same prefix pattern as `/pkg/`).
- Each HTTP 200 versioned ZIP GET inserts one `download_events` row with
  `downloaded_at` TEXT UTC ISO-8601 from SQLite `datetime('now')`
  (`YYYY-MM-DD HH:MM:SS`). Do not write JavaScript `toISOString()`.
- Migration `0002` drops undated `download_counts` and creates `download_events`.
  Applying it wipes recent all-time totals. There is no backfill.
- `GET /stats` aggregates events directly (no summary table or Cron). Each package
  item is `{ "namespace", "package", "downloads", "downloads_7d", "downloads_30d",
  "downloads_365d" }`. Sorted by the selected period descending, then namespace,
  then package.
- Optional `?period=all|7d|30d|365d` changes **ORDER BY only** (default `all`).
  Unknown `period` returns HTTP 400 (`invalid_stats_period`). Query `ref` is ignored.
- Windows are rolling UTC time: `7d` is `downloaded_at >= datetime('now', '-7 days')`
  (same pattern for 30d and 365d). All-time is every event. Do not prune events.
- `GET /stats/packages/<namespace>/<package-id>` returns the same four package
  totals plus `{ "version", "target", "downloads" }` artifact rows (all-time only).
  Unknown packages return HTTP 200 with zeros and empty `artifacts`.
- Path-style `/main/stats` remains a file proxy.
- Counts insert on HTTP 200 versioned ZIP paths
  `packages/<namespace>/<package-id>/versions/<semver>/<semver>-<target-id>.zip`
  (cache hit and miss). Counts are ref-agnostic.
- Non-ZIP paths, 304, 4xx/5xx, and `/pkg/` resources are not counted.
- Client `Cache-Control: public, max-age=60`. Stats responses are **not** stored
  in `caches.default`.
- Missing D1: ZIP downloads still succeed; `/stats` returns HTTP 503
  (`downloads_unavailable`).
- HTTP stays GET-only. D1 writes are a GET side-effect.

## Catalog and versioned file cache

Mutable catalog files use the same 300-second worker TTL pattern as `/tags`:

- `packages/index.json`
- `packages/tree.json`
- `packages/<namespace>/<package-id>/detail.json`

The worker stores `X-Registry-Proxy-Catalog-Cached-At` on those cached
responses, re-fetches when that age exceeds `CATALOG_EDGE_TTL_SECONDS` (300),
and serves the stale cached body when upstream is unreachable or returns any
non-200 status except `404` and `410` (for example `403`, `429`, or `5xx`).
Upstream `404` and `410` are forwarded so removed catalog files
do not keep appearing as HTTP 200. Client responses include
`Cache-Control: public, max-age=300`. Cached `cache.put` entries omit
`Cache-Control`.

Immutable version snapshot paths (`packages/<namespace>/<package-id>/versions/<semver>/...`)
keep unbounded edge cache. Client responses include
`Cache-Control: public, max-age=300`; stored cache entries omit `Cache-Control`.

Other file-proxy paths keep unbounded edge cache without worker TTL or client
`Cache-Control`.

## Pkg alias routes

- Incoming paths MUST start with `/pkg/` and use optional query `ref` only (no `/<ref>/pkg/...` in MVP).
- When query `ref` is omitted, the Worker defaults to `main`.
- Two supported families:
  - Version in path: `/pkg/<namespace>/<package-id>/<version>/agents|flows|instructions.json`
  - Short alias: `/pkg/<namespace>/<package-id>/agents|flows/<id>` or `.../instructions.json`
- Short aliases accept optional `?version=<semver>`; when omitted, the worker fetches
  `packages/<namespace>/<package-id>/versions/manifest.json` at `ref` and uses `latest`.
- Rewritten upstream target:
  `packages/<namespace>/<package-id>/versions/<version>/...` (immutable version snapshot).
- File responses use the shared Content-Type normalization rules above (for example
  `.agent.md` → `text/plain; charset=utf-8`).

## Method Policy

- Supported: `GET`
- Unsupported methods return `405 Method Not Allowed`.
- Successful ZIP GETs may insert a download event in D1. That is a GET
  side-effect, not a new HTTP write method.

## Security Boundaries

- Token is only read from Worker environment (`env.GITHUB_TOKEN`).
- Token is never committed in source control or wrangler config.
- D1 `database_id` in `wrangler.toml` is an account identifier, not a secret.
  Forks on another Cloudflare account MUST create their own D1 database and
  replace `database_id`.

## Known Limitations

- File-proxy paths other than catalog files (`packages/index.json`,
  `packages/tree.json`, `packages/*/detail.json`) and versioned snapshot files
  use Cloudflare edge cache without worker-enforced TTL. Catalog files use a
  300-second worker TTL; versioned snapshot files stay unbounded at the edge
  and send client `Cache-Control: max-age=300`. See **Catalog and versioned
  file cache**.
- Download counts are a traffic counter, not anti-fraud. Repeated GETs, crawlers,
  and client retries after HTTP 200 can inflate totals. Direct GitHub Raw
  downloads and CLI local cache hits are not counted.
- `/stats` may lag event inserts by up to 60 seconds (`Cache-Control: max-age=60`).
