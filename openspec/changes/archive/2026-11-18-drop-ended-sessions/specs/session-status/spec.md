# Spec Delta

## ADDED Requirements

### Requirement: Ended sessions disappear

A session whose recorded Claude process id is not running SHALL NOT be shown, neither in its project group nor in the hidden group. Sessions without a recorded process id SHALL keep the existing 6-hour rule.

#### Scenario: Terminal closed

- **WHEN** the developer closes a terminal running a Claude session, without `/exit`
- **THEN** its card disappears at the next refresh

#### Scenario: Closed tab

- **WHEN** the developer closes a toolkit tab
- **THEN** its session is not listed in the hidden group once its process has ended

### Requirement: Order pruning

Stored session order SHALL drop keys of untitled sessions (`id:<id>`) whose session no longer exists, and keep titled names, so placements of named sessions survive restarts.

#### Scenario: Hand-started session ends

- **WHEN** a placed hand-started session ends and the developer reorders that project
- **THEN** its `id:` key is no longer stored
