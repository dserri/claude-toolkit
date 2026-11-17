# Design

## Context

Claude Code 2.1.326 loads plugins from Git marketplaces with the developer's existing Git credentials, or from a local folder with `--plugin-dir`. The organization's server-managed policy allows only `github:anthropics/claude-plugins-official` as a marketplace source (verified: `claude plugin marketplace add dserri/claude-toolkit` is refused). This repository is a personal proof of concept, kept separate from SDD until the developer validates it.

## Goals / Non-Goals

**Goals:** one repository that is both marketplace and plugin source, loadable locally now and installable later without restructuring.

**Non-Goals:** any plugin component (the coordinator follows in its own change); importing the earlier `create-coordinator` skill, which coordinates several projects through Windows Terminal and does not fit the single-project coordinator; publishing to the public plugin directory (no LICENSE or icon needed).

## Decisions

- **Layout:** `.claude-plugin/marketplace.json` at the root, plugin at `plugins/toolkit` with a relative `source`. One repository keeps marketplace and plugin in step.
- **No `version` in `plugin.json`:** updates track commits, so a push is a release.
- **Local loading:** `--plugin-dir <clone>/plugins/toolkit` per session; files load as they are on disk. The marketplace layout stays valid for when an admin allows the repository or hosts it on claude.ai.
- **Tests:** `node --test` covers the manifests, plugin source containment, the absence of components that could shadow SDD, and runs `claude plugin validate` on the root and the plugin. Loading with `--plugin-dir` (with `/sdd` still offered) and the unchanged SDD installation are developer-verified (task 2.2): the CLI's plugin list omits `--plugin-dir` plugins and an empty plugin has nothing to invoke. The coordinator change adds automated session checks once the plugin has components.
- **`.gitattributes`** sets `* text=auto eol=lf` so checkouts on Windows stay byte-identical.

## Risks / Trade-offs

- [`--plugin-dir` loads a plugin from a source the organization's marketplace policy does not list] → the developer's explicit choice for local testing of their own repository; access will be requested before anyone else uses it.
- [A push reaches every marketplace install at its next update] → `node --test` runs before each commit.

## Migration Plan

1. Push the repository; start sessions that need the toolkit with `--plugin-dir`.
2. Once an admin allows the marketplace: add it, install `toolkit@claude-toolkit` and enable auto-update.
3. Rollback: stop passing `--plugin-dir`, or uninstall the plugin.
