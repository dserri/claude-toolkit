# Design

## Context

See proposal.md. The status hook (`status/status-hook.mjs`) runs asynchronously, and Claude Code delivers an async hook's `additionalContext` only on the next turn, so the instruction needs its own synchronous hook. Machine-scoped enablement already exists (`enabledFolders` in the extension's `globalState`).

## Goals / Non-Goals

**Goals:** the session view, the status line and an automatic Claude tab without the coordinator or the plugin.

**Non-Goals:** a second extension; publishing; changing the coordinator.

## Decisions

- **`status/turn-status-hook.mjs`**, synchronous SessionStart hook without matcher (start, resume, clear and compact all lose or start context): prints the instruction as plain text, which Claude Code adds to the context; skips `CLAUDE_CODE_ENTRYPOINT=sdk*` so SDD's reviewer output stays untouched; never fails (exit 0, nothing on error). One Node start per session start, not per tool call.
- **Installer** adds and removes this entry with the others; existing installs gain it on the next `node status/install.mjs`. The coordinator and worker prompts keep their own copy, so coordinator machines without the status hooks still get the line.
- **Plain mode records** `plainFolders` in `globalState`, next to `enabledFolders`, with the same folder keys. Start logic: coordinator if enabled, else plain if recorded, else nothing. Plain tab: name `claude`, session `<prefix>-claude` (`core.plainArgs` returns only `--name`), first editor column with focus, registered in the window registry like the others.
- **Stop** removes the folder from both records.

## Risks / Trade-offs

- [Every interactive session on the machine gets one more instruction] → the developer's decision; uninstall removes it.
- [A plain tab's session is not resumed after a restart] → plain mode is a convenience start; resuming stays manual, like any hand-started session.
