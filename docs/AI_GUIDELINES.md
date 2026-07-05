# AI Guidelines

## Objective

Keep AI-assisted implementation predictable, safe, and easy to review.

## Before You Implement

1. Read [.github/copilot-instructions.md](../.github/copilot-instructions.md).
2. Read [.cursor/rules/agents-registry-proxy.mdc](../.cursor/rules/agents-registry-proxy.mdc).
3. Read [.github/CONTRIBUTING.md](../.github/CONTRIBUTING.md).
4. Read [docs/DEPLOYMENT.md](DEPLOYMENT.md) and [CONTRIBUTING.md](../CONTRIBUTING.md).
5. Confirm scope from the linked issue.

## Working Rules

- Do not commit secrets.
- Keep changes scoped to issue requirements.
- Prefer small, reviewable commits.
- Update docs when behavior changes.
- Do not merge to or push directly to `main`; open draft PRs and hand off for
  human maintainer review.

After editing `.github/copilot-instructions.md`, regenerate the Cursor rule:

```bash
npm run sync:cursor-rules
```

## Verification Evidence

For each task, provide:

- Commands run.
- Key outputs and observed behavior.
- Any known limitation or follow-up.

Required command baseline:

- `npm run env:check`
- `npm run lint:all`
- `npm run check:secrets`
- `npm run test`

## Handoff Checklist

- Acceptance criteria status (pass/fail).
- Linked issue and PR.
- Security checks completed.
