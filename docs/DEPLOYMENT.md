# Deployment

Production origin is `https://registry.agents-repo.org` (Custom Domain on the
Agents Repo Cloudflare account, `account_id` in `wrangler.toml`). Do not treat
any `*.workers.dev` URL as the catalog origin.

`wrangler.toml` is the source of truth for Workers Logs, `workers_dev`, and
preview URLs. Dashboard-only toggles are overwritten on the next
`wrangler deploy`. This Worker pins `workers_dev = false` and
`preview_urls = false`, so Agents Repo `registry-proxy` must not expose a
`*.workers.dev` or version-preview route after deploy. Wrangler may still print
a default `workers.dev` URL on deploy — ignore it in docs and consumer defaults.

The personal `https://registry-proxy.maiconfz.workers.dev` URL remains live for
existing clients. Do not redirect or decommission it as part of this Worker
deploy. That Worker is on a different Cloudflare account and is not controlled
by this repository's `wrangler.toml`.

There is no staging Worker environment. Live production is
`https://registry.agents-repo.org` only.

## Prerequisites

- Access to the **Agents Repo** Cloudflare account (`3a689fa9c8e3226495626475e5180895`).
- Wrangler CLI 4.107+ (this repository uses `npx --ignore-scripts wrangler`
  after `npm ci` so deploy does not run on-demand package lifecycle scripts).
- Authenticated Wrangler **profile** bound to this repository (see below).
- Optional but recommended: GitHub PAT with read access to `agents-repo/registry`.

Do **not** run `wrangler logout` if a personal Cloudflare login still owns the
legacy `maiconfz.workers.dev` Worker. Use [Wrangler auth
profiles](https://developers.cloudflare.com/workers/wrangler/profiles/) so the
default login can stay personal.

## Wrangler auth profile (Agents Repo)

Wrangler’s default login is one session. A named profile bound to this clone
targets Agents Repo without dropping the personal session.

```bash
npx wrangler auth create agents-repo
npx wrangler auth activate agents-repo "$(pwd)"
npx wrangler auth list
npx wrangler whoami
```

`whoami` from this directory must list account `3a689fa9c8e3226495626475e5180895`.
If it only lists a personal account, re-run `npx wrangler auth create agents-repo`
and stop. Do not deploy until this gate passes.

`account_id` in `wrangler.toml` is the failsafe: Wrangler must not fall back to
a personal account even if the profile can reach both.

One-off override: `npx --ignore-scripts wrangler deploy --profile agents-repo`. `--profile` is
not supported on `login`, `logout`, `whoami`, or `auth`.

## Configure Secret (Optional, Recommended)

Store the token in Cloudflare, never in repository files. Run from this
repository directory so the secret lands on the Agents Repo Worker:

```bash
npx wrangler secret put GITHUB_TOKEN
```

The Worker also works without this secret for public upstream content, but
authenticated requests are more resilient to upstream rate limits.

Verify the secret is configured for the deployed worker (does not print the
token):

```bash
npx wrangler secret list
```

Expect `GITHUB_TOKEN` in the list for Worker name `registry-proxy`. If `secret
put` errors because the script does not exist yet, deploy first, then retry.

## D1 download counts

The Worker binds D1 as `DOWNLOADS` (`registry-proxy-downloads`,
`database_id` in `wrangler.toml`). Bindings belong in `wrangler.toml`;
dashboard-only bindings are overwritten on the next `wrangler deploy`.

Create the database once (already done on the Agents Repo account):

```bash
npx wrangler d1 create registry-proxy-downloads
```

Copy the printed `database_id` into `wrangler.toml`. Use binding name
`DOWNLOADS`, not Wrangler’s suggested `registry_proxy_downloads`.

Apply migrations **before** deploying Worker code that reads the table.
`wrangler deploy` does **not** apply D1 migrations, and `scripts/deploy.sh`
stays deploy-only:

```bash
npx wrangler d1 migrations apply registry-proxy-downloads --remote
./scripts/deploy.sh
```

Migration `0002` **drops** `download_counts` and creates `download_events`.
That wipes undated all-time totals from v2.2.0. Apply `0002` and deploy the new
Worker immediately; old UPSERT SQL will not match the new table.

If you deploy first, ZIP downloads still succeed (insert errors are
swallowed). `/stats` returns HTTP 503 until the D1 binding and migration are
in place.

Dashboard check after deploy: Workers → `registry-proxy` → Bindings →
`DOWNLOADS` → D1 `registry-proxy-downloads`.

## Deploy

Confirm `wrangler.toml` includes `account_id`, the Custom Domain route for
`registry.agents-repo.org`, `workers_dev = false`, `preview_urls = false`,
`upload_source_maps = true`, `[observability]` / `[observability.logs]`
enabled with `invocation_logs = true`, and `[[d1_databases]]` binding
`DOWNLOADS`. Do not pre-create a `registry` DNS record; Wrangler creates it on
deploy.

```bash
./scripts/deploy.sh
```

or

```bash
npx --ignore-scripts wrangler deploy
```

Confirm the command targets `3a689fa9c8e3226495626475e5180895`. Ignore any
printed `*.workers.dev` URL. In the dashboard: Agents Repo → Workers →
`registry-proxy` → Domains should show `registry.agents-repo.org` and must not
list a workers.dev or preview route for this Worker. Observability should show
invocation logs for `GET https://registry.agents-repo.org/...` after traffic.

## Validate

```bash
curl -i "https://registry.agents-repo.org/packages/index.json"
curl -i "https://registry.agents-repo.org/packages/index.json?ref=v2.x"
curl -i "https://registry.agents-repo.org/pkg/agents-repo/hello-agent/1.0.1/agents/hello-agent.agent.md?ref=v2.x"
curl -i "https://registry.agents-repo.org/tags"
curl -sI "https://registry.agents-repo.org/packages/agents-repo/hello-agent/versions/1.0.0/1.0.0-cursor.zip?ref=v2.x"
curl -s "https://registry.agents-repo.org/stats/packages/agents-repo/hello-agent"
curl -s "https://registry.agents-repo.org/stats"
curl -s "https://registry.agents-repo.org/stats?period=365d"
```

Confirm HTTP 200, `Access-Control-Allow-Origin: *`, and `.md` responses include
`Content-Type: text/plain; charset=utf-8` where applicable. Repeat one request
to confirm cache reuse. After a ZIP `200`, `/stats` should show `downloads >= 1`
for that package (or the previous total plus one), and the matching rolling
window field should move when the download is recent.

Also confirm `https://agents-repo.org/` is still the webapp, and
`https://registry-proxy.maiconfz.workers.dev/packages/index.json?ref=v2.x` still
returns 200. The personal workers.dev Worker is a different Cloudflare account
and does not share this D1 database.

The webapp uses `/tags` for version-line alias resolution (`v1.x`, `v1.2.x`).
Deploy this endpoint before merging dependent webapp changes.

## Rollback or Redeploy

- Re-run `npx --ignore-scripts wrangler deploy` with corrected source from this bound directory.
- Verify the same Custom Domain endpoint set after each deployment.
- Do not delete the personal `maiconfz.workers.dev` Worker.
- Reverting `workers_dev = false` in `wrangler.toml` can re-enable the Agents
  Repo workers.dev route on the next deploy.
