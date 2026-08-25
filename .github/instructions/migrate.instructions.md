---
applyTo: "scripts/migrate.sh"
description: "Use for D1 migration helper script updates."
---

# Migrate Script Instructions

- Follow `.github/CONTRIBUTING.md` **Required Workflow** (issue → branch →
  push → draft PR before implementation).
- Keep migrate helper simple and auditable: one Wrangler invocation.
- Apply remote D1 migrations only (`registry-proxy-downloads --remote`).
- Do not add `--local`, extra flags, or parse `wrangler.toml`.
- Avoid adding secrets, inline tokens, or environment dumps.
- Ensure script remains executable.
- Keep `scripts/deploy.sh` deploy-only; do not fold migrations into deploy.
