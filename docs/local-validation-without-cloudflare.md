# Local validation without Cloudflare credentials

Use these checks when you cannot run `wrangler` deploy or D1 migrations locally.

## Always available

```bash
npm run env:check
npm run lint:all
npm run check:secrets
npm run test
npm run sync:ide-instructions -- --check
```

CI on pull requests:

- **`pr-baseline.yml`** (every PR): `npm run env:check`, `npm run lint:all`,
  `npm run sync:ide-instructions -- --check`, `npm run test`, and
  `npm run check:secrets`. Path-filtered extras: `npm run slides:check` when
  slide sources change; `npm run agents:ci` when registry workflow packages change.
- **`pr-worker-validation.yml`** (when `src/**`, `scripts/**`, `wrangler.toml`,
  `docs/**`, or `.github/**` change): `npm run env:check`, `npm run lint:all`,
  deploy/migrate script policy checks, and `npm run check:secrets`. It does not
  run unit tests — rely on `pr-baseline.yml` for `npm run test`.

## Worker routing changes

After editing `src/worker.js`, run:

```bash
npm run test
```

Tests include upstream URL mapping assertions. For live endpoint verification
(cache headers, status codes), you need Cloudflare credentials and
[docs/DEPLOYMENT.md](DEPLOYMENT.md) — out of scope for default agent handoff.

## Registry spec dependencies

Path and ZIP semantics are defined in upstream registry `specs/`. See
[docs/AI_GUIDELINES.md](AI_GUIDELINES.md#registry-spec-dependencies) and
[docs/proxy-vs-registry.md](proxy-vs-registry.md).
