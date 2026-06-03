---
applyTo: "src/worker.js"
description: "Use for Worker proxy implementation and updates."
---

# Worker Instructions

- Keep request handling read-only by default.
- Preserve intentional path segments and map to configured upstream base URL.
- Read `GITHUB_TOKEN` from environment only.
- Implement cache-first behavior with `caches.default`.
- Preserve upstream status/body where possible.
- Avoid introducing behavior not requested by issue scope.
