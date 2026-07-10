# Pull Request

## Summary

Describe the change and why it is needed.

## Related Issues

`Closes #<issue-number>`

Replace this line with an unbackticked `Closes #<number>` so GitHub links the
issue.

For standard tasks, use `Closes #<issue-number>`. For security vulnerabilities
without a public tracking issue, reference the advisory identifier (for example
`GHSA-...`) and coordinate linkage with maintainers per the
[Workflow exceptions](https://github.com/agents-repo/.github/blob/main/CONTRIBUTING.md#workflow-exceptions)
section of the organization CONTRIBUTING guide.

## Workflow Checklist

- [ ] A tracking issue was opened before implementation.
- [ ] The branch name follows `<prefix>/<issue-number>-<slug>`.
- [ ] This pull request was created as a draft (`gh pr create --draft` or UI
  draft option).
- [ ] This draft PR was opened before implementation commits (or it documents
  why not).
- [ ] `## Related Issues` includes a tracking reference (`Closes #<issue-number>`
  or a security-advisory identifier per the
  [Workflow exceptions](https://github.com/agents-repo/.github/blob/main/CONTRIBUTING.md#workflow-exceptions)
  section of the organization CONTRIBUTING guide).
- [ ] Issue form was used or equivalent required fields were included.
- [ ] Merge to `main` is for human maintainers only; agents and automation
  must not merge this PR or push directly to `main`.
- [ ] A human developer marked this PR ready for review after validation (not
  agents or automation).

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

## Validation Evidence

- Commands run:
- Key outputs:
- Endpoint checks:

## Risk and Rollback

- Risk level: low / medium / high
- Rollback plan:
