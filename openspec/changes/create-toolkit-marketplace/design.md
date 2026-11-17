# Design

## Context

`create-coordinator` 0.2.0 is installed under `~/.create-coordinator/releases/0.2.0`, linked through `current` and `~/.claude/skills/create-coordinator`. No source repository exists besides that installed copy, whose `runtime-manifest.json` records each file's SHA-256. The files use LF line endings; both scripts need a UTF-8 byte order mark for Windows PowerShell 5.1. Claude Code 2.1.326 loads plugins from Git marketplaces using the developer's existing Git credentials (verified: this machine reaches private `dserri` repositories).

## Goals / Non-Goals

**Goals:** one repository that is both marketplace and plugin source; the coordinator skill moved without behaviour change; installation on this machine.

**Non-Goals:** changing the coordinator, adding agents or hooks, publishing to the public plugin directory (no LICENSE or icon needed for a private marketplace).

## Decisions

- **Layout:** `.claude-plugin/marketplace.json` at the root, plugin at `plugins/toolkit` with a relative `source`. One repository keeps marketplace and plugin in step; a separate plugin repository would add a second release flow for no gain.
- **No `version` in `plugin.json`:** updates track commits, so a push is a release. A version field would force a bump per change.
- **Byte-identical copy:** files are copied, not rewritten. `.gitattributes` sets `* text=auto eol=lf` so checkouts on Windows keep LF and the hashes keep matching.
- **Test:** `node --test` checks the marketplace and plugin manifests, the skill frontmatter and the SHA-256 of each coordinator file against the 0.2.0 manifest values, plus the byte order marks. `claude plugin validate` is run as an install-time verification, since it needs the Claude Code CLI and user configuration.
- **Auto-update:** `claude plugin marketplace add` has no auto-update flag; it is enabled in user settings (`extraKnownMarketplaces.claude-toolkit.autoUpdate: true`) or through `/plugin`, whichever the installed CLI accepts.
- **Retiring the old link:** after the plugin skill is verified, remove only the `~/.claude/skills/create-coordinator` symbolic link (with the developer's confirmation). The release folder stays.

## Risks / Trade-offs

- [`roots.txt` sits next to `resolve-projects.ps1`, which is now inside the plugin cache and replaced on update] → none exists today; a later change moves it to a user folder before anyone relies on it.
- [Plugin skill name changes to `/toolkit:create-coordinator`] → documented in the README; the old name disappears only when the link is removed.
- [A push breaks the skill on every machine at the next update] → the structural test runs before each commit.

## Migration Plan

1. Push the repository; add the marketplace; install `toolkit@claude-toolkit`; enable auto-update.
2. Verify `/toolkit:create-coordinator` loads, then remove the old skill link.
3. Rollback: `claude plugin uninstall toolkit@claude-toolkit` and recreate the link to `~/.create-coordinator/current/create-coordinator`.
