const vscode = require('vscode');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const status = require('./status-core');
const registry = require('./registry');

const VIEW_ID = 'claudeToolkit.sessions';
const STALE_MS = 6 * 3_600_000;
const REFRESH_MS = 15_000;
const HIDDEN_SESSIONS = 'hiddenSessions';

const statusDir = () => path.join(os.homedir(), '.agent-status');
const sessionsDir = () => path.join(statusDir(), 'sessions');
const windowsDir = () => path.join(statusDir(), 'windows');
const focusDir = () => path.join(statusDir(), 'focus');
const ownWindowFile = () => path.join(windowsDir(), `${process.pid}.json`);
const focusFile = (pid) => path.join(focusDir(), `${pid}.json`);

const readText = (file) => {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
};

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
  const directory = sessionsDir();

  if (!fs.existsSync(directory))
    return [];

  return fs.readdirSync(directory)
    .filter((entry) => entry.endsWith('.jsonl'))
    .map((entry) => status.sessionState({
      id: entry.slice(0, -'.jsonl'.length),
      events: status.parseEvents(readText(path.join(directory, entry))),
      now,
      stuckMs,
    }))
    .filter((session) => now - session.lastEventAt <= STALE_MS);
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

    const all = status.latestPerTitle(readSessions(now, stuckMs));
    const stored = this.storedHidden();
    const hidden = status.pruneHidden(stored, all);

    if (Object.keys(hidden).length !== Object.keys(stored).length)
      void this.globalState.update(HIDDEN_SESSIONS, hidden);

    const split = status.splitHidden(all, hidden);

    this.sessions = split.visible;
    this.hiddenSessions = split.hidden;
    this.groups = status.groupByProject(this.sessions);
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

  storeHidden(hidden) {
    void this.globalState.update(HIDDEN_SESSIONS, hidden).then(() => this.refresh());
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
    const item = new vscode.TreeItem('Hidden', vscode.TreeItemCollapsibleState.Collapsed);

    item.id = 'hidden';
    item.description = `${group.sessions.length}`;
    item.tooltip = 'Sessions you hid or whose tab you closed. Use the eye button to show one again.';
    item.iconPath = new vscode.ThemeIcon('eye-closed');

    return item;
  }

  groupItem(group) {
    const item = new vscode.TreeItem(group.project, vscode.TreeItemCollapsibleState.Expanded);

    item.id = `project:${group.project}`;
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
    vscode.window.registerTreeDataProvider(VIEW_ID, provider),
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
