# AGENTS.md

## Cursor Cloud specific instructions

Standard commands and workflow live in `README.md` and
`.github/copilot-instructions.md` (mirrored to
`.cursor/rules/agents-registry-proxy.mdc`). Notes below are non-obvious
environment caveats for this Cloud VM.

### Toolchain (shared across the agents-repo repos)

- Node and npm are provided through `nvm` + Corepack. The Cloud startup/update
  script installs Node `24.15.0` and `24.18.0` and activates Corepack
  `npm@12.0.1`, so you normally do not reinstall them.
- Gotcha: `/exec-daemon/node` (Node 22) sits ahead of `nvm` on `PATH`, so a bare
  `node` resolves to Node 22 and `npm run env:check` (exact `24.15.0`) fails.
  Prepend this repo's pinned Node bin before running scripts:

  ```bash
  export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"
  export PATH="$HOME/.nvm/versions/node/v$(tr -d ' \n\r' < .nvmrc)/bin:$PATH"; hash -r
  ```

  After this, `node -v` = `v24.15.0` and `npm -v` = `12.0.1`.

### This repo (Cloudflare Worker proxy)

- Local validation is `npm run test` (node:test, 35 tests) plus
  `npm run lint:all` and `npm run check:secrets`. The unit tests exercise the
  `fetch` handler and edge-cache behavior directly.
- `wrangler dev` currently fails under the installed Wrangler (4.x): `src/worker.js`
  publishes named exports used by the tests (e.g. `TAGS_API_BASE_URL`), which
  this Wrangler rejects as invalid Worker entrypoints
  ("Incorrect type for map entry"). Use the test suite for local verification;
  deployment is `wrangler deploy` and requires Cloudflare auth.
