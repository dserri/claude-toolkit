# Spec Delta

## Purpose

Delivers the developer's personal Claude Code skills from a private Git repository as a plugin marketplace, installed and kept current by Claude Code itself, alongside the team-shared SDD skill.

## ADDED Requirements

### Requirement: Installable marketplace

The repository SHALL be a valid Claude Code plugin marketplace named `claude-toolkit` that lists the plugin `toolkit` from inside the repository.

#### Scenario: Marketplace validates

- **WHEN** `claude plugin validate` runs on the repository root
- **THEN** validation passes with no errors

#### Scenario: Plugin installs from the marketplace

- **WHEN** the developer adds the repository as a marketplace and installs `toolkit@claude-toolkit`
- **THEN** the plugin is listed as installed and enabled

### Requirement: Coordinator skill unchanged

The `toolkit` plugin SHALL provide the `create-coordinator` skill with content identical to release 0.2.0, invoked as `/toolkit:create-coordinator`, and only by the developer.

#### Scenario: Files match the release

- **WHEN** the plugin's `create-coordinator` files are compared with release 0.2.0
- **THEN** `SKILL.md`, `launch.ps1` and `resolve-projects.ps1` have the same SHA-256 as the release manifest, and the scripts keep their UTF-8 byte order mark

#### Scenario: Developer-only invocation

- **WHEN** the plugin is loaded
- **THEN** `create-coordinator` keeps `disable-model-invocation: true`, so Claude cannot start it on its own

### Requirement: Updates follow the repository

Installed copies SHALL receive new commits of the repository through Claude Code's marketplace update, without a version bump.

#### Scenario: Auto-update enabled

- **WHEN** the marketplace is installed on a machine
- **THEN** auto-update is enabled for `claude-toolkit` and the plugin manifest declares no `version`

### Requirement: SDD untouched

The toolkit SHALL NOT modify SDD files, rules, skills or agents, and SHALL NOT shadow the `sdd` skill.

#### Scenario: SDD still resolves

- **WHEN** the toolkit plugin is installed
- **THEN** `/sdd` still runs the team-shared SDD skill and no file under the SDD installation has changed
