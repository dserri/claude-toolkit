import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const STATUS_EVENTS = {
  SessionStart: undefined,
  UserPromptSubmit: undefined,
  PreToolUse: 'AskUserQuestion',
  PermissionRequest: undefined,
  PostToolUse: undefined,
  PostToolUseFailure: undefined,
  Stop: undefined,
  SessionEnd: undefined,
};

const scriptCommand = (script) => {
  const file = fileURLToPath(new URL(`./${script}`, import.meta.url)).replaceAll('\\', '/');

  return `node "${file}"`;
};

const hookEntries = () => [
  ...Object.entries(STATUS_EVENTS).map(([event, matcher]) => ({ event, matcher, command: scriptCommand('status-hook.mjs'), async: true })),
  { event: 'SessionStart', command: scriptCommand('turn-status-hook.mjs'), async: false },
];

const hasCommand = (group, command) => (group.hooks ?? []).some((hook) => hook.command === command);

const hookGroup = ({ matcher, command, async }) => {
  const hook = async ? { type: 'command', command, async: true } : { type: 'command', command };

  return matcher ? { matcher, hooks: [hook] } : { hooks: [hook] };
};

const withStatusHooks = (settings, entries) => {
  const hooks = { ...(settings.hooks ?? {}) };

  for (const entry of entries) {
    const groups = hooks[entry.event] ?? [];

    if (!groups.some((group) => hasCommand(group, entry.command)))
      hooks[entry.event] = [...groups, hookGroup(entry)];
  }

  return { ...settings, hooks };
};

const withoutStatusHooks = (settings, commands) => {
  const hooks = {};

  for (const [event, groups] of Object.entries(settings.hooks ?? {})) {
    const kept = groups
      .map((group) => ({ ...group, hooks: (group.hooks ?? []).filter((hook) => !commands.includes(hook.command)) }))
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

  const entries = hookEntries();
  const commands = [...new Set(entries.map((entry) => entry.command))];
  const updated = uninstall ? withoutStatusHooks(settings, commands) : withStatusHooks(settings, entries);

  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(updated, null, 2)}\n`);
  console.log(`${uninstall ? 'Removed' : 'Installed'} the session status hooks (${commands.join(', ')}).`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  run(process.argv.includes('--uninstall'));

export { STATUS_EVENTS, hookEntries, scriptCommand, withStatusHooks, withoutStatusHooks };
