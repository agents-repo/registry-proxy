# Deployment

## Prerequisites

- Cloudflare account with Workers access.
- Wrangler CLI installed.
- Authenticated Wrangler session.
- GitHub PAT with read-only permissions for upstream access.

## Configure Secret

Store token in Cloudflare, never in repository files:

```bash
wrangler secret put GITHUB_TOKEN
```

Optional upstream override can be set in Worker environment as `UPSTREAM_BASE_URL` if required.

## Deploy

```bash
./scripts/deploy.sh
```

or

```bash
wrangler deploy
```

Capture the generated workers.dev URL.

## Validate

```bash
curl -i "https://<worker>.workers.dev/packages/index.json"
curl -i "https://<worker>.workers.dev/packages//manifest.json"
```

Repeat one request to confirm cache reuse behavior.

## Rollback or Redeploy

- Re-run `wrangler deploy` with corrected source.
- Verify same endpoint set after each deployment.
