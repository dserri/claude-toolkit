const vscode = require('vscode');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const status = require('./status-core');
const registry = require('./registry');
const sessionFiles = require('./session-files');

const VIEW_ID = 'claudeToolkit.sessions';
const STALE_MS = 6 * 3_600_000;
const REFRESH_MS = 15_000;
const HIDDEN_SESSIONS = 'hiddenSessions';
const SESSION_ORDER = 'sessionOrder';
const DRAG_MIME = 'application/vnd.code.tree.claudetoolkit.sessions';

const statusDir = () => path.join(os.homedir(), '.agent-status');
const sessionsDir = () => path.join(statusDir(), 'sessions');
const windowsDir = () => path.join(statusDir(), 'windows');
const focusDir = () => path.join(statusDir(), 'focus');
const ownWindowFile = () => path.join(windowsDir(), `${process.pid}.json`);
const focusFile = (pid) => path.join(focusDir(), `${pid}.json`);

const writeFocusRequest = (pid, sessionName) => registry.writeAtomically(focusFile(pid), JSON.stringify({ session: sessionName, at: Date.now() }));

const isAlive = (pid) => {
  try {
    process.kill(pid, 0);

    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
};

const readSessions = (now, stuckMs) => {
  const { readable, unreadableIds } = sessionFiles.readSessionFiles(sessionsDir());
  const sessions = readable
    .map(({ id, events }) => status.sessionState({ id, events, now, stuckMs }))
    .filter((session) => now - session.lastEventAt <= STALE_MS);

  return { sessions, unreadableIds };
};

const readWindows = () => registry.readLiveWindows(windowsDir(), isAlive);

class SessionsProvider {
  constructor(tabsBySession, globalState) {
    this.tabsBySession = tabsBySession;
    this.globalState = globalState;
    this.sessions = [];
    this.hiddenSessions = [];
    this.groups = [];
    this.windows = [];
    this.changed = new vscode.EventEmitter();
    this.onDidChangeTreeData = this.changed.event;
    this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.statusBar.command = 'claudeToolkit.focusMostUrgent';
  }

  refresh() {
    const now = Date.now();
    const stuckMs = vscode.workspace.getConfiguration('claudeToolkit').get('stuckMinutes', 10) * 60_000;

    this.now = now;
    this.windows = readWindows();

    const { sessions, unreadableIds } = readSessions(now, stuckMs);
    const all = status.latestPerTitle(sessions);
    const stored = this.storedHidden();
    const hidden = status.pruneHidden(stored, all, unreadableIds);

    if (Object.keys(hidden).length !== Object.keys(stored).length)
      this.globalState.update(HIDDEN_SESSIONS, hidden).then(undefined, reportStorageError);

    const split = status.splitHidden(all, hidden);

    this.sessions = split.visible;
    this.hiddenSessions = split.hidden;
    this.groups = status.orderedGroups(status.groupByProject(this.sessions), this.globalState.get(SESSION_ORDER, {}));
    this.updateStatusBar();
    this.changed.fire();
  }

  publishWindow() {
    const entry = {
      pid: process.pid,
      folder: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '',
      sessions: [...this.tabsBySession.keys()],
    };

    registry.writeAtomically(ownWindowFile(), JSON.stringify(entry));
    this.refresh();
  }

  updateStatusBar() {
    const waiting = status.waitingCount(this.sessions);

    this.statusBar.text = waiting > 0 ? `$(bell-dot) ${waiting} waiting` : '$(check) none waiting';
    this.statusBar.tooltip = waiting > 0 ? 'Show the Claude session waiting longest' : 'Open Claude sessions';
    this.statusBar.backgroundColor = waiting > 0 ? new vscode.ThemeColor('statusBarItem.warningBackground') : undefined;
    this.statusBar.show();
  }

  storedHidden() {
    return this.globalState.get(HIDDEN_SESSIONS, {});
  }

  persist(key, value) {
    this.globalState.update(key, value).then(() => this.refresh(), reportStorageError);
  }

  storeHidden(hidden) {
    this.persist(HIDDEN_SESSIONS, hidden);
  }

  storeProjectOrder(moved, target) {
    const order = this.globalState.get(SESSION_ORDER, {});
    const keys = status.mergeOrder(this.groups.map((group) => group.project), order.projects ?? []);

    this.persist(SESSION_ORDER, { ...order, projects: status.moveBefore(keys, moved, target) });
  }

  storeSessionOrder(project, moved, target) {
    const group = this.groups.find((candidate) => candidate.project === project);

    if (!group)
      return;

    const order = this.globalState.get(SESSION_ORDER, {});
    const keys = status.mergeOrder(group.sessions.map(status.sessionKey), order.sessions?.[project] ?? []);

    this.persist(SESSION_ORDER, { ...order, sessions: { ...order.sessions, [project]: status.moveBefore(keys, moved, target) } });
  }

  drop(dragged, target) {
    if (!target || target.kind === 'hidden' || this.hiddenSessions.includes(target))
      return;

    if (dragged.kind === 'project' && target.sessions && target.project !== dragged.project)
      this.storeProjectOrder(dragged.project, target.project);
    else if (dragged.kind === 'session' && target.project === dragged.project)
      this.storeSessionOrder(dragged.project, dragged.key, target.sessions ? undefined : status.sessionKey(target));
  }

  move(element, step) {
    if (element.sessions) {
      const projects = this.groups.map((group) => group.project);
      const target = status.stepTarget(projects, element.project, step);

      if (target !== null)
        this.storeProjectOrder(element.project, target);

      return;
    }

    const group = this.groups.find((candidate) => candidate.project === element.project);

    if (!group)
      return;

    const key = status.sessionKey(element);
    const target = status.stepTarget(group.sessions.map(status.sessionKey), key, step);

    if (target !== null)
      this.storeSessionOrder(element.project, key, target);
  }

  resetOrder() {
    this.persist(SESSION_ORDER, {});
  }

  hide(session) {
    this.storeHidden({ ...this.storedHidden(), [session.id]: session.lastEventAt });
  }

  hideSessionNamed(sessionName) {
    const named = this.sessions.filter((candidate) => candidate.name === sessionName);

    this.storeHidden({ ...this.storedHidden(), ...Object.fromEntries(named.map((session) => [session.id, session.lastEventAt])) });
  }

  showAgain(session) {
    const { [session.id]: _shown, ...rest } = this.storedHidden();

    this.storeHidden(rest);
  }

  location(session) {
    return status.sessionLocation(session.name, process.pid, this.windows);
  }

  showOwnTab(sessionName) {
    const terminal = this.tabsBySession.get(sessionName);

    if (terminal)
      terminal.show(false);
  }

  focus(session) {
    const location = this.location(session);
    const action = status.clickAction(location);

    this.lastFocusedId = session.id;

    if (action === 'show') {
      this.showOwnTab(session.name);

      return;
    }

    if (action === 'raise') {
      writeFocusRequest(location.window.pid, session.name);
      void vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(location.window.folder), { forceNewWindow: true });

      return;
    }

    void vscode.window.showInformationMessage(`${session.name} is not a toolkit tab in any VS Code window; it was started by hand.`);
  }

  focusMostUrgent() {
    const [first] = status.waitingSessions(this.sessions);

    if (first) {
      this.focus(first);

      return;
    }

    void vscode.commands.executeCommand(`${VIEW_ID}.focus`);
  }

  focusNextWaiting() {
    const next = status.nextWaiting(status.waitingSessions(this.sessions), this.lastFocusedId);

    if (next) {
      this.focus(next);

      return;
    }

    void vscode.window.showInformationMessage('No Claude session is waiting for you.');
  }

  receiveFocusRequest() {
    const file = focusFile(process.pid);
    const request = registry.readJson(file);

    fs.rmSync(file, { force: true });

    if (typeof request?.session === 'string')
      this.showOwnTab(request.session);
  }

  getTreeItem(element) {
    if (element.kind === 'hidden')
      return this.hiddenGroupItem(element);

    return element.sessions ? this.groupItem(element) : this.sessionItem(element);
  }

  hiddenGroupItem(group) {
    const item = new vscode.TreeItem(`Hidden (${group.sessions.length})`, vscode.TreeItemCollapsibleState.Collapsed);

    item.id = 'hidden';
    item.tooltip = 'Sessions you hid or whose tab you closed. Use the eye button to show one again.';
    item.iconPath = new vscode.ThemeIcon('eye-closed');

    return item;
  }

  groupItem(group) {
    const item = new vscode.TreeItem(group.project, vscode.TreeItemCollapsibleState.Expanded);

    item.id = `project:${group.project}`;
    item.contextValue = 'project';
    item.description = status.groupDescription(group);
    item.iconPath = new vscode.ThemeIcon('folder', new vscode.ThemeColor(status.STATUS[group.top.status].color));

    return item;
  }

  sessionItem(session) {
    const item = new vscode.TreeItem(session.name);
    const look = status.STATUS[session.status];
    const where = status.locationLabel(this.location(session));

    item.id = `session:${session.id}`;
    item.description = status.cardDescription(session, this.now);
    item.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor(look.color));
    item.tooltip = [look.label, where, session.last].filter(Boolean).join('\n');
    item.contextValue = this.hiddenSessions.includes(session) ? 'hiddenSession' : 'session';
    item.command = { command: 'claudeToolkit.focusSession', title: 'Show tab', arguments: [session] };

    return item;
  }

  getChildren(element) {
    if (element)
      return element.sessions;

    return this.hiddenSessions.length > 0 ? [...this.groups, { kind: 'hidden', sessions: this.hiddenSessions }] : this.groups;
  }
}

const reportStorageError = (error) => {
  void vscode.window.showErrorMessage(`Claude Toolkit: could not save the session view state: ${error.message}`);
};

const dragAndDrop = (provider) => ({
  dragMimeTypes: [DRAG_MIME],
  dropMimeTypes: [DRAG_MIME],
  handleDrag: ([element], dataTransfer) => {
    if (!element || element.kind === 'hidden' || provider.hiddenSessions.includes(element))
      return;

    const dragged = element.sessions
      ? { kind: 'project', project: element.project }
      : { kind: 'session', project: element.project, key: status.sessionKey(element) };

    dataTransfer.set(DRAG_MIME, new vscode.DataTransferItem(JSON.stringify(dragged)));
  },
  handleDrop: async (target, dataTransfer) => {
    const item = dataTransfer.get(DRAG_MIME);

    if (item)
      provider.drop(JSON.parse(await item.asString()), target);
  },
});

const watch = (directory, pattern, onEvent) => {
  fs.mkdirSync(directory, { recursive: true });

  const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.file(directory), pattern));

  watcher.onDidCreate(onEvent);
  watcher.onDidChange(onEvent);
  watcher.onDidDelete(onEvent);

  return watcher;
};

const registerSessionsView = (context, tabsBySession) => {
  const provider = new SessionsProvider(tabsBySession, context.globalState);
  const refresh = () => provider.refresh();
  const timer = setInterval(refresh, REFRESH_MS);

  context.subscriptions.push(
    provider.statusBar,
    watch(sessionsDir(), '*.jsonl', refresh),
    watch(windowsDir(), '*.json', refresh),
    watch(focusDir(), `${process.pid}.json`, () => provider.receiveFocusRequest()),
    { dispose: () => clearInterval(timer) },
    { dispose: () => fs.rmSync(ownWindowFile(), { force: true }) },
    vscode.window.createTreeView(VIEW_ID, { treeDataProvider: provider, dragAndDropController: dragAndDrop(provider) }),
    vscode.commands.registerCommand('claudeToolkit.resetOrder', () => provider.resetOrder()),
    vscode.commands.registerCommand('claudeToolkit.moveUp', (element) => provider.move(element, -1)),
    vscode.commands.registerCommand('claudeToolkit.moveDown', (element) => provider.move(element, 1)),
    vscode.commands.registerCommand('claudeToolkit.focusSession', (session) => provider.focus(session)),
    vscode.commands.registerCommand('claudeToolkit.hideSession', (session) => provider.hide(session)),
    vscode.commands.registerCommand('claudeToolkit.showSessionAgain', (session) => provider.showAgain(session)),
    vscode.commands.registerCommand('claudeToolkit.focusMostUrgent', () => provider.focusMostUrgent()),
    vscode.commands.registerCommand('claudeToolkit.nextWaiting', () => provider.focusNextWaiting()),
    vscode.window.onDidCloseTerminal((terminal) => {
      for (const [sessionName, tab] of tabsBySession) {
        if (tab !== terminal)
          continue;

        tabsBySession.delete(sessionName);
        provider.hideSessionNamed(sessionName);
        provider.publishWindow();
      }
    }),
  );

  provider.publishWindow();

  return { publishWindow: () => provider.publishWindow() };
};

module.exports = { registerSessionsView };
