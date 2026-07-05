# Pull Request

## Summary

Describe the change and why it is needed.

## Change Type

- [ ] Feature
- [ ] Bug fix
- [ ] Documentation
- [ ] Tooling or workflow
- [ ] Maintenance

## Scope

List affected paths:

- [ ] src/
- [ ] scripts/
- [ ] docs/
- [ ] .github/
- [ ] wrangler.toml
- [ ] Root config files

## Validation Checklist

- [ ] Runtime check passes (`npm run env:check`).
- [ ] Lint checks pass (`npm run lint:all`).
- [ ] Secret scan passes (`npm run check:secrets`).
- [ ] Test command passes (`npm run test`).
- [ ] Documentation remains deterministic and clear.
- [ ] PR follows `.github/pull_request_template.md` sections.
- [ ] A tracking issue was opened before implementation.
- [ ] The branch name follows `<prefix>/<issue-number>-<slug>`.
- [ ] This pull request was created as a draft (`gh pr create --draft` or UI
  draft option).
- [ ] This draft PR was opened before implementation commits (or documents
  why not).
- [ ] `## Related Issues` includes `Closes #<issue-number>`.
- [ ] Issue form was used or equivalent required fields were included.
- [ ] Merge to `main` is for human maintainers only; agents and automation
  must not merge this PR or push directly to `main`.
- [ ] A human developer marked this PR ready for review after validation (not
  agents or automation).

## Validation Evidence

- Commands run:
- Key outputs:
- Endpoint checks:

## Risk and Rollback

- Risk level: low / medium / high
- Rollback plan:

## Related Issues

Include `Closes #<issue-number>` for the tracking issue this PR closes.
