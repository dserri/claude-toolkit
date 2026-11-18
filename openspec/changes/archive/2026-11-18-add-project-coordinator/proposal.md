# Proposal

## Why

Every morning the developer opens VS Code, opens three or four terminals, starts Claude in each, renames every session to its job, tells one of them it is the coordinator and what to achieve, and runs `/sdd collab` by hand. The developer wants to talk to one coordinator only, and have it create, name and brief the worker sessions a job needs, with everything reopening by itself when the project is opened.

## What Changes

- Add a `coordinator` agent to the `toolkit` plugin: it owns a file board in the project, talks to the developer, creates worker sessions for tasks, briefs them, follows their progress through SendMessage, and never edits project code itself.
- Add a `worker` agent: it works on the task in its brief, using SDD as usual, and reports to the coordinator.
- Add a SessionStart hook that, for the coordinator only, runs SDD's documented team-mailbox pull and puts the recap in the coordinator's context, so nobody types `/sdd collab`.
- Add a VS Code extension (plain JavaScript, no build) that, in a project enabled for it, opens the coordinator in an editor tab when the folder opens, reopens workers that still have open work, and opens a named tab for each worker the coordinator requests.
- Single project only; coordinating several projects is a later change.

## Capabilities

### New Capabilities

- `project-coordinator`: the coordinator and worker roles, the project board and the protocol between them, and the startup team-mailbox recap.
- `vscode-session-launcher`: the VS Code extension that starts the coordinator, reopens active workers and opens requested workers in named editor tabs.

### Modified Capabilities

None.

## Impact

- New plugin components (`agents/`, `hooks/`) and a new `vscode/` extension folder in this repository; tests extend `node --test`.
- In an enabled project: a `.coord/` folder, excluded from Git through `.git/info/exclude`.
- On the machine: the extension folder is linked into `~/.vscode/extensions`; sessions start with `--plugin-dir` and `--permission-mode auto` (needed so messages between sessions need no manual approval).
- SDD is used only through its documented commands and is not changed.
