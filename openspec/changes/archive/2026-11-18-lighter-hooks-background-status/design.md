# Design

## Context

Observed with probe hooks in headless sessions (Claude Code 2.1.326, Windows): hooks start as `claude → bash → bash → node`; a PostToolUse matcher `^(?!(Read|…)$).*` fires for `Bash` and not for `Read`; a Stop issued while a background shell runs carries `background_tasks: [{ id, type: "shell", status: "running", … }]`; when the task finishes, Claude starts a new turn (UserPromptSubmit with a new `prompt_id`) ending with a Stop whose `background_tasks` is empty.

## Decisions

- **Exclusion, not inclusion:** the matcher excludes known read-only tools, so any other tool, including future or MCP tools that may ask for permission, still clears a permission wait. `READ_ONLY_TOOLS` lives in the installer; the hook itself is unchanged for these events.
- **Installer replaces its own entries** (remove by command, then add), so matcher changes reach existing installs and the result stays idempotent.
- **Accepted limitation** (found in review): read-only tools can still ask for permission (paths outside the project); after the developer grants it no event is recorded, so the card stays red until the next recorded event (another tool, a permission, Stop). Rare in practice (reads inside the project need no permission, auto mode asks none) and short-lived; keeping their PostToolUse would undo most of the saving. Documented in README and pinned by a test.
- **Stuck threshold 15 minutes** in the setting default and the view's fallback.
- **Background status:** the hook records `background` = number of `background_tasks` with status `running` on Stop. The fold gives `question` if the agent asks, else `background` when that number is positive, else `finished`. `background` ranks with `working`, uses `charts.blue`, and the card reads "working in background · N task(s) · time". It is not subject to the stuck rule; the session's next event, its end, or its process ending clears it.
