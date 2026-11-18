# Spec Delta

## ADDED Requirements

### Requirement: Jump to the waiting session

Clicking the status-bar item SHALL focus the most urgent waiting session (longest waiting first), in this or another window as a card click does; with no session waiting it SHALL open the sessions view.

#### Scenario: Sessions waiting

- **WHEN** two sessions wait and the developer clicks the status-bar item
- **THEN** the one waiting longest is focused

#### Scenario: Nothing waiting

- **WHEN** no session waits and the developer clicks the status-bar item
- **THEN** the sessions view opens

### Requirement: Next waiting session

A command "Toolkit: Next waiting session", bound by default to `Ctrl+Alt+N`, SHALL focus the waiting sessions one after another in urgency order, starting again from the first after the last; with none waiting it SHALL show a short message.

#### Scenario: Cycling

- **WHEN** three sessions wait and the developer presses the shortcut three times
- **THEN** each of the three is focused once, in urgency order

### Requirement: Fixed view placement

"Claude sessions" SHALL live in its own Activity Bar container, so it appears in the same place in every window.

#### Scenario: Two windows

- **WHEN** the developer switches between two VS Code windows
- **THEN** both show the "Claude sessions" container under the same Activity Bar icon

### Requirement: Safe registry and focus files

Window registry files SHALL be removed by the name of the file read, including unreadable ones; registry files and focus requests SHALL be written to a temporary file and renamed into place, so a reader never sees a partial file.

#### Scenario: Unreadable registry file

- **WHEN** a window file cannot be parsed
- **THEN** the next reader deletes that file and no other
