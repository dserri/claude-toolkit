# Spec Delta

## ADDED Requirements

### Requirement: No hook for read-only tools

The installer SHALL register the PostToolUse and PostToolUseFailure status hooks with a matcher that excludes the read-only tools `Read`, `Grep`, `Glob`, `LS`, `NotebookRead`, `TodoWrite`, `TodoRead` and `ToolSearch`, and re-running it SHALL update an existing install's matchers. The default "possibly stuck" threshold SHALL be 15 minutes.

#### Scenario: Reading files

- **WHEN** a session reads, greps and globs files
- **THEN** no status hook process starts for those calls

#### Scenario: Permission answered

- **WHEN** the developer grants a permission for a Bash, Edit, Write, web or MCP tool and it runs
- **THEN** the card returns from waiting for permission to working, as before

#### Scenario: Permission for a read-only tool

- **WHEN** a read-only tool such as Read asks for permission (for example outside the project) and the developer grants it
- **THEN** the card stays waiting for permission until the session's next recorded event (another tool, a new permission, the end of the turn); this delay is the accepted cost of not running the hook after read-only tools

#### Scenario: Upgrade

- **WHEN** the installer runs on a machine with the previous status hooks
- **THEN** the toolkit's entries carry the new matchers and no entry is duplicated

### Requirement: Background work

When a turn ends while background tasks are running and the agent does not ask the developer anything, the session SHALL show "working in background" with the number of running tasks, in its own colour, sorted with working sessions and never as possibly stuck. A turn ending with a question SHALL still show waiting for an answer.

#### Scenario: Background server

- **WHEN** a session starts a dev server in the background and ends its turn
- **THEN** its card shows "working in background · 1 task" instead of finished

#### Scenario: Task completes

- **WHEN** the background task finishes and Claude starts a new turn that ends with no running tasks
- **THEN** the card shows finished
