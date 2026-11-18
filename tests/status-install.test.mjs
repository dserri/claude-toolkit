import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOOK_MATCHERS, hookCommand, withStatusHooks, withoutStatusHooks } from '../status/install.mjs';

const installer = fileURLToPath(new URL('../status/install.mjs', import.meta.url));
const command = 'node "P:/clone/status/status-hook.mjs"';

const existing = {
  env: { DOTNET_gcServer: '0' },
  hooks: {
    Stop: [{ hooks: [{ type: 'command', command: 'powershell.exe -NoProfile -Command "play tada"' }] }],
  },
  enabledPlugins: { 'postman@claude-plugins-official': true },
};

test('install adds one asynchronous entry per event, keeps existing entries, and is idempotent', () => {
  const installed = withStatusHooks(existing, command);

  assert.deepEqual(Object.keys(installed.hooks).sort(), Object.keys(HOOK_MATCHERS).sort());
  assert.deepEqual(installed.hooks.Stop[0], existing.hooks.Stop[0]);
  assert.equal(installed.env, existing.env);
  assert.equal(installed.enabledPlugins, existing.enabledPlugins);

  for (const [event, matcher] of Object.entries(HOOK_MATCHERS)) {
    const own = installed.hooks[event].filter((group) => group.hooks.some((hook) => hook.command === command));

    assert.equal(own.length, 1, event);
    assert.deepEqual(own[0].hooks, [{ type: 'command', command, async: true }], event);
    assert.equal(own[0].matcher, matcher, event);
  }

  assert.deepEqual(withStatusHooks(installed, command), installed);
});

test('uninstall removes only the toolkit entries and restores the original settings', () => {
  assert.deepEqual(withoutStatusHooks(withStatusHooks(existing, command), command), existing);
  assert.deepEqual(withoutStatusHooks(withStatusHooks({}, command), command), {});
});

test('the hook command points at the clone script with forward slashes', () => {
  assert.match(hookCommand(), /^node ".*\/status\/status-hook\.mjs"$/);
  assert.doesNotMatch(hookCommand(), /\\/);
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

    assert.equal(backups.length, 1);
    assert.deepEqual(JSON.parse(readFileSync(join(claudeDir, backups[0]), 'utf8')), existing);
    assert.equal(JSON.parse(readFileSync(settingsFile, 'utf8')).hooks.SessionStart[0].hooks[0].command, hookCommand());

    const uninstall = spawnSync(process.execPath, [installer, '--uninstall'], { env, encoding: 'utf8' });

    assert.equal(uninstall.status, 0, uninstall.stderr);
    assert.deepEqual(JSON.parse(readFileSync(settingsFile, 'utf8')), existing);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
