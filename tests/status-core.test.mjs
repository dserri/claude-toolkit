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

test('a session reports the latest Claude process id it recorded', () => {
  assert.equal(stateOf([at(90, 'SessionStart', { pid: 100 }), at(60, 'UserPromptSubmit', { promptId: 'p1', pid: 100 })]).pid, 100);
  assert.equal(stateOf([at(90, 'SessionStart')]).pid, undefined);
});

test('after /resume or /clear only the newest session of a process is kept; sessions without pid are untouched', () => {
  const session = (id, pid, lastEventAt) => ({ id, pid, lastEventAt });
  const kept = status.latestPerProcess([
    session('backoffices-claude', 7, 100),
    session('test-chat', 7, 200),
    session('other-tab', 8, 50),
    session('old-a', undefined, 10),
    session('old-b', undefined, 20),
  ]);

  assert.deepEqual(kept.map((entry) => entry.id), ['test-chat', 'other-tab', 'old-a', 'old-b']);
});

test('sessions whose Claude process ended are dropped; sessions without a process id stay', () => {
  const sessions = [{ id: 'live', pid: 1 }, { id: 'closed', pid: 2 }, { id: 'old', pid: undefined }];

  assert.deepEqual(status.dropEnded(sessions, (pid) => pid === 1).map((session) => session.id), ['live', 'old']);
});

test('order pruning drops ids of sessions that no longer exist and keeps titled names', () => {
  const sessions = [{ id: 'a' }, { id: 'b' }];

  assert.deepEqual(status.pruneOrderKeys(['id:a', 'rehlko-portal-tester', 'id:gone', 'id:b', 'api-coordinator'], sessions), ['id:a', 'rehlko-portal-tester', 'id:b', 'api-coordinator']);
});

test('order pruning keeps sessions whose files were briefly unreadable', () => {
  assert.deepEqual(status.pruneOrderKeys(['id:a', 'id:flaky', 'id:gone'], [{ id: 'a' }], new Set(['flaky'])), ['id:a', 'id:flaky']);
});

test('the plain tab follows a new session but keeps a name the developer typed', () => {
  const rename = (sessionName, lastApplied, tabName, otherTabNames = []) => status.plainTabRename({ sessionName, lastApplied, tabName, otherTabNames });

  assert.equal(rename('test-chat', undefined, 'claude'), 'test-chat');
  assert.equal(rename('test-chat', 'test-chat', 'my own name'), null);
  assert.equal(rename('other-chat', 'test-chat', 'my own name'), 'other-chat');
  assert.equal(rename('test-chat', undefined, 'test-chat'), null);
  assert.equal(rename(undefined, undefined, 'claude'), null);
  assert.equal(status.plainTabRename({ sessionName: 'backoffices-claude', lastApplied: undefined, tabName: 'claude', otherTabNames: [], defaultSessionName: 'backoffices-claude' }), null);
});

test('the plain tab never takes a reserved name or the name of another open tab', () => {
  const rename = (sessionName, otherTabNames = []) => status.plainTabRename({ sessionName, lastApplied: 'old', tabName: 'old', otherTabNames });

  assert.equal(rename('coordinator'), null);
  assert.equal(rename('claude'), null);
  assert.equal(rename('tester', ['coordinator', 'tester']), null);
  assert.equal(rename('test-chat', ['coordinator', 'tester']), 'test-chat');
});

test('a session is located by its process first, then by name', () => {
  const windows = [
    { pid: 10, folder: 'P:\\repos\\Rehlko\\backoffices', sessions: ['backoffices-claude'], pids: [7] },
    { pid: 20, folder: 'P:\\repos\\Rehlko\\api', sessions: ['api-coordinator'], pids: [9] },
  ];

  assert.equal(status.sessionLocation('test-chat', 10, windows, 7).kind, 'here');
  assert.equal(status.sessionLocation('test-chat', 20, windows, 7).window.pid, 10);
  assert.equal(status.sessionLocation('api-coordinator', 10, windows, undefined).window.pid, 20);
  assert.equal(status.sessionLocation('test-chat', 10, windows, 99).kind, 'none');
  assert.equal(status.sessionLocation('api-coordinator', 10, [{ pid: 20, folder: 'x', sessions: ['api-coordinator'] }], 9).window.pid, 20);
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

test('placed items keep the stored order, the rest follow by the fallback', () => {
  const items = ['idle', 'waiting', 'working', 'new'].map((name) => ({ name }));
  const ordered = status.applyOrder(items, ['working', 'idle', 'gone'], (item) => item.name, (first, second) => first.name.localeCompare(second.name));

  assert.deepEqual(ordered.map((item) => item.name), ['working', 'idle', 'new', 'waiting']);
  assert.deepEqual(status.applyOrder(items, [], (item) => item.name, () => 0).map((item) => item.name), ['idle', 'waiting', 'working', 'new']);
});

test('moving a key places it before the target, or last without one', () => {
  assert.deepEqual(status.moveBefore(['a', 'b', 'c', 'd'], 'd', 'b'), ['a', 'd', 'b', 'c']);
  assert.deepEqual(status.moveBefore(['a', 'b', 'c'], 'a', 'c'), ['b', 'a', 'c']);
  assert.deepEqual(status.moveBefore(['a', 'b', 'c'], 'a', undefined), ['b', 'c', 'a']);
  assert.deepEqual(status.moveBefore(['a', 'b'], 'x', 'b'), ['a', 'x', 'b']);
  assert.deepEqual(status.moveBefore(['a', 'b'], 'a', 'missing'), ['b', 'a']);
});

test('the developer order wins over urgency for projects and sessions; unplaced ones follow by urgency', () => {
  const card = (name, project, sessionStatus, since) => ({ name, titled: true, project, status: sessionStatus, since });
  const groups = status.groupByProject([
    card('portal-idle', 'rehlko-portal', 'idle', 1),
    card('portal-asks', 'rehlko-portal', 'question', 5),
    card('portal-new', 'rehlko-portal', 'permission', 9),
    card('api-work', 'api', 'working', 2),
    card('web-done', 'web', 'finished', 3),
  ]);
  const ordered = status.orderedGroups(groups, {
    projects: ['api', 'rehlko-portal'],
    sessions: { 'rehlko-portal': ['portal-idle', 'portal-asks'] },
  });

  assert.deepEqual(ordered.map((group) => group.project), ['api', 'rehlko-portal', 'web']);
  assert.deepEqual(ordered[1].sessions.map((session) => session.name), ['portal-idle', 'portal-asks', 'portal-new']);
  assert.deepEqual(status.orderedGroups(groups, {}).map((group) => group.project), ['rehlko-portal', 'web', 'api']);
});

test('a reorder keeps placed items that are not displayed, next to their stored neighbour', () => {
  assert.deepEqual(status.mergeOrder(['b', 'a'], ['a', 'x', 'b', 'y']), ['b', 'y', 'a', 'x']);
  assert.deepEqual(status.mergeOrder(['a', 'b'], ['gone', 'a']), ['gone', 'a', 'b']);
  assert.deepEqual(status.mergeOrder(['a'], []), ['a']);
  assert.deepEqual(status.moveBefore(status.mergeOrder(['b', 'a'], ['a', 'hidden', 'b']), 'b', 'a'), ['b', 'a', 'hidden']);
});

test('titled sessions are keyed by name, untitled ones by id, so twins never move together', () => {
  const twins = [
    { id: 'one', name: 'rehlko-portal', titled: false, status: 'working', since: 1 },
    { id: 'two', name: 'rehlko-portal', titled: false, status: 'working', since: 2 },
    { id: 'three', name: 'rehlko-portal-tester', titled: true, status: 'working', since: 3 },
  ];

  assert.deepEqual(twins.map(status.sessionKey), ['id:one', 'id:two', 'rehlko-portal-tester']);

  const keys = status.moveBefore(twins.map(status.sessionKey), 'id:two', 'id:one');
  const [group] = status.orderedGroups([{ project: 'rehlko-portal', sessions: twins, top: twins[0] }], { sessions: { 'rehlko-portal': keys } });

  assert.deepEqual(group.sessions.map((session) => session.id), ['two', 'one', 'three']);
});

test('one step up or down targets the right neighbour, and the ends do nothing', () => {
  const keys = ['a', 'b', 'c'];

  assert.equal(status.stepTarget(keys, 'b', -1), 'a');
  assert.equal(status.stepTarget(keys, 'a', 1), 'c');
  assert.equal(status.stepTarget(keys, 'b', 1), undefined);
  assert.equal(status.stepTarget(keys, 'a', -1), null);
  assert.equal(status.stepTarget(keys, 'c', 1), null);
  assert.equal(status.stepTarget(keys, 'x', 1), null);
  assert.deepEqual(status.moveBefore(keys, 'b', status.stepTarget(keys, 'b', 1)), ['a', 'c', 'b']);
  assert.deepEqual(status.moveBefore(keys, 'c', status.stepTarget(keys, 'c', -1)), ['a', 'c', 'b']);
});

test('hidden entries of unreadable files are kept', () => {
  const sessions = [{ id: 'a', lastEventAt: 100 }];

  assert.deepEqual(status.pruneHidden({ a: 100, flaky: 50, gone: 10 }, sessions, new Set(['flaky'])), { a: 100, flaky: 50 });
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
