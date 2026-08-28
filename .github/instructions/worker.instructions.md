---
applyTo: "src/worker.js"
description: "Use for Worker proxy implementation and updates."
---

# Worker Instructions

- Follow `.github/CONTRIBUTING.md` **Required Workflow** (issue → branch →
  push → draft PR before implementation).
- Before routing or cache changes, read [docs/proxy-vs-registry.md](../../docs/proxy-vs-registry.md)
  and upstream registry specs in
  [docs/AI_GUIDELINES.md](../../docs/AI_GUIDELINES.md#registry-spec-dependencies).
- After edits, run checks in
  [docs/local-validation-without-cloudflare.md](../../docs/local-validation-without-cloudflare.md).
- Keep request handling read-only by default.
- Preserve intentional path segments and map to configured upstream base URL.
- Read `GITHUB_TOKEN` from environment only.
- Implement cache-first behavior with `caches.default`.
- Preserve upstream status/body where possible.
- Avoid introducing behavior not requested by issue scope.
