# AI Guidelines

## Objective

Keep AI-assisted implementation predictable, safe, and easy to review.

## Before You Implement

1. Read [.github/copilot-instructions.md](../.github/copilot-instructions.md).
2. Read [.cursor/rules/agents-registry-proxy.mdc](../.cursor/rules/agents-registry-proxy.mdc).
3. Read [.github/CONTRIBUTING.md](../.github/CONTRIBUTING.md).
4. Read [docs/CLI_WORKFLOW.md](CLI_WORKFLOW.md) for the required issue → branch →
   push → draft PR sequence.
5. Read [docs/DEPLOYMENT.md](DEPLOYMENT.md) and [CONTRIBUTING.md](../CONTRIBUTING.md).
6. Confirm scope from the linked issue.

## Working Rules

- Follow `.github/CONTRIBUTING.md` **Required Workflow** before implementation.
- Do not commit secrets.
- Keep changes scoped to issue requirements.
- Prefer small, reviewable commits.
- Update docs when behavior changes.
- Do not merge to or push directly to `main`; open a draft PR with
  `gh pr create --draft` before implementation commits. In `## Related Issues`,
  include `Closes #<issue-number>` for standard tasks, or follow the
  security-advisory format defined in the **Workflow exceptions** section of
  `.github/CONTRIBUTING.md` when applicable. Push a scaffolding commit first if needed (see
  `.github/CONTRIBUTING.md`). After validation, the developer manually marks the
  pull request ready for review; agents must not mark pull requests ready for
  review.

After editing `.github/copilot-instructions.md`, regenerate IDE instruction mirrors:

```bash
npm run sync:ide-instructions
```

## Verification Evidence

For each task, provide:

- Commands run.
- Key outputs and observed behavior.
- Any known limitation or follow-up.

Required command baseline:

- `npm run env:check`
- `npm run lint:all` (includes `lint:workflows` / actionlint on `.github/workflows/`)
- `npm run check:secrets`
- `npm run test`

For worker routing or caching changes, also run the endpoint and cache checks
listed in `.github/copilot-instructions.md` **Required Validation** (in addition
to the command baseline above).

## Pre-ready handoff

Before agent handoff (while the pull request remains a **draft**), follow the
organization
[Pre-ready agent handoff](https://github.com/agents-repo/.github/blob/main/CONTRIBUTING.md#pre-ready-agent-handoff):

- read exemplar code in the same area before editing
- run the verification commands above (and endpoint/cache checks when applicable)
- self-review correctness, security, and docs alignment
- update the draft PR description with validation evidence and out-of-scope items

Agents MUST NOT mark pull requests ready for review.

## Handoff Checklist

- Acceptance criteria status (pass/fail).
- Linked issue and PR.
- Security checks completed.
