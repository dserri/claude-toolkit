# Spec Delta

## ADDED Requirements

### Requirement: Hidden group

Sessions hidden by the developer or by closing their tab SHALL be listed in a "Hidden" group after all project groups, collapsed by default, labelled with their count and ordered by latest event first, and SHALL NOT count in the status-bar waiting count. Each entry SHALL offer "Show again", which returns the session to its project group. The group SHALL not appear when nothing is hidden.

#### Scenario: Mistaken hide

- **WHEN** the developer hides a card by mistake
- **THEN** it appears in the collapsed "Hidden (1)" group, and "Show again" puts it back in its project group

#### Scenario: Closed tab

- **WHEN** the developer closes a session's tab
- **THEN** its card leaves the project group and is listed only in the collapsed hidden group

#### Scenario: New activity

- **WHEN** a hidden session records a new event
- **THEN** it returns to its project group by itself

### Requirement: Persistent hiding

Hidden sessions SHALL be stored in the extension's storage on this machine, so a window reload keeps them hidden; entries of sessions that no longer have a session file, or that recorded a newer event, SHALL be dropped.

#### Scenario: Reload

- **WHEN** the developer hides a card and reloads the window
- **THEN** the card stays in the hidden group
