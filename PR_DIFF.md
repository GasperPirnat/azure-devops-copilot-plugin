# Pull request Files changed view

This local modification adds **Overview / Files changed** to the Azure DevOps PR canvas in the GitHub Copilot app. Open **Files changed**, then expand a file. Select **Side by side** or **Unified**, filter by path, and expand omitted context as needed. Refresh the PR using the existing canvas refresh control to load a new comparison.

## Comparison semantics

The file list uses the latest PR iteration by numeric ID, with `$compareTo=0`. File content is read at that iteration's `commonRefCommit` and `sourceRefCommit`, not mutable branch tips or the local working tree. This matches Azure DevOps' all-changes PR comparison. The API documents zero as the comparison against the common commit of the source and target branches: [Microsoft REST reference](https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-iteration-changes/get?view=azure-devops-rest-7.1).

The iteration ID travels with every file request, so a new push cannot silently switch an already-open comparison to a different iteration. A file request resolves its path and commits from Azure DevOps; clients do not supply arbitrary repository paths or commits. Existing canvas nonce and connection validation apply to both new routes.

Added and deleted files have an intentionally empty missing side. Renames use the original path for the base content. Fork source content comes from the fork repository and project. A missing existing file or failed request remains an error with Retry; it never becomes a fabricated addition/deletion.

## Local development and installation

The checkout includes all original plugin files and the changes. It is based on upstream commit `8f30ba3210758239be19e2143943e0830f07601a` (plugin version 0.1.56). No GitHub fork has been published and the installed plugin has not been replaced.

For a CLI development session, the installed Copilot CLI supports loading a local plugin with `--plugin-dir`:

```powershell
copilot --plugin-dir 'C:\Users\GašperPirnat\Documents\Codex\2026-09-21\is-it-exp\outputs\azure-devops-copilot-plugin'
```

For installation in the desktop app, publish these changes in your own fork, then use **Customize → Plugins**, add the fork's Git URL as a custom marketplace, and install its Azure DevOps plugin. The repository already includes its marketplace and plugin manifests. Use the custom copy in place of the upstream copy, then reopen the Azure DevOps canvas. See [GitHub's desktop customization instructions](https://docs.github.com/en/copilot/how-tos/github-copilot-app/customize-github-copilot-app#adding-plugins).

If distributing the fork, give its marketplace/plugin a distinct identity or version to distinguish it from upstream updates. Installation in a live desktop session has not been verified here.

## Validation

From `extensions/azure-devops`:

```powershell
npm ci --ignore-scripts
npm test
```

Result: **432 passing, 0 failing, 2 skipped, 1 existing TODO** (435 total). The TODO concerns Markdown underscore rendering; the skipped tests concern disabled review voting.

Tests cover pagination, comparison commits, a push after listing, additions/deletions/renames, forks, binary data, missing files, response byte limits, empty files and final newlines, complete large-change fallback, lazy loading, retries, safe code rendering, file filtering, layout switching, unchanged-line expansion, API nonce/connection validation, and integration through the real app view. Randomized reconstruction checks confirm diff rows reproduce both inputs.

The upstream test harness assumed Agency authentication was enabled, while its distributed feature flag is disabled. The server tests now enable only that flag inside their isolated VM, and the UI assertion honors the distribution flag. Runtime authentication flags remain unchanged.

A browser preview using the actual UI modules and fictional fixture data was inspected. Live Azure DevOps authentication and a real PR comparison still need a smoke test after installation.

## Limits

- Binary files and non-blob Git objects show an explanatory message; image comparison is not implemented.
- Text versions over 1 MiB, or over 12,000 combined lines, are not rendered inline. JSON responses are also bounded while streaming. Use **Open in Azure DevOps** for these files.
- If the existing Myers algorithm exceeds its 400-edit budget, the middle region is displayed as a clearly labelled full replacement. All lines remain available, but alignment and addition/deletion counts may differ from a minimal diff.
- Syntax highlighting, new inline review comments, iteration selection, and whitespace-ignore controls are not included. Existing PR discussion remains in Overview.
- This adds a remote PR canvas view; it does not change the app's native local Changes panel or expose a new MCP tool to the agent.

## Code map

- `canvas-server.mjs`: comparison snapshot, file content retrieval, bounded full-file diff, GET changes routes.
- `ui/pull-request-files.mjs`: lazy file list, diff layouts, filtering, context expansion, retries.
- `ui/pull-request-view.mjs` and `ui/app.mjs`: PR navigation and connection-aware requests.
- `ui/styles.css`: diff layout and addition/deletion styles.
- `canvas-server.test.mjs`, `pull-request-files.test.mjs`, `tabs.test.mjs`: API, DOM, and app integration coverage.
