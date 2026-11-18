import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import status from '../vscode/status-core.js';

const hookPath = fileURLToPath(new URL('../status/status-hook.mjs', import.meta.url));

const homes = [];

function makeHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'window-blackbox-'));

  homes.push(home);

  return home;
}

after(() => {
  for (const home of homes)
    fs.rmSync(home, { recursive: true, force: true });
});

function sessionsDir(home) {
  return path.join(home, '.agent-status', 'sessions');
}

function runHook(home, input, extraEnv = {}) {
  const env = { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_CODE_ENTRYPOINT: 'cli' };
  delete env.CLAUDE_PROJECT_DIR;
  delete env.AUTOMATIONS_ROOT;
  Object.assign(env, extraEnv);
  const result = spawnSync(process.execPath, [hookPath], { input: JSON.stringify(input), env, encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  return result;
}

function readLines(home, sessionId) {
  const file = path.join(sessionsDir(home), `${sessionId}.jsonl`);
  return fs.readFileSync(file, 'utf8').split('\n').filter((line) => line.trim()).map((line) => JSON.parse(line));
}

function sessionFileExists(home, sessionId) {
  return fs.existsSync(path.join(sessionsDir(home), `${sessionId}.jsonl`));
}

function markerExists(home, sessionId) {
  return fs.existsSync(path.join(sessionsDir(home), `${sessionId}.ended`));
}

const alive = (pids) => (pid) => pids.includes(pid);

test('liveWindows keeps only well-formed live entries in order', () => {
  const a = { pid: 10, folder: 'P:\\repos\\alpha', sessions: [] };
  const b = { pid: 20, folder: '/home/u/beta', sessions: ['x'] };
  const dead = { pid: 30, folder: 'gamma', sessions: [] };
  const entries = [
    null,
    'text',
    42,
    a,
    { pid: 1.5, folder: 'f', sessions: [] },
    { pid: '20', folder: 'f', sessions: [] },
    { pid: 20, folder: 7, sessions: [] },
    { pid: 20, sessions: [] },
    { pid: 20, folder: 'f', sessions: 'x' },
    { pid: 20, folder: 'f' },
    dead,
    b,
  ];
  const result = status.liveWindows(entries, alive([10, 20, 1.5]));
  assert.deepEqual(result, [a, b]);
});

test('liveWindows returns an empty list when no entry is alive', () => {
  const result = status.liveWindows([{ pid: 1, folder: 'f', sessions: [] }], () => false);
  assert.deepEqual(result, []);
});

test('sessionLocation reports here, other and none', () => {
  const own = { pid: 100, folder: 'C:\\work\\own', sessions: ['alpha'] };
  const other = { pid: 200, folder: 'C:\\work\\other', sessions: ['beta', 'gamma'] };
  const windows = [own, other];
  assert.deepEqual(status.sessionLocation('alpha', 100, windows), { kind: 'here', window: own });
  assert.deepEqual(status.sessionLocation('gamma', 100, windows), { kind: 'other', window: other });
  assert.deepEqual(status.sessionLocation('delta', 100, windows), { kind: 'none' });
  assert.deepEqual(status.sessionLocation('alpha', 200, windows), { kind: 'other', window: own });
});

test('sessionLocation returns none for no windows', () => {
  assert.deepEqual(status.sessionLocation('alpha', 1, []), { kind: 'none' });
});

test('locationLabel formats each kind', () => {
  assert.equal(status.locationLabel({ kind: 'here', window: { pid: 1, folder: 'C:\\a\\b', sessions: [] } }), 'in this window');
  assert.equal(status.locationLabel({ kind: 'none' }), 'not in a toolkit tab');
  assert.equal(status.locationLabel({ kind: 'other', window: { pid: 2, folder: 'C:\\repos\\project-x', sessions: [] } }), 'in window project-x');
  assert.equal(status.locationLabel({ kind: 'other', window: { pid: 2, folder: '/home/u/project-y', sessions: [] } }), 'in window project-y');
  assert.equal(status.locationLabel({ kind: 'other', window: { pid: 2, folder: 'C:\\repos\\project-z\\', sessions: [] } }), 'in window project-z');
  assert.equal(status.locationLabel({ kind: 'other', window: { pid: 2, folder: '/home/u/project-w/', sessions: [] } }), 'in window project-w');
  assert.equal(status.locationLabel({ kind: 'other', window: { pid: 2, folder: 'P:/mixed\\path/leaf', sessions: [] } }), 'in window leaf');
});

test('latestPerTitle keeps the newest titled session per name and all untitled ones', () => {
  const sessions = [
    { id: 'a', name: 'fix bug', titled: true, lastEventAt: 100 },
    { id: 'b', name: 'untitled', titled: false, lastEventAt: 50 },
    { id: 'c', name: 'fix bug', titled: true, lastEventAt: 300 },
    { id: 'd', name: 'untitled', titled: false, lastEventAt: 60 },
    { id: 'e', name: 'other', titled: true, lastEventAt: 10 },
    { id: 'f', name: 'fix bug', titled: true, lastEventAt: 200 },
  ];
  const result = status.latestPerTitle(sessions);
  assert.deepEqual(result.map((s) => s.id), ['b', 'c', 'd', 'e']);
});

test('latestPerTitle does not merge titled and untitled sessions sharing a name', () => {
  const sessions = [
    { id: 'a', name: 'same', titled: false, lastEventAt: 1 },
    { id: 'b', name: 'same', titled: true, lastEventAt: 2 },
    { id: 'c', name: 'same', titled: false, lastEventAt: 3 },
  ];
  assert.deepEqual(status.latestPerTitle(sessions).map((s) => s.id), ['a', 'b', 'c']);
});

test('sessionState reports titled and the first folder in time order', () => {
  const events = [
    { t: 3000, event: 'UserPromptSubmit', folder: 'later', title: 'a title' },
    { t: 1000, event: 'SessionStart', folder: 'first' },
    { t: 2000, event: 'PostToolUse', tool: 'Bash' },
  ];
  const state = status.sessionState({ id: randomUUID(), events, now: 4000, stuckMs: 60000 });
  assert.equal(state.titled, true);
  assert.equal(state.project, 'first');
});

test('sessionState without title or folder', () => {
  const events = [
    { t: 1000, event: 'SessionStart' },
    { t: 2000, event: 'PostToolUse', tool: 'Bash' },
  ];
  const state = status.sessionState({ id: randomUUID(), events, now: 3000, stuckMs: 60000 });
  assert.equal(state.titled, false);
  assert.equal(state.project, 'unknown project');
});

test('hook records events with folder from cwd', () => {
  const home = makeHome();
  const id = randomUUID();
  runHook(home, { session_id: id, hook_event_name: 'SessionStart', cwd: 'C:\\repos\\from-cwd' });
  runHook(home, { session_id: id, hook_event_name: 'UserPromptSubmit', cwd: '/home/u/posix-cwd', prompt: 'hello' });
  const lines = readLines(home, id);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].event, 'SessionStart');
  assert.equal(lines[0].folder, 'from-cwd');
  assert.equal(lines[1].event, 'UserPromptSubmit');
  assert.equal(lines[1].folder, 'posix-cwd');
});

test('hook prefers CLAUDE_PROJECT_DIR for folder', () => {
  const home = makeHome();
  const id = randomUUID();
  runHook(home, { session_id: id, hook_event_name: 'SessionStart', cwd: 'C:\\repos\\ignored' }, { CLAUDE_PROJECT_DIR: 'C:\\repos\\project-back' });
  runHook(home, { session_id: id, hook_event_name: 'UserPromptSubmit', cwd: 'C:\\repos\\ignored', prompt: 'x' }, { CLAUDE_PROJECT_DIR: '/srv/project-forward' });
  const lines = readLines(home, id);
  assert.equal(lines[0].folder, 'project-back');
  assert.equal(lines[1].folder, 'project-forward');
});

test('SessionEnd deletes the file, leaves a marker and blocks later events', () => {
  const home = makeHome();
  const id = randomUUID();
  runHook(home, { session_id: id, hook_event_name: 'SessionStart', cwd: 'C:\\repos\\p' });
  assert.ok(sessionFileExists(home, id));
  runHook(home, { session_id: id, hook_event_name: 'SessionEnd', cwd: 'C:\\repos\\p' });
  assert.equal(sessionFileExists(home, id), false);
  assert.ok(markerExists(home, id));
  runHook(home, { session_id: id, hook_event_name: 'UserPromptSubmit', cwd: 'C:\\repos\\p', prompt: 'late' });
  runHook(home, { session_id: id, hook_event_name: 'PostToolUse', cwd: 'C:\\repos\\p', tool_name: 'Bash' });
  runHook(home, { session_id: id, hook_event_name: 'Stop', cwd: 'C:\\repos\\p' });
  assert.equal(sessionFileExists(home, id), false);
  assert.ok(markerExists(home, id));
});

test('SessionStart after SessionEnd removes the marker and records', () => {
  const home = makeHome();
  const id = randomUUID();
  runHook(home, { session_id: id, hook_event_name: 'SessionStart', cwd: 'C:\\repos\\p' });
  runHook(home, { session_id: id, hook_event_name: 'SessionEnd', cwd: 'C:\\repos\\p' });
  runHook(home, { session_id: id, hook_event_name: 'SessionStart', cwd: 'C:\\repos\\resumed' });
  assert.equal(markerExists(home, id), false);
  const lines = readLines(home, id);
  assert.equal(lines.at(-1).event, 'SessionStart');
  assert.equal(lines.at(-1).folder, 'resumed');
  runHook(home, { session_id: id, hook_event_name: 'UserPromptSubmit', cwd: 'C:\\repos\\resumed', prompt: 'again' });
  assert.equal(readLines(home, id).at(-1).event, 'UserPromptSubmit');
});

test('SessionStart removes files older than six hours, including markers', () => {
  const home = makeHome();
  const dir = sessionsDir(home);
  fs.mkdirSync(dir, { recursive: true });
  const oldJsonl = path.join(dir, `${randomUUID()}.jsonl`);
  const oldMarker = path.join(dir, `${randomUUID()}.ended`);
  const recentJsonl = path.join(dir, `${randomUUID()}.jsonl`);
  const recentMarker = path.join(dir, `${randomUUID()}.ended`);
  for (const file of [oldJsonl, oldMarker, recentJsonl, recentMarker]) {
    fs.writeFileSync(file, '');
  }
  const old = new Date(Date.now() - 7 * 60 * 60 * 1000);
  const recent = new Date(Date.now() - 5 * 60 * 60 * 1000);
  fs.utimesSync(oldJsonl, old, old);
  fs.utimesSync(oldMarker, old, old);
  fs.utimesSync(recentJsonl, recent, recent);
  fs.utimesSync(recentMarker, recent, recent);
  const id = randomUUID();
  runHook(home, { session_id: id, hook_event_name: 'SessionStart', cwd: 'C:\\repos\\p' });
  assert.equal(fs.existsSync(oldJsonl), false);
  assert.equal(fs.existsSync(oldMarker), false);
  assert.ok(fs.existsSync(recentJsonl));
  assert.ok(fs.existsSync(recentMarker));
  assert.ok(sessionFileExists(home, id));
});
