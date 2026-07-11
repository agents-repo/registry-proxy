---
applyTo: "scripts/deploy.sh"
description: "Use for deployment helper script updates."
---

# Release Script Instructions

- Follow `.github/CONTRIBUTING.md` **Required Workflow** (issue → branch →
  push → draft PR before implementation).
- Keep deploy helper simple and auditable.
- Use Wrangler deploy command as primary action.
- Avoid adding secrets, inline tokens, or environment dumps.
- Ensure script remains executable.
