const vscode = require('vscode');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const status = require('./status-core');

const VIEW_ID = 'claudeToolkit.sessions';
const STALE_MS = 6 * 3_600_000;
const REFRESH_MS = 15_000;

const sessionsDir = () => path.join(os.homedir(), '.agent-status', 'sessions');

const readSessionFile = (file) => {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
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
      events: status.parseEvents(readSessionFile(path.join(directory, entry))),
      now,
      stuckMs,
    }))
    .filter((session) => now - session.lastEventAt <= STALE_MS);
};

class SessionsProvider {
  constructor(tabsBySession) {
    this.tabsBySession = tabsBySession;
    this.hidden = new Map();
    this.sessions = [];
    this.groups = [];
    this.changed = new vscode.EventEmitter();
    this.onDidChangeTreeData = this.changed.event;
    this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.statusBar.command = `${VIEW_ID}.focus`;
  }

  refresh() {
    const now = Date.now();
    const stuckMs = vscode.workspace.getConfiguration('claudeToolkit').get('stuckMinutes', 10) * 60_000;

    this.now = now;
    this.sessions = readSessions(now, stuckMs).filter((session) => status.isVisible(session, this.hidden.get(session.id)));
    this.groups = status.groupByProject(this.sessions);
    this.updateStatusBar();
    this.changed.fire();
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

  focus(session) {
    const terminal = this.tabsBySession.get(session.name);

    if (terminal) {
      terminal.show(false);

      return;
    }

    void vscode.window.showInformationMessage(`${session.name} is not a tab of this window: it runs in another VS Code window or was started by hand.`);
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

    item.id = `session:${session.id}`;
    item.description = status.cardDescription(session, this.now);
    item.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor(look.color));
    item.tooltip = session.last ? `${look.label}\n${session.last}` : look.label;
    item.contextValue = 'session';
    item.command = { command: 'claudeToolkit.focusSession', title: 'Show tab', arguments: [session] };

    return item;
  }

  getChildren(element) {
    return element ? element.sessions : this.groups;
  }
}

const registerSessionsView = (context, tabsBySession) => {
  const provider = new SessionsProvider(tabsBySession);
  const directory = sessionsDir();

  fs.mkdirSync(directory, { recursive: true });

  const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.file(directory), '*.jsonl'));
  const refresh = () => provider.refresh();
  const timer = setInterval(refresh, REFRESH_MS);

  watcher.onDidCreate(refresh);
  watcher.onDidChange(refresh);
  watcher.onDidDelete(refresh);

  context.subscriptions.push(
    provider.statusBar,
    watcher,
    { dispose: () => clearInterval(timer) },
    vscode.window.registerTreeDataProvider(VIEW_ID, provider),
    vscode.commands.registerCommand('claudeToolkit.focusSession', (session) => provider.focus(session)),
    vscode.commands.registerCommand('claudeToolkit.hideSession', (session) => provider.hide(session)),
    vscode.window.onDidCloseTerminal((terminal) => {
      for (const [sessionName, tab] of tabsBySession) {
        if (tab !== terminal)
          continue;

        tabsBySession.delete(sessionName);
        provider.hideSessionNamed(sessionName);
      }
    }),
  );

  provider.refresh();
};

module.exports = { registerSessionsView };
