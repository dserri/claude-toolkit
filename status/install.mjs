import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HOOK_MATCHERS = {
  SessionStart: undefined,
  UserPromptSubmit: undefined,
  PreToolUse: 'AskUserQuestion',
  PermissionRequest: undefined,
  PostToolUse: undefined,
  PostToolUseFailure: undefined,
  Stop: undefined,
  SessionEnd: undefined,
};

const hookCommand = () => {
  const script = fileURLToPath(new URL('./status-hook.mjs', import.meta.url)).replaceAll('\\', '/');

  return `node "${script}"`;
};

const hasCommand = (group, command) => (group.hooks ?? []).some((hook) => hook.command === command);

const withStatusHooks = (settings, command) => {
  const hooks = { ...(settings.hooks ?? {}) };

  for (const [event, matcher] of Object.entries(HOOK_MATCHERS)) {
    const groups = hooks[event] ?? [];

    if (groups.some((group) => hasCommand(group, command)))
      continue;

    const group = { hooks: [{ type: 'command', command, async: true }] };

    hooks[event] = [...groups, matcher ? { matcher, ...group } : group];
  }

  return { ...settings, hooks };
};

const withoutStatusHooks = (settings, command) => {
  const hooks = {};

  for (const [event, groups] of Object.entries(settings.hooks ?? {})) {
    const kept = groups
      .map((group) => ({ ...group, hooks: (group.hooks ?? []).filter((hook) => hook.command !== command) }))
      .filter((group) => group.hooks.length > 0);

    if (kept.length > 0)
      hooks[event] = kept;
  }

  const { hooks: _removed, ...rest } = settings;

  return Object.keys(hooks).length > 0 ? { ...rest, hooks } : rest;
};

const settingsFile = () => join(homedir(), '.claude', 'settings.json');

const run = (uninstall) => {
  const file = settingsFile();
  const settings = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};

  if (existsSync(file)) {
    const backup = `${file}.backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;

    copyFileSync(file, backup);
    console.log(`Backed up ${file} to ${backup}`);
  }

  const command = hookCommand();
  const updated = uninstall ? withoutStatusHooks(settings, command) : withStatusHooks(settings, command);

  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(updated, null, 2)}\n`);
  console.log(`${uninstall ? 'Removed' : 'Installed'} the session status hooks (${command}).`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  run(process.argv.includes('--uninstall'));

export { HOOK_MATCHERS, hookCommand, withStatusHooks, withoutStatusHooks };
