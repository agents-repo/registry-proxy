# Contributing

## Workflow

1. Create or select a GitHub issue that defines scope and acceptance criteria.
2. Create a branch tied to the issue context.
3. Implement and validate locally.
4. Open a PR linked to the issue and include evidence for validation.
5. Merge after review approval.

## Branch Naming

Use one of the following forms:

- `feat/<short-name>-<issue-number>`
- `fix/<short-name>-<issue-number>`
- `docs/<short-name>-<issue-number>`
- `chore/<short-name>-<issue-number>`

## Commit Guidance

- Keep commits focused and small.
- Reference issue number in commit messages when possible.
- Do not include secrets or credentials in commits.

## Pull Request Requirements

- Link the issue in the PR body (`Fixes #<issue-number>`).
- Include test and validation evidence.
- Document behavior changes in README/docs when needed.
- Confirm secret hygiene checks pass.

## Reviewer Checklist

- Scope matches linked issue.
- Security requirements are respected (no tokens in source or config).
- Worker behavior and path mapping are correct.
- Docs and templates stay consistent.
