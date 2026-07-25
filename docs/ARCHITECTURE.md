# Architecture

## Goal

Proxy registry files through Cloudflare Workers with caching, using GitHub Raw by default and the GitHub Contents API for authenticated upstream access.

## Request Lifecycle

1. Client requests a registry path on workers.dev, or `GET /tags` for tag listing.
2. Worker normalizes the path and builds the upstream URL (file content or tags API).
3. Worker checks `caches.default` by resolved upstream URL.
4. On miss, Worker fetches GitHub Raw when no token is present, or GitHub Contents API with `Accept: application/vnd.github.raw` when `GITHUB_TOKEN` is present. Tag listing always uses the GitHub tags API with optional token auth.
5. Worker returns upstream response and caches successful results.

## Components

- Worker runtime: request parsing, mapping, fetch, response handling.
- Cloudflare edge cache: response reuse for repeated GET requests.
- Cloudflare secret: `GITHUB_TOKEN` for authenticated GitHub Contents API and tags API access.

## Path Mapping

- Incoming path: `/main/packages/index.json`
- Upstream base: `https://raw.githubusercontent.com/agents-repo/registry`
- Resolved upstream: `https://raw.githubusercontent.com/agents-repo/registry/main/packages/index.json`
- Authenticated upstream (when token exists): `https://api.github.com/repos/agents-repo/registry/contents/packages/index.json?ref=main`

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

## Method Policy

- Supported: `GET`
- Unsupported methods return `405 Method Not Allowed`.

## Security Boundaries

- Token is only read from Worker environment (`env.GITHUB_TOKEN`).
- Token is never committed in source control or wrangler config.

## Known Limitations

- File proxy responses use Cloudflare edge cache without worker-enforced TTL (tags listing is the exception; see **Tags Listing**).
- No write operations are supported.
