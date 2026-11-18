const vscode = require('vscode');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const status = require('./status-core');

const VIEW_ID = 'claudeToolkit.sessions';
const STALE_MS = 6 * 3_600_000;
const REFRESH_MS = 15_000;

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

const readJson = (file) => {
  try {
    return JSON.parse(readText(file));
  } catch {
    return undefined;
  }
};

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

const readWindows = () => {
  const directory = windowsDir();

  if (!fs.existsSync(directory))
    return [];

  const entries = fs.readdirSync(directory)
    .filter((entry) => entry.endsWith('.json'))
    .map((entry) => readJson(path.join(directory, entry)));
  const live = status.liveWindows(entries, isAlive);

  for (const entry of entries.filter((candidate) => Number.isInteger(candidate?.pid) && !live.includes(candidate)))
    fs.rmSync(path.join(directory, `${entry.pid}.json`), { force: true });

  return live;
};

class SessionsProvider {
  constructor(tabsBySession) {
    this.tabsBySession = tabsBySession;
    this.hidden = new Map();
    this.sessions = [];
    this.groups = [];
    this.windows = [];
    this.changed = new vscode.EventEmitter();
    this.onDidChangeTreeData = this.changed.event;
    this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.statusBar.command = `${VIEW_ID}.focus`;
  }

  refresh() {
    const now = Date.now();
    const stuckMs = vscode.workspace.getConfiguration('claudeToolkit').get('stuckMinutes', 10) * 60_000;

    this.now = now;
    this.windows = readWindows();
    this.sessions = status.latestPerTitle(readSessions(now, stuckMs)).filter((session) => status.isVisible(session, this.hidden.get(session.id)));
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

    fs.mkdirSync(windowsDir(), { recursive: true });
    fs.writeFileSync(ownWindowFile(), JSON.stringify(entry));
    this.refresh();
  }

  updateStatusBar() {
    const waiting = status.waitingCount(this.sessions);

    this.statusBar.text = waiting > 0 ? `$(bell-dot) ${waiting} waiting` : '$(check) none waiting';
    this.statusBar.tooltip = 'Claude sessions waiting for you';
    this.statusBar.backgroundColor = waiting > 0 ? new vscode.ThemeColor('statusBarItem.warningBackground') : undefined;
    this.statusBar.show();
  }

  hide(session) {
    this.hidden.set(session.id, session.lastEventAt);
    this.refresh();
  }

  hideSessionNamed(sessionName) {
    for (const session of this.sessions.filter((candidate) => candidate.name === sessionName))
      this.hidden.set(session.id, session.lastEventAt);

    this.refresh();
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

    if (location.kind === 'here') {
      this.showOwnTab(session.name);

      return;
    }

    if (location.kind === 'other') {
      fs.mkdirSync(focusDir(), { recursive: true });
      fs.writeFileSync(focusFile(location.window.pid), JSON.stringify({ session: session.name, at: Date.now() }));
      void vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(location.window.folder), { forceNewWindow: true });

      return;
    }

    void vscode.window.showInformationMessage(`${session.name} is not a toolkit tab in any VS Code window; it was started by hand.`);
  }

  receiveFocusRequest() {
    const file = focusFile(process.pid);
    const request = readJson(file);

    fs.rmSync(file, { force: true });

    if (typeof request?.session === 'string')
      this.showOwnTab(request.session);
  }

  getTreeItem(element) {
    return element.sessions ? this.groupItem(element) : this.sessionItem(element);
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
    item.contextValue = 'session';
    item.command = { command: 'claudeToolkit.focusSession', title: 'Show tab', arguments: [session] };

    return item;
  }

  getChildren(element) {
    return element ? element.sessions : this.groups;
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
  const provider = new SessionsProvider(tabsBySession);
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
