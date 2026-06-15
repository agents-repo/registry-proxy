# Deployment

## Prerequisites

- Cloudflare account with Workers access.
- Wrangler CLI installed.
- Authenticated Wrangler session.
- Optional but recommended: GitHub PAT with read-only permissions for upstream access.

## Configure Secret (Optional, Recommended)

Store token in Cloudflare, never in repository files:

```bash
wrangler secret put GITHUB_TOKEN
```

The Worker also works without this secret for public upstream content, but authenticated requests are more resilient to upstream rate limits.

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
curl -i "https://<worker>.workers.dev/main/packages/index.json"
curl -i "https://<worker>.workers.dev/packages/index.json?ref=main"
curl -i "https://<worker>.workers.dev/tags"
```

Repeat one request to confirm cache reuse behavior.

The webapp uses `/tags` for version-line alias resolution (`v1.x`, `v1.2.x`). Deploy this endpoint before merging dependent webapp changes.

## Rollback or Redeploy

- Re-run `wrangler deploy` with corrected source.
- Verify same endpoint set after each deployment.
