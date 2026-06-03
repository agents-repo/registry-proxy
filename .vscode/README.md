# VS Code Workspace Settings Policy

This folder stores shared VS Code workspace configuration.

## Goals

- Keep team behavior consistent across Linux, macOS, and Windows.
- Keep formatting and linting authority in repository tooling.
- Allow personal preferences through user-level settings.

## Scope Model

### Required Shared Settings (Tracked)

Defined in settings.json and intended for all contributors:

- LF line endings
- UTF-8 encoding
- Final newline and trailing-whitespace cleanup
- Stable indentation defaults (2 spaces, no auto-detection)
- 80-column ruler and markdown wrap at 80
- Search exclusions for large dependency directories

### Personal Settings (Not Tracked)

Use user settings for personal workflow preferences, such as:

- Theme and font
- Minimap and explorer UI options
- Terminal profile and shell integration
- Local extension experiments

Do not add personal preferences to workspace settings.

## Formatter and Lint Authority

Formatting and lint behavior is defined by repository tooling:

- JavaScript lint: eslint.config.mjs
- Markdown lint: .markdownlint-cli2.yaml
- Commands: npm run lint:js and npm run lint:md

The shared workspace default uses 2-space indentation, while lint and format
enforcement remain controlled by repository scripts.

Avoid forcing a global default formatter in workspace settings unless a
repository-wide decision is made and documented.

## Extension Recommendations

Recommended extensions are tracked in extensions.json.

Guidelines:

- Keep recommendations minimal and repository-relevant.
- Prefer linting and authoring support over personal productivity tools.
- Avoid recommending opinionated theme or UI extensions.
- Use personal extension preferences at user scope.

## Environment Patterns

### Linux, macOS, Windows

Use the same shared workspace settings for all platforms.

### Remote Development (Codespaces/containers)

Keep workspace settings minimal and stable. If remote-only behavior is needed,
prefer remote environment configuration rather than broad workspace overrides.

## Change Management

When changing workspace settings:

1. Keep changes minimal and team-oriented.
2. Explain rationale in the pull request.
3. Include .vscode/ in PR scope checklist.
