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

Callers (webapp, CLI) avoid hitting GitHub Raw on every request. The Worker is
**read-only** unless an issue explicitly changes method policy.

---

# Request lifecycle

1. Client hits `https://registry.agents-repo.org` (`/<ref>/<path>`, `/<path>`, or `/pkg/...`)
2. Worker maps to GitHub Raw or Contents API
3. Check `caches.default` by resolved upstream URL
4. On miss, fetch upstream
5. Cache successful 200s and return

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

# GET-only policy

Supported: `GET`.

Anything else: `405 Method Not Allowed`.

Do not add writes without an explicit issue.

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

```bash
./scripts/deploy.sh
# or
npx --ignore-scripts wrangler deploy
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

Read-only Worker. GitHub Raw or Contents API. Cache hit on repeat GET.
Token never in the repo.
