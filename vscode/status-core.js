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
    state.folder = event.folder;

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

const groupByProject = (sessions) => {
  const groups = new Map();

  for (const session of [...sessions].sort(byUrgency))
    groups.set(session.project, [...(groups.get(session.project) ?? []), session]);

  return [...groups.entries()]
    .map(([project, members]) => ({ project, sessions: members, top: members[0], waiting: waitingCount(members) }))
    .sort((first, second) => byUrgency(first.top, second.top) || first.project.localeCompare(second.project));
};

const groupDescription = (group) => {
  const count = `${group.sessions.length} session${group.sessions.length === 1 ? '' : 's'}`;

  return group.waiting > 0 ? `${group.waiting} waiting · ${count}` : count;
};

module.exports = {
  STATUS,
  byUrgency,
  cardDescription,
  formatDuration,
  groupByProject,
  groupDescription,
  isVisible,
  parseEvents,
  sessionState,
  waitingCount,
};
