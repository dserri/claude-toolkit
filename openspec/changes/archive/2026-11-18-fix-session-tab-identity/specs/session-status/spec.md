# Spec Delta

## ADDED Requirements

### Requirement: Tab identity follows the Claude process

The status hook SHALL record the Claude process id with the session's events. Each window SHALL publish the process ids of the tabs it opened, and a card SHALL be linked to a tab by process id, falling back to the session name when either id is unknown. When several sessions report the same process id, only the one with the latest event SHALL be shown.

#### Scenario: Resume inside a tab

- **WHEN** the developer runs `/resume` in the plain `claude` tab and picks a chat named `test-chat`
- **THEN** the `<project>-claude` card disappears, the `test-chat` card says "in this window", and clicking it focuses that tab

#### Scenario: Clear inside a tab

- **WHEN** the developer runs `/clear` in a worker tab
- **THEN** only the new session's card is shown for that tab

#### Scenario: Plain tab follows its chat

- **WHEN** the plain `claude` tab is the active tab and its Claude process now runs a session with another name (after `/resume` or a rename)
- **THEN** the tab is renamed to that session's name; coordinator and worker tabs keep their names, which the extension uses to track them

#### Scenario: Unknown process

- **WHEN** a session's events carry no process id (recorded before this change)
- **THEN** it is linked by name as before
