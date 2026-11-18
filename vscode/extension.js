const vscode = require('vscode');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const core = require('./core');

let output;
let watching = false;

const ENABLED_FOLDERS = 'enabledFolders';

const coordDir = (folder) => path.join(folder, '.coord');

const enabledFolders = (context) => context.globalState.get(ENABLED_FOLDERS, []);

const isEnabled = (context, folder) => core.isEnabledFolder(enabledFolders(context), folder) && fs.existsSync(coordDir(folder));

const settings = (context) => {
  const config = vscode.workspace.getConfiguration('claudeToolkit');

  return {
    claudePath: config.get('claudePath') || 'claude',
    pluginDir: config.get('pluginDir') || core.defaultPluginDir(fs.realpathSync(context.extensionPath)),
  };
};

const openTabNames = () => vscode.window.terminals.map((terminal) => terminal.name);

const openTab = ({ name, args, folder, claudePath, beside }) => {
  if (openTabNames().includes(name))
    return;

  output.appendLine(`Opening ${name}: ${claudePath} ${JSON.stringify(args)}`);
  vscode.window.createTerminal(core.terminalOptions({ name, claudePath, args, folder, beside }));
};

const readSessionRecord = (folder, name) => {
  const recordFile = path.join(coordDir(folder), 'sessions', `${core.workerSessionName(folder, name)}.id`);

  return fs.existsSync(recordFile) ? fs.readFileSync(recordFile, 'utf8') : undefined;
};

const readActiveWorkers = (folder) => {
  const teamFile = path.join(coordDir(folder), 'team.json');

  if (!fs.existsSync(teamFile))
    return [];

  try {
    return core.activeWorkers(fs.readFileSync(teamFile, 'utf8'));
  } catch (error) {
    void vscode.window.showErrorMessage(`Claude Toolkit: cannot read .coord/team.json: ${error.message}`);

    return [];
  }
};

const rejectRequest = (requestsDir, fileName, result) => {
  const noteName = result.name ? `${result.name}.rejected.md` : `request-${Date.now()}.rejected.md`;

  fs.writeFileSync(path.join(requestsDir, noteName), `Request ${fileName} rejected: ${result.reason}\n`);
  output.appendLine(`Rejected ${fileName}: ${result.reason}`);
};

const handleRequest = (context, folder, file, { waitForWrite }) => {
  const fileName = path.basename(file);
  const requestsDir = path.dirname(file);
  let content;

  try {
    content = fs.readFileSync(file, 'utf8');
  } catch {
    return;
  }

  const result = core.validateRequest({
    fileName,
    content,
    openTabs: openTabNames(),
    briefExists: (name) => fs.existsSync(path.join(coordDir(folder), 'workers', name, 'brief.md')),
  });

  if (result.incomplete && waitForWrite) {
    output.appendLine(`Waiting for ${fileName} to be fully written.`);

    return;
  }

  fs.rmSync(file, { force: true });

  if (!result.ok) {
    rejectRequest(requestsDir, fileName, result);

    return;
  }

  fs.rmSync(path.join(requestsDir, `${result.name}.rejected.md`), { force: true });

  const { claudePath, pluginDir } = settings(context);
  const sessionRecord = readSessionRecord(folder, result.name);
  const args = core.requestedWorkerArgs({ projectFolder: folder, pluginDir, name: result.name, sessionRecord });

  openTab({ name: result.name, args, folder, claudePath, beside: true });
};

const watchRequests = (context, folder) => {
  const requestsDir = path.join(coordDir(folder), 'requests');

  fs.mkdirSync(requestsDir, { recursive: true });

  for (const fileName of fs.readdirSync(requestsDir).filter((entry) => entry.endsWith('.json')))
    handleRequest(context, folder, path.join(requestsDir, fileName), { waitForWrite: false });

  const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(requestsDir, '*.json'));
  const onWrite = (uri) => handleRequest(context, folder, uri.fsPath, { waitForWrite: true });

  watcher.onDidCreate(onWrite);
  watcher.onDidChange(onWrite);
  context.subscriptions.push(watcher);
};

const start = (context, folder) => {
  const { claudePath, pluginDir } = settings(context);
  const coordinatorArgs = core.coordinatorArgs({ projectFolder: folder, pluginDir });

  openTab({ name: core.COORDINATOR_TAB, args: coordinatorArgs, folder, claudePath, beside: false });

  for (const name of readActiveWorkers(folder)) {
    const sessionRecord = readSessionRecord(folder, name);
    const args = core.resumeWorkerArgs({ projectFolder: folder, pluginDir, name, sessionRecord });

    openTab({ name, args, folder, claudePath, beside: true });
  }

  if (!watching) {
    watchRequests(context, folder);
    watching = true;
  }
};

const excludeFile = (folder) => {
  try {
    const gitPath = execFileSync('git', ['-C', folder, 'rev-parse', '--git-path', 'info/exclude'], { cwd: os.homedir(), encoding: 'utf8' }).trim();

    return path.resolve(folder, gitPath);
  } catch {
    return undefined;
  }
};

const addGitExclude = (folder) => {
  const exclude = excludeFile(folder);

  if (!exclude)
    return;

  const current = fs.existsSync(exclude) ? fs.readFileSync(exclude, 'utf8') : '';
  const updated = core.withExcludeEntry(current);

  if (updated === current)
    return;

  fs.mkdirSync(path.dirname(exclude), { recursive: true });
  fs.writeFileSync(exclude, updated);
};

const enable = async (context, folder) => {
  await context.globalState.update(ENABLED_FOLDERS, core.withEnabledFolder(enabledFolders(context), folder));
  fs.mkdirSync(path.join(coordDir(folder), 'workers'), { recursive: true });

  const teamFile = path.join(coordDir(folder), 'team.json');

  if (!fs.existsSync(teamFile))
    fs.writeFileSync(teamFile, '[]\n');

  addGitExclude(folder);
  start(context, folder);
};

const projectFolder = () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

const withFolder = (action) => () => {
  const folder = projectFolder();

  if (!folder) {
    void vscode.window.showWarningMessage('Claude Toolkit: open a project folder first.');

    return;
  }

  return action(folder);
};

const startEnabled = (context, folder) => {
  if (!isEnabled(context, folder)) {
    void vscode.window.showWarningMessage('Claude Toolkit: this folder is not enabled. Run "Toolkit: Enable coordinator in this folder".');

    return;
  }

  start(context, folder);
};

const activate = (context) => {
  output = vscode.window.createOutputChannel('Claude Toolkit');
  context.subscriptions.push(
    output,
    vscode.commands.registerCommand('claudeToolkit.enable', withFolder((folder) => enable(context, folder))),
    vscode.commands.registerCommand('claudeToolkit.start', withFolder((folder) => startEnabled(context, folder))),
  );

  const folder = projectFolder();

  if (folder && isEnabled(context, folder))
    start(context, folder);
};

const deactivate = () => {};

module.exports = { activate, deactivate };
