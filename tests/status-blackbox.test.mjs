import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, utimesSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import status from '../vscode/status-core.js';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const hookPath = join(repoRoot, 'status', 'status-hook.mjs');
const sid = '11111111-2222-4333-8444-555555555555';
const otherSid = '66666666-7777-4888-9999-aaaaaaaaaaaa';

function makeHome() {
  return mkdtempSync(join(tmpdir(), 'status-bb-'));
}

function sessionsDir(home) {
  return join(home, '.agent-status', 'sessions');
}

function sessionFile(home, id = sid) {
  return join(sessionsDir(home), `${id}.jsonl`);
}

function runHook(home, input, entrypoint = 'cli') {
  const env = { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_CODE_ENTRYPOINT: entrypoint };
  const raw = typeof input === 'string' ? input : JSON.stringify(input);
  const result = spawnSync(process.execPath, [hookPath], { input: raw, env, encoding: 'utf8' });
  assert.equal(result.status, 0, `exit code with stderr: ${result.stderr}`);
  assert.equal(result.stdout, '');
  return result;
}

function readLines(home, id = sid) {
  return readFileSync(sessionFile(home, id), 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
}

function event(name, extra = {}) {
  return { session_id: sid, hook_event_name: name, cwd: join('C:', 'work', 'my-project'), ...extra };
}

function stopWith(home, message) {
  runHook(home, event('Stop', { prompt_id: 'p1', last_assistant_message: message }));
  const lines = readLines(home);
  return lines[lines.length - 1];
}

describe('status-hook', () => {
  test('SessionStart writes a line with t, event, promptId, tool, title and folder', () => {
    const home = makeHome();
    runHook(home, event('SessionStart', { session_title: 'My title' }));
    const lines = readLines(home);
    assert.equal(lines.length, 1);
    const [line] = lines;
    assert.equal(typeof line.t, 'number');
    assert.ok(Math.abs(line.t - Date.now()) < 60000);
    assert.equal(line.event, 'SessionStart');
    assert.equal(line.promptId, undefined);
    assert.equal(line.tool, undefined);
    assert.equal(line.title, 'My title');
    assert.equal(line.folder, 'my-project');
    rmSync(home, { recursive: true, force: true });
  });

  test('other events append one line each with tool and promptId', () => {
    const home = makeHome();
    runHook(home, event('SessionStart'));
    runHook(home, event('PreToolUse', { prompt_id: 'p1', tool_name: 'Bash' }));
    runHook(home, event('PostToolUse', { prompt_id: 'p1', tool_name: 'Bash' }));
    const lines = readLines(home);
    assert.equal(lines.length, 3);
    assert.equal(lines[1].event, 'PreToolUse');
    assert.equal(lines[1].tool, 'Bash');
    assert.equal(lines[1].promptId, 'p1');
    assert.equal(lines[2].event, 'PostToolUse');
    rmSync(home, { recursive: true, force: true });
  });

  test('UserPromptSubmit keeps only the first line plus the new line, with folder', () => {
    const home = makeHome();
    runHook(home, event('SessionStart'));
    runHook(home, event('UserPromptSubmit', { prompt_id: 'p1' }));
    runHook(home, event('PreToolUse', { prompt_id: 'p1', tool_name: 'Read' }));
    runHook(home, event('Stop', { prompt_id: 'p1', last_assistant_message: 'ok' }));
    runHook(home, event('UserPromptSubmit', { prompt_id: 'p2' }));
    const lines = readLines(home);
    assert.equal(lines.length, 2);
    assert.equal(lines[0].event, 'SessionStart');
    assert.equal(lines[1].event, 'UserPromptSubmit');
    assert.equal(lines[1].promptId, 'p2');
    assert.equal(lines[1].folder, 'my-project');
    rmSync(home, { recursive: true, force: true });
  });

  test('Stop with STATUS: DONE excludes the marker and does not ask', () => {
    const home = makeHome();
    const line = stopWith(home, 'Work done.\nShall I continue?\nSTATUS: DONE');
    assert.equal(line.event, 'Stop');
    assert.equal(line.asks, false);
    assert.equal(line.last, 'Shall I continue?');
    rmSync(home, { recursive: true, force: true });
  });

  test('Stop with STATUS: QUESTION asks', () => {
    const home = makeHome();
    const line = stopWith(home, 'Pick one of the options.\nSTATUS: QUESTION');
    assert.equal(line.asks, true);
    assert.equal(line.last, 'Pick one of the options.');
    rmSync(home, { recursive: true, force: true });
  });

  test('Stop without marker asks exactly when the last non-empty line ends with ?', () => {
    const home = makeHome();
    const asking = stopWith(home, 'Done.\nShould I push?\n\n  \n');
    assert.equal(asking.asks, true);
    assert.equal(asking.last, 'Should I push?');
    const telling = stopWith(home, 'Is this fine?\nAll tests pass.');
    assert.equal(telling.asks, false);
    assert.equal(telling.last, 'All tests pass.');
    rmSync(home, { recursive: true, force: true });
  });

  test('hostile STATUS text in the middle of a message does not count', () => {
    const home = makeHome();
    const notAsking = stopWith(home, 'STATUS: QUESTION\nAll done.');
    assert.equal(notAsking.asks, false);
    assert.equal(notAsking.last, 'All done.');
    const asking = stopWith(home, 'STATUS: DONE\nReady to merge?');
    assert.equal(asking.asks, true);
    assert.equal(asking.last, 'Ready to merge?');
    rmSync(home, { recursive: true, force: true });
  });

  test('Stop last is cut to 200 characters', () => {
    const home = makeHome();
    const long = 'x'.repeat(500);
    const line = stopWith(home, `intro\n${long}`);
    assert.equal(typeof line.last, 'string');
    assert.ok(line.last.length <= 200);
    assert.ok(line.last.length > 0);
    assert.ok(long.startsWith(line.last.replace(/[.…]+$/, '')));
    rmSync(home, { recursive: true, force: true });
  });

  test('SessionEnd deletes the session file', () => {
    const home = makeHome();
    runHook(home, event('SessionStart'));
    assert.ok(existsSync(sessionFile(home)));
    runHook(home, event('SessionEnd'));
    assert.ok(!existsSync(sessionFile(home)));
    rmSync(home, { recursive: true, force: true });
  });

  test('SessionStart deletes other session files older than 6 hours only', () => {
    const home = makeHome();
    mkdirSync(sessionsDir(home), { recursive: true });
    const oldFile = sessionFile(home, otherSid);
    const freshId = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
    const freshFile = sessionFile(home, freshId);
    const line = JSON.stringify({ t: Date.now(), event: 'SessionStart' }) + '\n';
    writeFileSync(oldFile, line);
    writeFileSync(freshFile, line);
    const old = new Date(Date.now() - 7 * 3600 * 1000);
    utimesSync(oldFile, old, old);
    const recent = new Date(Date.now() - 5 * 3600 * 1000);
    utimesSync(freshFile, recent, recent);
    runHook(home, event('SessionStart'));
    assert.ok(!existsSync(oldFile));
    assert.ok(existsSync(freshFile));
    assert.ok(existsSync(sessionFile(home)));
    rmSync(home, { recursive: true, force: true });
  });

  test('headless sessions record nothing and create no files', () => {
    for (const entrypoint of ['sdk-cli', 'sdk-ts']) {
      const home = makeHome();
      runHook(home, event('SessionStart'), entrypoint);
      runHook(home, event('UserPromptSubmit', { prompt_id: 'p1' }), entrypoint);
      assert.deepEqual(readdirSync(home), []);
      rmSync(home, { recursive: true, force: true });
    }
  });

  test('missing or invalid session_id writes no session file and logs', () => {
    for (const bad of [undefined, 'not-a-uuid', '']) {
      const home = makeHome();
      const input = event('SessionStart');
      if (bad === undefined) {
        delete input.session_id;
      } else {
        input.session_id = bad;
      }
      runHook(home, input);
      const dir = sessionsDir(home);
      assert.ok(!existsSync(dir) || readdirSync(dir).length === 0);
      const log = join(home, '.agent-status', 'hook.log');
      assert.ok(existsSync(log));
      assert.ok(readFileSync(log, 'utf8').trim().length > 0);
      rmSync(home, { recursive: true, force: true });
    }
  });

  test('path-traversal session ids create no files outside the sessions folder', () => {
    for (const bad of ['../../evil', '..\\..\\evil', '../evil', `${sid}/../../evil`]) {
      const home = makeHome();
      const input = event('SessionStart');
      input.session_id = bad;
      runHook(home, input);
      assert.deepEqual(readdirSync(home), ['.agent-status']);
      const entries = readdirSync(join(home, '.agent-status')).sort();
      assert.ok(entries.every((e) => e === 'hook.log' || e === 'sessions'), entries.join(','));
      assert.ok(entries.includes('hook.log'));
      const dir = sessionsDir(home);
      assert.ok(!existsSync(dir) || readdirSync(dir).length === 0);
      assert.ok(!existsSync(join(dirname(home), 'evil.jsonl')));
      rmSync(home, { recursive: true, force: true });
    }
  });

  test('unreadable stdin writes no session file and appends to the log twice', () => {
    const home = makeHome();
    runHook(home, '{not json');
    runHook(home, '');
    const log = join(home, '.agent-status', 'hook.log');
    assert.ok(existsSync(log));
    assert.ok(readFileSync(log, 'utf8').split('\n').filter((l) => l.trim()).length >= 2);
    const dir = sessionsDir(home);
    assert.ok(!existsSync(dir) || readdirSync(dir).length === 0);
    rmSync(home, { recursive: true, force: true });
  });
});

const T0 = 1_700_000_000_000;

function ev(offsetMs, name, extra = {}) {
  return { t: T0 + offsetMs, event: name, ...extra };
}

function state(events, nowOffset = 1000, stuckMs = 10 * 60 * 1000) {
  return status.sessionState({ id: sid, events, now: T0 + nowOffset, stuckMs });
}

describe('status-core parseEvents', () => {
  test('skips unreadable and incomplete lines and sorts by t', () => {
    const text = [
      JSON.stringify({ t: 30, event: 'Stop' }),
      'garbage {',
      JSON.stringify({ t: '10', event: 'X' }),
      JSON.stringify({ t: 5 }),
      JSON.stringify({ t: 6, event: 7 }),
      '',
      JSON.stringify({ t: 10, event: 'SessionStart' }),
      JSON.stringify({ t: 20, event: 'UserPromptSubmit', promptId: 'p' })
    ].join('\n');
    const events = status.parseEvents(text);
    assert.deepEqual(events.map((e) => e.t), [10, 20, 30]);
    assert.deepEqual(events.map((e) => e.event), ['SessionStart', 'UserPromptSubmit', 'Stop']);
  });
});

describe('status-core sessionState', () => {
  test('returns the documented fields', () => {
    const s = state([ev(0, 'SessionStart', { folder: 'proj' })]);
    for (const key of ['id', 'name', 'project', 'status', 'since', 'lastEventAt', 'tool', 'last']) {
      assert.ok(key in s, key);
    }
    assert.equal(s.id, sid);
    assert.equal(s.status, 'idle');
    assert.equal(s.since, T0);
    assert.equal(s.lastEventAt, T0);
  });

  test('name and project fallbacks', () => {
    const titled = state([ev(0, 'SessionStart', { folder: 'a' }), ev(10, 'UserPromptSubmit', { folder: 'b', title: 'T1', promptId: 'p' }), ev(20, 'PostToolUse', { title: 'T2', promptId: 'p' })]);
    assert.equal(titled.name, 'T2');
    assert.equal(titled.project, 'b');
    const foldered = state([ev(0, 'SessionStart', { folder: 'a' }), ev(10, 'UserPromptSubmit', { folder: 'b', promptId: 'p' })]);
    assert.equal(foldered.name, 'b');
    const bare = state([ev(0, 'SessionStart')]);
    assert.equal(bare.name, sid.slice(0, 8));
    assert.equal(bare.project, 'unknown project');
  });

  test('turn transitions', () => {
    const base = [ev(0, 'SessionStart'), ev(100, 'UserPromptSubmit', { promptId: 'p1' })];
    let s = state(base);
    assert.equal(s.status, 'working');
    assert.equal(s.since, T0 + 100);
    s = state([...base, ev(200, 'PreToolUse', { promptId: 'p1', tool: 'AskUserQuestion' })]);
    assert.equal(s.status, 'question');
    assert.equal(s.since, T0 + 200);
    s = state([...base, ev(200, 'PermissionRequest', { promptId: 'p1', tool: 'Bash' })]);
    assert.equal(s.status, 'permission');
    assert.equal(s.tool, 'Bash');
    s = state([...base, ev(200, 'PermissionRequest', { promptId: 'p1', tool: 'Bash' }), ev(300, 'PostToolUse', { promptId: 'p1', tool: 'Bash' })]);
    assert.equal(s.status, 'working');
    assert.equal(s.tool, 'Bash');
    s = state([...base, ev(200, 'PermissionRequest', { promptId: 'p1', tool: 'Edit' }), ev(300, 'PostToolUseFailure', { promptId: 'p1', tool: 'Edit' })]);
    assert.equal(s.status, 'working');
    assert.equal(s.tool, 'Edit');
    s = state([...base, ev(300, 'Stop', { promptId: 'p1', asks: true, last: 'Go?' })]);
    assert.equal(s.status, 'question');
    assert.equal(s.last, 'Go?');
    s = state([...base, ev(300, 'Stop', { promptId: 'p1', asks: false, last: 'Done.' })]);
    assert.equal(s.status, 'finished');
    assert.equal(s.since, T0 + 300);
  });

  test('events sorted out of order are evaluated in time order', () => {
    const s = state([ev(300, 'Stop', { promptId: 'p1', asks: false }), ev(0, 'SessionStart'), ev(100, 'UserPromptSubmit', { promptId: 'p1' })]);
    assert.equal(s.status, 'finished');
  });

  test('a PostToolUse after its turn Stop does not reopen it', () => {
    const s = state([
      ev(0, 'SessionStart'),
      ev(100, 'UserPromptSubmit', { promptId: 'p1' }),
      ev(200, 'Stop', { promptId: 'p1', asks: false }),
      ev(300, 'PostToolUse', { promptId: 'p1', tool: 'Bash' })
    ]);
    assert.equal(s.status, 'finished');
    assert.equal(s.since, T0 + 200);
  });

  test('a PermissionRequest of an earlier turn after a new prompt does not change status', () => {
    const s = state([
      ev(0, 'SessionStart'),
      ev(100, 'UserPromptSubmit', { promptId: 'p1' }),
      ev(200, 'UserPromptSubmit', { promptId: 'p2' }),
      ev(300, 'PermissionRequest', { promptId: 'p1', tool: 'Bash' })
    ]);
    assert.equal(s.status, 'working');
    assert.notEqual(s.tool, 'Bash');
  });

  test('working beyond stuckMs becomes stuck since the last event', () => {
    const events = [ev(0, 'SessionStart'), ev(100, 'UserPromptSubmit', { promptId: 'p1' }), ev(200, 'PostToolUse', { promptId: 'p1', tool: 'Bash' })];
    const stuck = status.sessionState({ id: sid, events, now: T0 + 200 + 5001, stuckMs: 5000 });
    assert.equal(stuck.status, 'stuck');
    assert.equal(stuck.since, T0 + 200);
    const fine = status.sessionState({ id: sid, events, now: T0 + 200 + 4000, stuckMs: 5000 });
    assert.equal(fine.status, 'working');
    const finished = status.sessionState({ id: sid, events: [...events, ev(300, 'Stop', { promptId: 'p1', asks: false })], now: T0 + 1e9, stuckMs: 5000 });
    assert.equal(finished.status, 'finished');
  });
});

function session(id, project, st, since, lastEventAt = since) {
  return { id, name: id, project, status: st, since, lastEventAt, tool: null, last: '' };
}

describe('status-core ordering and grouping', () => {
  test('byUrgency orders by status then older since first', () => {
    const list = [
      session('idle', 'p', 'idle', 1),
      session('working', 'p', 'working', 1),
      session('finished', 'p', 'finished', 1),
      session('stuck', 'p', 'stuck', 1),
      session('questionNew', 'p', 'question', 50),
      session('permissionOld', 'p', 'permission', 10)
    ];
    const sorted = [...list].sort(status.byUrgency).map((s) => s.id);
    assert.deepEqual(sorted, ['permissionOld', 'questionNew', 'stuck', 'finished', 'working', 'idle']);
    const ties = [session('b', 'p', 'working', 20), session('a', 'p', 'working', 10)].sort(status.byUrgency).map((s) => s.id);
    assert.deepEqual(ties, ['a', 'b']);
  });

  test('waitingCount counts permission and question', () => {
    const list = [session('a', 'p', 'permission', 1), session('b', 'p', 'question', 1), session('c', 'p', 'stuck', 1), session('d', 'p', 'finished', 1)];
    assert.equal(status.waitingCount(list), 2);
    assert.equal(status.waitingCount([]), 0);
  });

  test('groupByProject sorts sessions and groups', () => {
    const list = [
      session('z1', 'zeta', 'idle', 1),
      session('a1', 'alpha', 'working', 1),
      session('a2', 'alpha', 'question', 5),
      session('b1', 'beta', 'working', 1),
      session('m1', 'mu', 'idle', 1)
    ];
    const groups = status.groupByProject(list);
    assert.deepEqual(groups.map((g) => g.project), ['alpha', 'beta', 'mu', 'zeta']);
    const alpha = groups[0];
    assert.deepEqual(alpha.sessions.map((s) => s.id), ['a2', 'a1']);
    assert.equal(alpha.top.id, 'a2');
    assert.equal(alpha.waiting, 1);
    assert.equal(groups[1].waiting, 0);
  });

  test('groupDescription', () => {
    const groups = status.groupByProject([
      session('a1', 'alpha', 'question', 1),
      session('a2', 'alpha', 'permission', 1),
      session('a3', 'alpha', 'idle', 1),
      session('b1', 'beta', 'idle', 1),
      session('c1', 'gamma', 'working', 1),
      session('c2', 'gamma', 'idle', 1)
    ]);
    const byName = Object.fromEntries(groups.map((g) => [g.project, g]));
    assert.equal(status.groupDescription(byName.alpha), '2 waiting · 3 sessions');
    assert.equal(status.groupDescription(byName.beta), '1 session');
    assert.equal(status.groupDescription(byName.gamma), '2 sessions');
  });
});

describe('status-core formatting', () => {
  test('formatDuration', () => {
    assert.equal(status.formatDuration(45 * 1000), '45s');
    assert.equal(status.formatDuration(12 * 60 * 1000), '12m');
    assert.equal(status.formatDuration((2 * 60 + 5) * 60 * 1000), '2h 05m');
    assert.equal(status.formatDuration(-5000), '0s');
  });

  test('cardDescription labels, tool and duration', () => {
    const now = T0 + 45 * 1000;
    const make = (st, tool) => ({ ...session('x', 'p', st, T0), tool });
    assert.equal(status.cardDescription(make('working', 'Bash'), now), 'working · after Bash · 45s');
    assert.equal(status.cardDescription(make('stuck', 'Bash'), now), 'possibly stuck · after Bash · 45s');
    assert.equal(status.cardDescription(make('permission', 'Edit'), now), 'waiting for permission · Edit · 45s');
    assert.equal(status.cardDescription(make('question', 'Bash'), now), 'waiting for your answer · 45s');
    assert.equal(status.cardDescription(make('finished', 'Bash'), now), 'finished, needs review · 45s');
    assert.equal(status.cardDescription(make('idle', 'Bash'), now), 'idle · 45s');
  });

  test('isVisible', () => {
    const s = session('x', 'p', 'idle', 1, 100);
    assert.equal(status.isVisible(s, undefined), true);
    assert.equal(status.isVisible(s, 99), true);
    assert.equal(status.isVisible(s, 100), false);
    assert.equal(status.isVisible(s, 200), false);
  });
});
