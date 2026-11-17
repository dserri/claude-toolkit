# toolkit-marketplace Specification

## Purpose
Delivers the developer's personal Claude Code plugins from a private Git repository as a plugin marketplace, compatible with but separate from the team-shared SDD skill.

## Requirements

### Requirement: Valid marketplace

The repository SHALL be a valid Claude Code plugin marketplace named `claude-toolkit` that lists the plugin `toolkit` from a directory inside the repository.

#### Scenario: Marketplace and plugin validate

- **WHEN** `claude plugin validate` runs on the repository root and on the plugin directory
- **THEN** both pass with no errors

#### Scenario: Plugin source stays inside the repository

- **WHEN** a plugin `source` is absolute, empty or resolves outside the repository root
- **THEN** the repository tests reject it

### Requirement: Local loading

Until the organization allows the marketplace, sessions SHALL load the plugin from the clone with `--plugin-dir`, without changing user-level Claude Code configuration.

#### Scenario: Session started with the plugin directory

- **WHEN** Claude Code starts with `--plugin-dir <clone>/plugins/toolkit`
- **THEN** the session starts with the plugin loaded and still offers the team-shared `sdd` skill

### Requirement: Updates follow the repository

New commits SHALL reach users without a version bump.

#### Scenario: No version pinning

- **WHEN** the plugin manifest is read
- **THEN** it declares no `version`, so a marketplace install tracks commits

### Requirement: SDD untouched

The toolkit SHALL NOT modify or shadow SDD files, rules, skills or agents.

#### Scenario: Nothing can shadow SDD

- **WHEN** the plugin contents are listed
- **THEN** no skill or agent is named `sdd`, and the SDD installation is unchanged after loading the plugin
