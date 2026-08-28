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

`pr-baseline.yml` runs `npm run test` on every pull request. The path-scoped
`pr-worker-validation.yml` workflow focuses on lint and deploy/migrate script
policy; rely on baseline for unit test coverage unless you add tests there
explicitly.

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
