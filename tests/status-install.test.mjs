import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STATUS_EVENTS, hookEntries, scriptCommand, withStatusHooks, withoutStatusHooks } from '../status/install.mjs';

const installer = fileURLToPath(new URL('../status/install.mjs', import.meta.url));
const statusCommand = 'node "P:/clone/status/status-hook.mjs"';
const turnCommand = 'node "P:/clone/status/turn-status-hook.mjs"';
const entries = [
  ...Object.entries(STATUS_EVENTS).map(([event, matcher]) => ({ event, matcher, command: statusCommand, async: true })),
  { event: 'SessionStart', command: turnCommand, async: false },
];

const existing = {
  env: { DOTNET_gcServer: '0' },
  hooks: {
    Stop: [{ hooks: [{ type: 'command', command: 'powershell.exe -NoProfile -Command "play tada"' }] }],
  },
  enabledPlugins: { 'postman@claude-plugins-official': true },
};

const ownGroups = (settings, event, command) => settings.hooks[event].filter((group) => group.hooks.some((hook) => hook.command === command));

test('install adds one asynchronous status entry per event, keeps existing entries, and is idempotent', () => {
  const installed = withStatusHooks(existing, entries);

  assert.deepEqual(Object.keys(installed.hooks).sort(), Object.keys(STATUS_EVENTS).sort());
  assert.deepEqual(installed.hooks.Stop[0], existing.hooks.Stop[0]);
  assert.equal(installed.env, existing.env);
  assert.equal(installed.enabledPlugins, existing.enabledPlugins);

  for (const [event, matcher] of Object.entries(STATUS_EVENTS)) {
    const own = ownGroups(installed, event, statusCommand);

    assert.equal(own.length, 1, event);
    assert.deepEqual(own[0].hooks, [{ type: 'command', command: statusCommand, async: true }], event);
    assert.equal(own[0].matcher, matcher, event);
  }

  assert.deepEqual(withStatusHooks(installed, entries), installed);
});

test('the status-line hook is one synchronous SessionStart entry without matcher', () => {
  const own = ownGroups(withStatusHooks(existing, entries), 'SessionStart', turnCommand);

  assert.deepEqual(own, [{ hooks: [{ type: 'command', command: turnCommand }] }]);
});

test('an existing install gains the status-line hook on the next run', () => {
  const statusOnly = withStatusHooks(existing, entries.filter((entry) => entry.command === statusCommand));
  const upgraded = withStatusHooks(statusOnly, entries);

  assert.equal(ownGroups(upgraded, 'SessionStart', turnCommand).length, 1);
  assert.equal(ownGroups(upgraded, 'SessionStart', statusCommand).length, 1);
});

test('uninstall removes only the toolkit entries and restores the original settings', () => {
  assert.deepEqual(withoutStatusHooks(withStatusHooks(existing, entries), [statusCommand, turnCommand]), existing);
  assert.deepEqual(withoutStatusHooks(withStatusHooks({}, entries), [statusCommand, turnCommand]), {});
});

test('the hook commands point at the clone scripts with forward slashes', () => {
  for (const script of ['status-hook.mjs', 'turn-status-hook.mjs']) {
    assert.match(scriptCommand(script), new RegExp(`^node ".*/status/${script.replace('.', '\\.')}"$`));
    assert.doesNotMatch(scriptCommand(script), /\\/);
  }

  assert.deepEqual(hookEntries().filter((entry) => !entry.async).map((entry) => entry.event), ['SessionStart']);
});

test('running the installer backs up the settings file before writing', () => {
  const home = mkdtempSync(join(tmpdir(), 'toolkit-install-'));

  try {
    const claudeDir = join(home, '.claude');
    const settingsFile = join(claudeDir, 'settings.json');
    const env = { ...process.env, HOME: home, USERPROFILE: home };

    mkdirSync(claudeDir);
    writeFileSync(settingsFile, JSON.stringify(existing));

    const install = spawnSync(process.execPath, [installer], { env, encoding: 'utf8' });

    assert.equal(install.status, 0, install.stderr);

    const backups = readdirSync(claudeDir).filter((entry) => entry.startsWith('settings.json.backup-'));
    const written = JSON.parse(readFileSync(settingsFile, 'utf8'));

    assert.equal(backups.length, 1);
    assert.deepEqual(JSON.parse(readFileSync(join(claudeDir, backups[0]), 'utf8')), existing);
    assert.deepEqual(written.hooks.SessionStart.map((group) => group.hooks[0].command), [scriptCommand('status-hook.mjs'), scriptCommand('turn-status-hook.mjs')]);

    const uninstall = spawnSync(process.execPath, [installer, '--uninstall'], { env, encoding: 'utf8' });

    assert.equal(uninstall.status, 0, uninstall.stderr);
    assert.deepEqual(JSON.parse(readFileSync(settingsFile, 'utf8')), existing);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
