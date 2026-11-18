import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const pluginRoot = join(root, 'plugins', 'toolkit');

const readJson = (...segments) => JSON.parse(readFileSync(join(root, ...segments), 'utf8'));
const readAgent = (name) => readFileSync(join(pluginRoot, 'agents', `${name}.md`), 'utf8');
const frontmatter = (text) => /^---\n([\s\S]*?)\n---\n/.exec(text)[1];

test('marketplace lists the toolkit plugin from inside the repository', () => {
  const marketplace = readJson('.claude-plugin', 'marketplace.json');

  assert.equal(marketplace.name, 'claude-toolkit');
  assert.ok(marketplace.owner?.name);
  assert.deepEqual(
    marketplace.plugins.map(({ name, source }) => ({ name, source })),
    [{ name: 'toolkit', source: './plugins/toolkit' }],
  );
});

test('plugin manifest is named toolkit and declares no version', () => {
  const plugin = readJson('plugins', 'toolkit', '.claude-plugin', 'plugin.json');

  assert.equal(plugin.name, 'toolkit');
  assert.equal(Object.hasOwn(plugin, 'version'), false);
});

test('the plugin ships exactly the coordinator and worker agents and the start-up hook', () => {
  assert.deepEqual(readdirSync(pluginRoot).sort(), ['.claude-plugin', 'agents', 'hooks']);
  assert.deepEqual(readdirSync(join(pluginRoot, 'agents')).sort(), ['coordinator.md', 'worker.md']);
  assert.deepEqual(readdirSync(join(pluginRoot, 'hooks')).sort(), ['hooks.json', 'session-start.mjs']);
});

test('agent definitions are named after their files and carry a description', () => {
  for (const name of ['coordinator', 'worker']) {
    const fields = frontmatter(readAgent(name));

    assert.match(fields, new RegExp(`^name: ${name}$`, 'm'));
    assert.match(fields, /^description: \S/m);
  }
});

test('both agents describe the same board paths', () => {
  for (const name of ['coordinator', 'worker']) {
    const prompt = readAgent(name);

    for (const boardPath of ['team.json', 'requests/', 'sessions/', 'log.md', 'brief.md', 'status.md', '<prefix>-coordinator']) {
      assert.ok(prompt.includes(boardPath), `${name} mentions ${boardPath}`);
    }
  }
});

test('both agents end every turn with the status line the session view reads', () => {
  for (const name of ['coordinator', 'worker'])
    assert.match(readAgent(name), /End every turn with a final line on its own: `STATUS: QUESTION` when you need the developer's answer or decision, `STATUS: DONE` otherwise\./, name);
});

test('the coordinator writes requests in the exact shape the extension accepts', () => {
  assert.match(readAgent('coordinator'), /^- `requests\/<name>\.json`: .*containing exactly `\{ "name": "<name>" \}`/m);
});

test('the extension adds only native, labelled VS Code UI: commands, settings and a tree view, no webview', () => {
  const extension = readJson('vscode', 'package.json');
  const { commands, configuration, views, viewsContainers, keybindings } = extension.contributes;

  assert.deepEqual(Object.keys(extension.contributes).sort(), ['commands', 'configuration', 'keybindings', 'menus', 'views', 'viewsContainers']);
  assert.deepEqual(commands.map((command) => command.title), [
    'Toolkit: Enable coordinator in this folder',
    'Toolkit: Start coordinator',
    'Toolkit: Open Claude here on startup',
    'Toolkit: Stop opening Claude here',
    'Toolkit: Show session tab',
    'Toolkit: Hide session until its next event',
    'Toolkit: Show session again',
    'Toolkit: Show the session waiting longest',
    'Toolkit: Next waiting session',
  ]);
  assert.deepEqual(viewsContainers, { activitybar: [{ id: 'claudeToolkit', title: 'Claude sessions', icon: 'media/sessions.svg' }] });
  assert.deepEqual(views, { claudeToolkit: [{ id: 'claudeToolkit.sessions', name: 'Claude sessions' }] });
  assert.ok(readFileSync(join(root, 'vscode', 'media', 'sessions.svg'), 'utf8').startsWith('<svg'));
  assert.deepEqual(keybindings, [{ command: 'claudeToolkit.nextWaiting', key: 'ctrl+alt+n', mac: 'cmd+alt+n' }]);
  assert.deepEqual(configuration.properties['claudeToolkit.workerLayout'].enum, ['beside', 'tabs']);
  assert.equal(configuration.properties['claudeToolkit.workerLayout'].default, 'beside');

  for (const [key, setting] of Object.entries(configuration.properties)) {
    assert.match(setting.description, /\S{3}/, key);
    assert.equal(setting.scope, 'machine', `${key} cannot be overridden by a workspace`);
  }
});

test('the start-up hook runs when a session starts or resumes', () => {
  const hooks = readJson('plugins', 'toolkit', 'hooks', 'hooks.json').hooks;

  assert.deepEqual(Object.keys(hooks), ['SessionStart']);
  assert.equal(hooks.SessionStart.length, 1);
  assert.equal(hooks.SessionStart[0].matcher, 'startup|resume');
  assert.equal(hooks.SessionStart[0].hooks[0].command, 'node "${CLAUDE_PLUGIN_ROOT}/hooks/session-start.mjs"');
});
