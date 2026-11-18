# Spec Delta

## ADDED Requirements

### Requirement: Worker layout

A machine-scoped setting `claudeToolkit.workerLayout` SHALL choose where worker tabs open: `beside` (default) opens them in the column next to the coordinator, `tabs` opens them as tabs in the coordinator's column.

#### Scenario: Default layout

- **WHEN** the setting is not changed
- **THEN** workers open beside the coordinator, as before

#### Scenario: Tabs layout

- **WHEN** the setting is `tabs` and the coordinator requests a worker
- **THEN** the worker opens as a full-width tab in the coordinator's column without taking focus
