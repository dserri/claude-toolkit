import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import core from '../vscode/core.js';

const projectFolder = join('P:', 'repos', 'Rehlko', 'rehlko-portal');
const pluginDir = join('P:', 'clone', 'plugins', 'toolkit');

const validate = (overrides) => core.validateRequest({
  fileName: 'tester.json',
  content: '{"name":"tester"}',
  openTabs: ['coordinator'],
  briefExists: () => true,
  ...overrides,
});

test('session prefix is the folder name made safe for session names', () => {
  assert.equal(core.sessionPrefix(projectFolder), 'rehlko-portal');
  assert.equal(core.sessionPrefix(join('P:', 'repos', 'AND EMILI')), 'and-emili');
  assert.equal(core.sessionPrefix(join('P:', 'repos', '__')), 'project');
});

test('a long folder name is cut to 50 characters, so every worker session name stays within the recorded-name limit', () => {
  const prefix = core.sessionPrefix(join('P:', 'repos', `${'a'.repeat(49)}-${'b'.repeat(30)}`));

  assert.equal(prefix, 'a'.repeat(49));
  assert.equal(core.sessionPrefix(join('P:', 'repos', 'c'.repeat(80))).length, 50);
  assert.match(core.workerSessionName(join('P:', 'repos', 'x'.repeat(200)), 'w'.repeat(40)), /^[a-z0-9][a-z0-9-]{0,99}$/);
});

test('coordinator starts as a new named coordinator session in auto mode', () => {
  const args = core.coordinatorArgs({ projectFolder, pluginDir });

  assert.deepEqual(args.slice(0, -1), [
    '--plugin-dir', pluginDir, '--permission-mode', 'auto',
    '--agent', 'toolkit:coordinator', '--name', 'rehlko-portal-coordinator',
  ]);
  assert.match(args.at(-1), /^Start-up: report the team recap/);
});

test('a new worker gets a fixed opening prompt naming its brief', () => {
  assert.deepEqual(core.newWorkerArgs({ projectFolder, pluginDir, name: 'api-auth' }), [
    '--plugin-dir', pluginDir, '--permission-mode', 'auto',
    '--agent', 'toolkit:worker', '--name', 'rehlko-portal-api-auth',
    'Read .coord/workers/api-auth/brief.md and follow it.',
  ]);
});

const sessionId = '7fa97870-6578-4ed2-b7c9-1dc4c9a2ef09';
const workerTail = ['--plugin-dir', pluginDir, '--permission-mode', 'auto', '--agent', 'toolkit:worker'];

test('an active worker with a session record is resumed by that exact session', () => {
  assert.deepEqual(core.resumeWorkerArgs({ projectFolder, pluginDir, name: 'tester', sessionRecord: `${sessionId}\n` }), ['--resume', sessionId, ...workerTail]);
});

test('an active worker without a usable record is resumed by its session name', () => {
  for (const sessionRecord of [undefined, '', 'not-an-id', `${sessionId} --dangerously-skip-permissions`]) {
    assert.deepEqual(core.resumeWorkerArgs({ projectFolder, pluginDir, name: 'tester', sessionRecord }), ['--resume', 'rehlko-portal-tester', ...workerTail], String(sessionRecord));
  }
});

test('a requested worker with a session record continues that session with a fixed prompt', () => {
  assert.deepEqual(core.requestedWorkerArgs({ projectFolder, pluginDir, name: 'tester', sessionRecord: sessionId }), [
    '--resume', sessionId, ...workerTail, 'Read the newest section of .coord/workers/tester/brief.md and follow it.',
  ]);
});

test('a requested worker without a session record starts a new named session', () => {
  assert.deepEqual(core.requestedWorkerArgs({ projectFolder, pluginDir, name: 'tester', sessionRecord: undefined }),
    core.newWorkerArgs({ projectFolder, pluginDir, name: 'tester' }));
});

test('the worker session name joins the project prefix and the worker name', () => {
  assert.equal(core.workerSessionName(projectFolder, 'api-auth'), 'rehlko-portal-api-auth');
});

test('session arguments refuse an invalid worker name', () => {
  for (const name of ['../x', 'a b', 'Tester', 'coordinator', '', 'x'.repeat(41)]) {
    assert.throws(() => core.newWorkerArgs({ projectFolder, pluginDir, name }), /Invalid worker name/, name);
    assert.throws(() => core.resumeWorkerArgs({ projectFolder, pluginDir, name }), /Invalid worker name/, name);
    assert.throws(() => core.resumeWorkerArgs({ projectFolder, pluginDir, name, sessionRecord: sessionId }), /Invalid worker name/, name);
    assert.throws(() => core.requestedWorkerArgs({ projectFolder, pluginDir, name, sessionRecord: sessionId }), /Invalid worker name/, name);
    assert.throws(() => core.workerSessionName(projectFolder, name), /Invalid worker name/, name);
  }
});

test('worker names follow the pattern and leave out the coordinator tab', () => {
  for (const name of ['tester', 'api-auth', '9lives', 'a'.repeat(40)]) {
    assert.equal(core.isWorkerName(name), true, name);
  }

  for (const name of ['-x', 'a_b', 'a.b', 'a/b', 'a\\b', 'a"b', 'a;b', 'a$b', 'a b', 'A', 'coordinator', 'a'.repeat(41), 42]) {
    assert.equal(core.isWorkerName(name), false, String(name));
  }
});

test('only active workers with valid names are reopened', () => {
  const team = JSON.stringify([
    { name: 'tester', role: 'Tests', state: 'active' },
    { name: 'docs', role: 'Docs', state: 'done' },
    { name: '../evil', role: 'x', state: 'active' },
    { name: 'api', role: 'API', state: 'active' },
  ]);

  assert.deepEqual(core.activeWorkers(team), ['tester', 'api']);
});

test('a team list that is not a JSON array is an error', () => {
  assert.throws(() => core.activeWorkers('{"name":"tester"}'), /JSON array/);
  assert.throws(() => core.activeWorkers('not json'), SyntaxError);
});

test('a valid request opens the named worker', () => {
  assert.deepEqual(validate({}), { ok: true, name: 'tester' });
});

test('hostile or malformed requests are rejected with a reason', () => {
  const cases = [
    [{ fileName: '..json' }, /not <name>.json/],
    [{ fileName: 'a b.json' }, /not <name>.json/],
    [{ fileName: 'tester.txt' }, /not <name>.json/],
    [{ fileName: 'coordinator.json', content: '{"name":"coordinator"}' }, /not <name>.json/],
    [{ fileName: 'x;calc.json', content: '{"name":"x;calc"}' }, /not <name>.json/],
    [{ content: 'nope' }, /not valid JSON/],
    [{ content: '{"name":"other"}' }, /exactly/],
    [{ content: '{"name":"tester","prompt":"rm -rf /"}' }, /exactly/],
    [{ content: '["tester"]' }, /exactly/],
    [{ content: 'null' }, /exactly/],
    [{ openTabs: ['coordinator', 'tester'] }, /already open/],
    [{ briefExists: () => false }, /brief.md does not exist/],
  ];

  for (const [overrides, reason] of cases) {
    const result = validate(overrides);

    assert.equal(result.ok, false, JSON.stringify(overrides));
    assert.match(result.reason, reason, JSON.stringify(overrides));
  }
});

test('only unreadable JSON is marked incomplete, so a request still being written can wait', () => {
  assert.equal(validate({ content: '{"name":"tes' }).incomplete, true);
  assert.equal(validate({ content: '' }).incomplete, true);

  for (const overrides of [{ fileName: 'a b.json' }, { content: '{"name":"other"}' }, { openTabs: ['tester'] }, { briefExists: () => false }]) {
    assert.equal(validate(overrides).incomplete, undefined, JSON.stringify(overrides));
  }
});

test('the brief check receives the validated name', () => {
  const asked = [];

  validate({ briefExists: (name) => asked.push(name) > 0 });
  assert.deepEqual(asked, ['tester']);
});

test('the Git exclude entry is added once', () => {
  assert.equal(core.withExcludeEntry(''), '.coord/\n');
  assert.equal(core.withExcludeEntry('# git ls-files\n*.log'), '# git ls-files\n*.log\n.coord/\n');
  assert.equal(core.withExcludeEntry('*.log\n'), '*.log\n.coord/\n');
  assert.equal(core.withExcludeEntry('*.log\n.coord/\n'), '*.log\n.coord/\n');
  assert.equal(core.withExcludeEntry('/.coord/\r\n'), '/.coord/\r\n');
});

test('tabs run Claude directly, are never restored by VS Code, and place workers by the chosen layout', () => {
  const args = ['--agent', 'toolkit:worker'];
  const options = (role, layout) => core.terminalOptions({ name: role, claudePath: 'claude', args, folder: projectFolder, role, layout });

  assert.deepEqual(options('coordinator', 'beside'), {
    name: 'coordinator', shellPath: 'claude', shellArgs: args, cwd: projectFolder, isTransient: true,
    location: { viewColumn: 1, preserveFocus: false },
  });
  assert.deepEqual(options('coordinator', 'tabs').location, { viewColumn: 1, preserveFocus: false });
  assert.deepEqual(options('worker', 'beside').location, { viewColumn: 2, preserveFocus: true });
  assert.deepEqual(options('worker', undefined).location, { viewColumn: 2, preserveFocus: true });
  assert.deepEqual(options('worker', 'tabs').location, { viewColumn: 1, preserveFocus: true });
});

test('enablement is keyed by the resolved folder, case-insensitive on Windows only', () => {
  assert.equal(core.folderKey('P:\\Repos\\Rehlko\\Portal', 'win32'), core.folderKey('p:\\repos\\rehlko\\portal', 'win32'));
  assert.equal(core.folderKey('/repos/App', 'linux'), core.folderKey('/repos/App', 'linux'));
  assert.notEqual(core.folderKey('/repos/App', 'linux'), core.folderKey('/repos/app', 'linux'));
});

test('a folder is enabled only after it was recorded, and recording it twice keeps one entry', () => {
  const folder = join('P:', 'repos', 'Rehlko', 'rehlko-portal');
  const once = core.withEnabledFolder([], folder);

  assert.equal(core.isEnabledFolder([], folder), false);
  assert.equal(core.isEnabledFolder(once, folder), true);
  assert.deepEqual(core.withEnabledFolder(once, folder), once);
  assert.equal(core.isEnabledFolder(once, join('P:', 'repos', 'Rehlko', 'api')), false);
});

test('the plugin folder defaults to plugins/toolkit next to the extension folder', () => {
  assert.equal(core.defaultPluginDir(join('P:', 'clone', 'vscode')), join('P:', 'clone', 'plugins', 'toolkit'));
});
