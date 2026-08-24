---
marp: true
theme: agents-repo
paginate: true
---

<!-- markdownlint-disable-file MD025 -->

<!-- _class: title -->

# registry-proxy architecture

Cached, read-only access to agents-repo/registry

---

# Goal

Cloudflare Worker that proxies **only** `agents-repo/registry` files.

Callers (webapp, CLI) avoid hitting GitHub Raw on every request. HTTP is
**GET-only** unless an issue explicitly changes method policy. Successful ZIP
GETs increment D1 as a side-effect.

---

# Request lifecycle

1. Client hits `https://registry.agents-repo.org` (`/<ref>/<path>`, `/<path>`, `/pkg/...`, `/tags`, or `/stats`)
2. Worker maps to GitHub Raw or Contents API (stats does not proxy)
3. Check `caches.default` by resolved upstream URL
4. On miss, fetch upstream
5. Cache successful 200s and return
6. HTTP 200 versioned ZIPs increment D1 in `waitUntil`

Details: `docs/ARCHITECTURE.md`.

---

# `caches.default`

Cloudflare edge cache. Cache-first for repeated GETs.

Catalog files (`index.json`, `tree.json`, `detail.json`) and `/tags` use a
**300s** worker TTL. Version snapshot paths stay unbounded at the edge.

---

# Path mapping (no token)

Default upstream:

`https://raw.githubusercontent.com/agents-repo/registry/<ref>/<path>`

Example: `/main/packages/index.json` → that file on GitHub Raw.

Omitted ref defaults to `main`.

---

# Path mapping (with token)

When `GITHUB_TOKEN` is present:

GitHub Contents API + `Accept: application/vnd.github.raw`

Better rate-limit behavior. Token comes from **Worker env only**.

---

# `GET /tags`

Root meta route (not `/main/tags` — that is a file path).

Aggregates GitHub tags API pages into `[{ "name": "v1.2.0" }, ...]`.

Webapp uses this for version-line aliases such as `v2.x`. TTL: 300 seconds.

---

# `GET /stats`

Root meta route (not `/main/stats` — that is a file path). Prefix like `/pkg/`.

- `/stats` — package totals from D1
- `/stats/packages/<namespace>/<package-id>` — per-artifact rows
- Increments on HTTP 200 versioned ZIP GETs (cache hit and miss)
- Missing D1: ZIP still 200; `/stats` is 503

---

# GET-only policy

Supported: `GET`.

Anything else: `405 Method Not Allowed`.

Do not add HTTP write methods without an explicit issue. D1 increments on ZIP
GET 200 are a documented side-effect, not a new method.

---

# Secrets

```bash
wrangler secret put GITHUB_TOKEN
```

Never commit tokens or put them in `wrangler.toml`.
`wrangler secret list` confirms the name without printing the value.

---

# Consumers

- **webapp** production catalog fetch
- **CLI** default org `agents.json` / proxy URL
- Direct curls for debugging (`docs/DEPLOYMENT.md`)

Default catalog URL includes `?ref=v2.x`.

---

# Content-Type

Worker normalizes types from the **path extension** on HTTP 200
(for example `.json` → `application/json`, `.md` → `text/plain`).

Unmapped + `vnd.github.raw` → `application/octet-stream`.

---

# Deploy

Apply D1 migrations first (`wrangler deploy` does not):

```bash
npx wrangler d1 migrations apply registry-proxy-downloads --remote
./scripts/deploy.sh
```

Then curl `index.json` twice to see cache reuse. See `docs/DEPLOYMENT.md`.

---

# Not this deck

CLI user commands → cli slides.
Package authoring → registry slides.

---

# Links

- `docs/ARCHITECTURE.md`
- `docs/DEPLOYMENT.md`
- `docs/AI_GUIDELINES.md`
- Org ecosystem PDF in `.github` `docs/slides/`

---

<!-- _class: closing -->

# Remember

Read-only HTTP (GET). GitHub Raw or Contents API. Cache hit on repeat GET.
ZIP 200s increment D1. Token never in the repo.
