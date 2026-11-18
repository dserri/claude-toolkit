import { test } from 'node:test';
import assert from 'node:assert/strict';
import status from '../vscode/status-core.js';

const now = 1_000_000_000;
const stuckMs = 10 * 60_000;
const id = '7fa97870-6578-4ed2-b7c9-1dc4c9a2ef09';

const at = (secondsAgo, event, extra = {}) => ({ t: now - secondsAgo * 1000, event, ...extra });
const stateOf = (events) => status.sessionState({ id, events: [...events].sort((first, second) => first.t - second.t), now, stuckMs });

test('a fresh session is idle and named after its title, else its folder', () => {
  assert.equal(stateOf([at(60, 'SessionStart', { title: 'portal-tester', folder: 'rehlko-portal' })]).name, 'portal-tester');

  const session = stateOf([at(60, 'SessionStart', { folder: 'rehlko-portal' })]);

  assert.equal(session.name, 'rehlko-portal');
  assert.equal(session.status, 'idle');
});

test('a prompt and its tools mean working, with the current tool', () => {
  const session = stateOf([
    at(90, 'SessionStart'),
    at(60, 'UserPromptSubmit', { promptId: 'p1' }),
    at(30, 'PostToolUse', { promptId: 'p1', tool: 'Bash' }),
  ]);

  assert.equal(session.status, 'working');
  assert.equal(session.tool, 'Bash');
  assert.equal(session.since, now - 60_000);
});

test('a permission request waits for the developer, and the next tool result returns to working', () => {
  const waiting = [at(60, 'UserPromptSubmit', { promptId: 'p1' }), at(40, 'PermissionRequest', { promptId: 'p1', tool: 'Edit' })];

  assert.equal(stateOf(waiting).status, 'permission');
  assert.equal(stateOf([...waiting, at(10, 'PostToolUse', { promptId: 'p1', tool: 'Edit' })]).status, 'working');
});

test('AskUserQuestion and asking stops wait for an answer; other stops need review', () => {
  assert.equal(stateOf([at(60, 'UserPromptSubmit', { promptId: 'p1' }), at(5, 'PreToolUse', { promptId: 'p1', tool: 'AskUserQuestion' })]).status, 'question');
  assert.equal(stateOf([at(60, 'UserPromptSubmit', { promptId: 'p1' }), at(5, 'Stop', { promptId: 'p1', asks: true, last: 'Which one?' })]).status, 'question');

  const finished = stateOf([at(60, 'UserPromptSubmit', { promptId: 'p1' }), at(5, 'Stop', { promptId: 'p1', asks: false, last: 'All tests pass.' })]);

  assert.equal(finished.status, 'finished');
  assert.equal(finished.last, 'All tests pass.');
});

test('a tool event of a turn recorded after its stop does not reopen it', () => {
  const session = stateOf([
    at(60, 'UserPromptSubmit', { promptId: 'p1' }),
    at(20, 'Stop', { promptId: 'p1', asks: false, last: 'Done.' }),
    at(19, 'PostToolUse', { promptId: 'p1', tool: 'Bash' }),
  ]);

  assert.equal(session.status, 'finished');
});

test('late events of an earlier turn do not change the current one', () => {
  const session = stateOf([
    at(60, 'UserPromptSubmit', { promptId: 'p1' }),
    at(30, 'UserPromptSubmit', { promptId: 'p2' }),
    at(20, 'PermissionRequest', { promptId: 'p1', tool: 'Bash' }),
  ]);

  assert.equal(session.status, 'working');
});

test('a working session without events past the threshold is possibly stuck, keeping its tool', () => {
  const session = stateOf([at(1200, 'UserPromptSubmit', { promptId: 'p1' }), at(700, 'PostToolUse', { promptId: 'p1', tool: 'Bash' })]);

  assert.equal(session.status, 'stuck');
  assert.equal(session.tool, 'Bash');
  assert.equal(status.cardDescription(session, now), 'possibly stuck · after Bash · 11m');
  assert.equal(status.cardDescription({ status: 'permission', tool: 'Edit', since: now - 5000 }, now), 'waiting for permission · Edit · 5s');
  assert.equal(status.cardDescription({ status: 'finished', tool: 'Bash', since: now - 5000 }, now), 'finished, needs review · 5s');
  assert.equal(stateOf([at(1200, 'UserPromptSubmit', { promptId: 'p1' }), at(500, 'PostToolUse', { promptId: 'p1', tool: 'Bash' })]).status, 'working');
});

test('unreadable lines are skipped and lines are ordered by time', () => {
  const events = status.parseEvents('{"t":2,"event":"Stop"}\nnot json\n\n{"t":1,"event":"SessionStart"}\n{"event":"NoTime"}\n');

  assert.deepEqual(events.map((event) => event.event), ['SessionStart', 'Stop']);
});

test('cards are sorted with waiting sessions first, longest waiting first, then stuck, finished, working, idle', () => {
  const card = (name, sessionStatus, since) => ({ name, status: sessionStatus, since });
  const sorted = [
    card('idle', 'idle', 1),
    card('working', 'working', 1),
    card('question-new', 'question', 50),
    card('finished', 'finished', 1),
    card('permission-old', 'permission', 10),
    card('stuck', 'stuck', 1),
  ].sort(status.byUrgency);

  assert.deepEqual(sorted.map((session) => session.name), ['permission-old', 'question-new', 'stuck', 'finished', 'working', 'idle']);
  assert.equal(status.waitingCount(sorted), 2);
});

test('sessions are grouped by project, the most urgent project first, each sorted by urgency', () => {
  const card = (name, project, sessionStatus, since) => ({ name, project, status: sessionStatus, since });
  const groups = status.groupByProject([
    card('api-worker', 'api', 'working', 5),
    card('portal-idle', 'rehlko-portal', 'idle', 1),
    card('portal-asks', 'rehlko-portal', 'question', 20),
    card('api-done', 'api', 'finished', 3),
    card('portal-perm', 'rehlko-portal', 'permission', 10),
  ]);

  assert.deepEqual(groups.map((group) => group.project), ['rehlko-portal', 'api']);
  assert.deepEqual(groups[0].sessions.map((session) => session.name), ['portal-perm', 'portal-asks', 'portal-idle']);
  assert.deepEqual(groups[1].sessions.map((session) => session.name), ['api-done', 'api-worker']);
  assert.equal(groups[0].top.name, 'portal-perm');
  assert.equal(status.groupDescription(groups[0]), '2 waiting · 3 sessions');
  assert.equal(status.groupDescription({ sessions: [card('a', 'x', 'working', 1)], waiting: 0 }), '1 session');
});

test('a session takes its project from the first folder recorded, or a placeholder', () => {
  assert.equal(stateOf([at(60, 'UserPromptSubmit', { promptId: 'p1', folder: 'rehlko-portal' })]).project, 'rehlko-portal');
  assert.equal(stateOf([
    at(90, 'SessionStart', { folder: 'rehlko-portal', title: 'rehlko-portal-coordinator' }),
    at(60, 'UserPromptSubmit', { promptId: 'p1', folder: '.coord' }),
  ]).project, 'rehlko-portal');
  assert.equal(stateOf([at(60, 'PostToolUse', { promptId: 'p1', tool: 'Bash' })]).project, 'unknown project');
});

test('only the latest session per title is kept; untitled sessions are never merged', () => {
  const session = (sessionId, name, titled, lastEventAt) => ({ id: sessionId, name, titled, lastEventAt });
  const kept = status.latestPerTitle([
    session('old', 'rehlko-portal-coordinator', true, 100),
    session('new', 'rehlko-portal-coordinator', true, 200),
    session('tester', 'rehlko-portal-tester', true, 50),
    session('plain-1', 'rehlko-portal', false, 10),
    session('plain-2', 'rehlko-portal', false, 20),
  ]);

  assert.deepEqual(kept.map((entry) => entry.id), ['new', 'tester', 'plain-1', 'plain-2']);
});

test('a titled session reports it, a folder-named one does not', () => {
  assert.equal(stateOf([at(60, 'SessionStart', { title: 'portal-tester', folder: 'portal' })]).titled, true);
  assert.equal(stateOf([at(60, 'SessionStart', { folder: 'portal' })]).titled, false);
});

test('waiting sessions come in urgency order and the next one wraps around', () => {
  const session = (id, sessionStatus, since) => ({ id, status: sessionStatus, since });
  const waiting = status.waitingSessions([
    session('working', 'working', 1),
    session('question-new', 'question', 30),
    session('permission-old', 'permission', 10),
    session('finished', 'finished', 1),
  ]);

  assert.deepEqual(waiting.map((entry) => entry.id), ['permission-old', 'question-new']);
  assert.equal(status.nextWaiting(waiting, undefined).id, 'permission-old');
  assert.equal(status.nextWaiting(waiting, 'permission-old').id, 'question-new');
  assert.equal(status.nextWaiting(waiting, 'question-new').id, 'permission-old');
  assert.equal(status.nextWaiting(waiting, 'gone').id, 'permission-old');
  assert.equal(status.nextWaiting([], 'permission-old'), undefined);
});

test('a click shows an own tab, raises another window, or explains', () => {
  assert.equal(status.clickAction({ kind: 'here' }), 'show');
  assert.equal(status.clickAction({ kind: 'other', window: { pid: 2 } }), 'raise');
  assert.equal(status.clickAction({ kind: 'none' }), 'message');
});

test('only well-formed entries of running windows count', () => {
  const entries = [
    { pid: 10, folder: 'P:\\repos\\Rehlko\\rehlko-portal', sessions: ['rehlko-portal-coordinator'] },
    { pid: 20, folder: 'P:\\repos\\Rehlko\\api', sessions: ['api-coordinator'] },
    { pid: 30, folder: 'P:\\repos\\gone', sessions: [] },
    { pid: '40', folder: 'x', sessions: [] },
    { pid: 50, sessions: [] },
    null,
  ];

  assert.deepEqual(status.liveWindows(entries, (pid) => pid !== 30).map((entry) => entry.pid), [10, 20]);
});

test('a session is located in this window, another window, or none', () => {
  const windows = [
    { pid: 10, folder: 'P:\\repos\\Rehlko\\rehlko-portal', sessions: ['rehlko-portal-coordinator', 'rehlko-portal-tester'] },
    { pid: 20, folder: 'P:\\repos\\Rehlko\\api', sessions: ['api-coordinator'] },
  ];
  const here = status.sessionLocation('rehlko-portal-tester', 10, windows);
  const other = status.sessionLocation('api-coordinator', 10, windows);
  const none = status.sessionLocation('vs-code skill upgrade', 10, windows);

  assert.equal(here.kind, 'here');
  assert.equal(other.kind, 'other');
  assert.equal(other.window.pid, 20);
  assert.equal(none.kind, 'none');
  assert.equal(status.locationLabel(here), 'in this window');
  assert.equal(status.locationLabel(other), 'in window api');
  assert.equal(status.locationLabel({ kind: 'other', window: { folder: '/home/dev/app/' } }), 'in window app');
  assert.equal(status.locationLabel(none), 'not in a toolkit tab');
});

test('durations read as seconds, minutes, then hours and minutes', () => {
  assert.equal(status.formatDuration(45_000), '45s');
  assert.equal(status.formatDuration(12 * 60_000), '12m');
  assert.equal(status.formatDuration((2 * 60 + 5) * 60_000), '2h 05m');
  assert.equal(status.formatDuration(-5), '0s');
});

test('hidden sessions are split out, newest first, and come back with a newer event', () => {
  const sessions = [
    { id: 'a', lastEventAt: 100 },
    { id: 'b', lastEventAt: 300 },
    { id: 'c', lastEventAt: 200 },
    { id: 'd', lastEventAt: 500 },
  ];
  const { visible, hidden } = status.splitHidden(sessions, { b: 300, c: 200, d: 400 });

  assert.deepEqual(visible.map((session) => session.id), ['a', 'd']);
  assert.deepEqual(hidden.map((session) => session.id), ['b', 'c']);
  assert.deepEqual(status.splitHidden(sessions, {}).hidden, []);
});

test('pruning keeps only hidden entries of existing sessions without newer events', () => {
  const sessions = [{ id: 'a', lastEventAt: 100 }, { id: 'b', lastEventAt: 300 }];

  assert.deepEqual(status.pruneHidden({ a: 100, b: 200, gone: 50 }, sessions), { a: 100 });
  assert.deepEqual(status.pruneHidden({}, sessions), {});
});

test('a hidden card comes back only with a newer event', () => {
  assert.equal(status.isVisible({ lastEventAt: 100 }, undefined), true);
  assert.equal(status.isVisible({ lastEventAt: 100 }, 100), false);
  assert.equal(status.isVisible({ lastEventAt: 101 }, 100), true);
});

test('every status has a label and a theme colour', () => {
  for (const [name, look] of Object.entries(status.STATUS)) {
    assert.match(look.label, /\w/, name);
    assert.match(look.color, /^[a-zA-Z.]+$/, name);
  }
});
