# Architecture

## Goal

Proxy registry files from GitHub Raw through Cloudflare Workers with caching and optional upstream authentication.

## Request Lifecycle

1. Client requests a registry path on workers.dev.
2. Worker normalizes the path and builds the upstream URL.
3. Worker checks `caches.default` by resolved upstream URL.
4. On miss, Worker fetches GitHub Raw with optional token auth.
5. Worker returns upstream response and caches successful results.

## Components

- Worker runtime: request parsing, mapping, fetch, response handling.
- Cloudflare edge cache: response reuse for repeated GET requests.
- Cloudflare secret: `GITHUB_TOKEN` for authenticated GitHub Raw access.

## Path Mapping

- Incoming path: `/main/packages/index.json`
- Upstream base: `https://raw.githubusercontent.com/agents-repo/registry`
- Resolved upstream: `https://raw.githubusercontent.com/agents-repo/registry/main/packages/index.json`

## Method Policy

- Supported: `GET`
- Unsupported methods return `405 Method Not Allowed`.

## Security Boundaries

- Token is only read from Worker environment (`env.GITHUB_TOKEN`).
- Token is never committed in source control or wrangler config.

## Known Limitations

- No custom cache TTL controls in current version.
- No write operations are supported.
