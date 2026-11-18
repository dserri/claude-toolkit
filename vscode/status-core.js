const STATUS = {
  permission: { rank: 0, label: 'waiting for permission', color: 'charts.red' },
  question: { rank: 0, label: 'waiting for your answer', color: 'charts.red' },
  stuck: { rank: 1, label: 'possibly stuck', color: 'charts.purple' },
  finished: { rank: 2, label: 'finished, needs review', color: 'charts.yellow' },
  working: { rank: 3, label: 'working', color: 'charts.green' },
  idle: { rank: 4, label: 'idle', color: 'disabledForeground' },
};

const WAITING = new Set(['permission', 'question']);

const parseEvents = (text) => text
  .split('\n')
  .filter((line) => line.trim())
  .flatMap((line) => {
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  })
  .filter((event) => typeof event?.t === 'number' && typeof event.event === 'string')
  .sort((first, second) => first.t - second.t);

const belongsToCurrentTurn = (event, state) => {
  if (!event.promptId)
    return true;

  if (state.closedPrompts.has(event.promptId))
    return false;

  return !state.currentPrompt || event.promptId === state.currentPrompt;
};

const setStatus = (state, status, t) => {
  if (state.status !== status)
    state.since = t;

  state.status = status;
};

const applyEvent = (state, event) => {
  if (event.title)
    state.name = event.title;

  if (event.folder)
    state.folder ??= event.folder;

  if (event.event === 'SessionStart') {
    state.status ??= 'idle';
    state.since ??= event.t;

    return;
  }

  if (event.event === 'UserPromptSubmit') {
    state.currentPrompt = event.promptId;
    state.tool = undefined;
    setStatus(state, 'working', event.t);

    return;
  }

  if (!belongsToCurrentTurn(event, state))
    return;

  state.currentPrompt ??= event.promptId;

  if (event.event === 'PreToolUse' && event.tool === 'AskUserQuestion') {
    setStatus(state, 'question', event.t);

    return;
  }

  if (event.event === 'PermissionRequest') {
    state.tool = event.tool;
    setStatus(state, 'permission', event.t);

    return;
  }

  if (event.event === 'PostToolUse' || event.event === 'PostToolUseFailure') {
    state.tool = event.tool;
    setStatus(state, 'working', event.t);

    return;
  }

  if (event.event === 'Stop') {
    state.closedPrompts.add(event.promptId);
    state.tool = undefined;
    state.last = event.last;
    setStatus(state, event.asks ? 'question' : 'finished', event.t);
  }
};

const sessionState = ({ id, events, now, stuckMs }) => {
  const state = { id, closedPrompts: new Set() };
  const ordered = [...events].sort((first, second) => first.t - second.t);

  for (const event of ordered)
    applyEvent(state, event);

  const lastEventAt = ordered.at(-1)?.t;
  const stuck = state.status === 'working' && lastEventAt !== undefined && now - lastEventAt > stuckMs;

  return {
    id,
    titled: Boolean(state.name),
    name: state.name || state.folder || id.slice(0, 8),
    project: state.folder || 'unknown project',
    status: stuck ? 'stuck' : state.status ?? 'idle',
    since: stuck ? lastEventAt : state.since ?? lastEventAt ?? now,
    lastEventAt: lastEventAt ?? now,
    tool: state.tool,
    last: state.last ?? '',
  };
};

const byUrgency = (first, second) => {
  const rank = STATUS[first.status].rank - STATUS[second.status].rank;

  return rank !== 0 ? rank : first.since - second.since;
};

const formatDuration = (milliseconds) => {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));

  if (seconds < 60)
    return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60)
    return `${minutes}m`;

  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
};

const cardDescription = (session, now) => {
  const parts = [STATUS[session.status].label];

  if (session.tool && session.status === 'permission')
    parts.push(session.tool);

  if (session.tool && (session.status === 'working' || session.status === 'stuck'))
    parts.push(`after ${session.tool}`);

  parts.push(formatDuration(now - session.since));

  return parts.join(' · ');
};

const waitingCount = (sessions) => sessions.filter((session) => WAITING.has(session.status)).length;

const isVisible = (session, hiddenAt) => hiddenAt === undefined || session.lastEventAt > hiddenAt;

const applyOrder = (items, keys, keyOf, fallback) => {
  const position = new Map(keys.map((key, index) => [key, index]));
  const placed = items.filter((item) => position.has(keyOf(item))).sort((first, second) => position.get(keyOf(first)) - position.get(keyOf(second)));
  const rest = items.filter((item) => !position.has(keyOf(item))).sort(fallback);

  return [...placed, ...rest];
};

const moveBefore = (keys, moved, target) => {
  const without = keys.filter((key) => key !== moved);
  const index = target === undefined ? -1 : without.indexOf(target);

  return index === -1 ? [...without, moved] : [...without.slice(0, index), moved, ...without.slice(index)];
};

const mergeOrder = (displayed, stored) => {
  const merged = [...displayed];

  stored.forEach((key, index) => {
    if (merged.includes(key))
      return;

    const predecessor = stored.slice(0, index).reverse().find((candidate) => merged.includes(candidate));

    merged.splice(predecessor === undefined ? 0 : merged.indexOf(predecessor) + 1, 0, key);
  });

  return merged;
};

const stepTarget = (keys, key, step) => {
  const index = keys.indexOf(key);
  const destination = index + step;

  if (index === -1 || destination < 0 || destination >= keys.length)
    return null;

  return step < 0 ? keys[destination] : keys[destination + 1];
};

const sessionKey = (session) => (session.titled ? session.name : `id:${session.id}`);

const orderedGroups = (groups, order) => applyOrder(
  groups.map((group) => ({ ...group, sessions: applyOrder(group.sessions, order.sessions?.[group.project] ?? [], sessionKey, byUrgency) })),
  order.projects ?? [],
  (group) => group.project,
  byGroupUrgency,
);

const splitHidden = (sessions, hidden) => ({
  visible: sessions.filter((session) => isVisible(session, hidden[session.id])),
  hidden: sessions
    .filter((session) => !isVisible(session, hidden[session.id]))
    .sort((first, second) => second.lastEventAt - first.lastEventAt),
});

const pruneHidden = (hidden, sessions, unreadableIds = new Set()) => Object.fromEntries([
  ...sessions
    .filter((session) => hidden[session.id] !== undefined && !isVisible(session, hidden[session.id]))
    .map((session) => [session.id, hidden[session.id]]),
  ...[...unreadableIds].filter((id) => hidden[id] !== undefined).map((id) => [id, hidden[id]]),
]);

const latestPerTitle = (sessions) => {
  const latest = new Map();

  for (const session of sessions.filter((candidate) => candidate.titled)) {
    const current = latest.get(session.name);

    if (!current || session.lastEventAt > current.lastEventAt)
      latest.set(session.name, session);
  }

  return sessions.filter((session) => !session.titled || latest.get(session.name) === session);
};

const byGroupUrgency = (first, second) => byUrgency(first.top, second.top) || first.project.localeCompare(second.project);

const groupByProject = (sessions) => {
  const groups = new Map();

  for (const session of [...sessions].sort(byUrgency))
    groups.set(session.project, [...(groups.get(session.project) ?? []), session]);

  return [...groups.entries()]
    .map(([project, members]) => ({ project, sessions: members, top: members[0], waiting: waitingCount(members) }))
    .sort(byGroupUrgency);
};

const groupDescription = (group) => {
  const count = `${group.sessions.length} session${group.sessions.length === 1 ? '' : 's'}`;

  return group.waiting > 0 ? `${group.waiting} waiting · ${count}` : count;
};

const waitingSessions = (sessions) => sessions.filter((session) => WAITING.has(session.status)).sort(byUrgency);

const nextWaiting = (waiting, lastFocusedId) => {
  if (waiting.length === 0)
    return undefined;

  const index = waiting.findIndex((session) => session.id === lastFocusedId);

  return waiting[(index + 1) % waiting.length];
};

const clickAction = (location) => {
  if (location.kind === 'here')
    return 'show';

  return location.kind === 'other' ? 'raise' : 'message';
};

const liveWindows = (entries, isAlive) => entries.filter((entry) =>
  Number.isInteger(entry?.pid)
  && typeof entry.folder === 'string'
  && Array.isArray(entry.sessions)
  && isAlive(entry.pid));

const sessionLocation = (sessionName, ownPid, windows) => {
  const holder = windows.find((entry) => entry.sessions.includes(sessionName));

  if (!holder)
    return { kind: 'none' };

  return holder.pid === ownPid ? { kind: 'here', window: holder } : { kind: 'other', window: holder };
};

const locationLabel = (location) => {
  if (location.kind === 'here')
    return 'in this window';

  if (location.kind === 'other')
    return `in window ${location.window.folder.split(/[\\/]/).filter(Boolean).at(-1) ?? location.window.folder}`;

  return 'not in a toolkit tab';
};

module.exports = {
  STATUS,
  byUrgency,
  cardDescription,
  clickAction,
  nextWaiting,
  waitingSessions,
  formatDuration,
  groupByProject,
  groupDescription,
  isVisible,
  latestPerTitle,
  liveWindows,
  locationLabel,
  applyOrder,
  mergeOrder,
  moveBefore,
  sessionKey,
  stepTarget,
  orderedGroups,
  parseEvents,
  pruneHidden,
  sessionLocation,
  splitHidden,
  sessionState,
  waitingCount,
};
