# Spec Delta

## ADDED Requirements

### Requirement: Plain Claude on startup

The extension SHALL provide "Toolkit: Open Claude here on startup", which records the open folder on this machine for plain mode and opens one Claude tab named `claude`: Claude Code started without agent, plugin or prompt, with session name `<project>-claude`. Whenever VS Code opens a folder recorded for plain mode and not enabled for the coordinator, the extension SHALL open that tab unless one is already open. It SHALL need neither the toolkit plugin nor `.coord/`. The name `claude` SHALL be reserved like `coordinator`, so no coordinator worker can take the plain tab's name or session.

#### Scenario: Colleague without the coordinator

- **WHEN** a developer who never enabled the coordinator runs the command and later reopens the folder
- **THEN** a `claude` tab opens each time, and its session appears in the session view where a click focuses it

#### Scenario: Coordinator folder

- **WHEN** a folder is enabled for both the coordinator and plain mode
- **THEN** only the coordinator starts

### Requirement: Stop opening Claude

"Toolkit: Stop opening Claude here" SHALL remove the open folder from both the plain and the coordinator records on this machine, leaving `.coord/` and open tabs untouched.

#### Scenario: Stop

- **WHEN** the developer runs the command and reopens the folder
- **THEN** no Claude tab opens automatically
