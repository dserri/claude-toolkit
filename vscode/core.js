const path = require('node:path');

const WORKER_NAME = /^[a-z0-9][a-z0-9-]{0,39}$/;
const REQUEST_FILE = /^([^/\\]+)\.json$/;
const COORDINATOR_TAB = 'coordinator';
const COORDINATOR_PROMPT = 'Start-up: report the team recap if one is in your context, then read the board in .coord/ and summarize the open work and what you need from me.';
const EXCLUDE_ENTRY = '.coord/';
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PREFIX_LENGTH = 50;
const FIRST_COLUMN = 1;
const SECOND_COLUMN = 2;

const isWorkerName = (name) => typeof name === 'string' && WORKER_NAME.test(name) && name !== COORDINATOR_TAB;

const trimHyphens = (value) => value.replace(/^-+|-+$/g, '');

const sessionPrefix = (projectFolder) => {
  const safeName = trimHyphens(path.basename(projectFolder).toLowerCase().replace(/[^a-z0-9]+/g, '-'));
  const prefix = trimHyphens(safeName.slice(0, MAX_PREFIX_LENGTH));

  return prefix || 'project';
};

const assertWorkerName = (name) => {
  if (!isWorkerName(name))
    throw new Error(`Invalid worker name: ${JSON.stringify(name)}`);
};

const workerSessionName = (projectFolder, name) => {
  assertWorkerName(name);

  return `${sessionPrefix(projectFolder)}-${name}`;
};

const commonArgs = (pluginDir) => ['--plugin-dir', pluginDir, '--permission-mode', 'auto'];

const coordinatorSessionName = (projectFolder) => `${sessionPrefix(projectFolder)}-coordinator`;

const coordinatorArgs = ({ projectFolder, pluginDir }) => [
  ...commonArgs(pluginDir),
  '--agent', 'toolkit:coordinator',
  '--name', coordinatorSessionName(projectFolder),
  COORDINATOR_PROMPT,
];

const newWorkerArgs = ({ projectFolder, pluginDir, name }) => [
  ...commonArgs(pluginDir),
  '--agent', 'toolkit:worker',
  '--name', workerSessionName(projectFolder, name),
  `Read .coord/workers/${name}/brief.md and follow it.`,
];

const recordedSessionId = (sessionRecord) => {
  const sessionId = sessionRecord?.trim();

  return SESSION_ID.test(sessionId ?? '') ? sessionId : undefined;
};

const resumeWorkerArgs = ({ projectFolder, pluginDir, name, sessionRecord }) => {
  const sessionName = workerSessionName(projectFolder, name);

  return [
    '--resume', recordedSessionId(sessionRecord) ?? sessionName,
    ...commonArgs(pluginDir),
    '--agent', 'toolkit:worker',
  ];
};

const requestedWorkerArgs = ({ projectFolder, pluginDir, name, sessionRecord }) => {
  const sessionId = recordedSessionId(sessionRecord);

  if (!sessionId)
    return newWorkerArgs({ projectFolder, pluginDir, name });

  assertWorkerName(name);

  return [
    '--resume', sessionId,
    ...commonArgs(pluginDir),
    '--agent', 'toolkit:worker',
    `Read the newest section of .coord/workers/${name}/brief.md and follow it.`,
  ];
};

const activeWorkers = (teamJson) => {
  const team = JSON.parse(teamJson);

  if (!Array.isArray(team))
    throw new Error('team.json must be a JSON array.');

  return team
    .filter((entry) => entry?.state === 'active' && isWorkerName(entry.name))
    .map((entry) => entry.name);
};

const isExactRequest = (request, name) =>
  request !== null
  && typeof request === 'object'
  && !Array.isArray(request)
  && Object.keys(request).join() === 'name'
  && request.name === name;

const validateRequest = ({ fileName, content, openTabs, briefExists }) => {
  const fileMatch = REQUEST_FILE.exec(fileName);

  if (!fileMatch || !isWorkerName(fileMatch[1]))
    return { ok: false, reason: `The request file name ${JSON.stringify(fileName)} is not <name>.json with a valid worker name.` };

  const name = fileMatch[1];
  let request;

  try {
    request = JSON.parse(content);
  } catch {
    return { ok: false, name, incomplete: true, reason: 'The request is not valid JSON.' };
  }

  if (!isExactRequest(request, name))
    return { ok: false, name, reason: `The request must be exactly {"name": "${name}"}.` };

  if (openTabs.includes(name))
    return { ok: false, name, reason: `A tab named ${name} is already open.` };

  if (!briefExists(name))
    return { ok: false, name, reason: `.coord/workers/${name}/brief.md does not exist.` };

  return { ok: true, name };
};

const withExcludeEntry = (excludeText) => {
  const lines = excludeText.split(/\r?\n/).map((line) => line.trim());

  if (lines.includes(EXCLUDE_ENTRY) || lines.includes(`/${EXCLUDE_ENTRY}`))
    return excludeText;

  const separator = excludeText === '' || excludeText.endsWith('\n') ? '' : '\n';

  return `${excludeText}${separator}${EXCLUDE_ENTRY}\n`;
};

const defaultPluginDir = (extensionRealPath) => path.join(extensionRealPath, '..', 'plugins', 'toolkit');

const folderKey = (folder, platform = process.platform) => {
  const resolved = path.resolve(folder);

  return platform === 'win32' ? resolved.toLowerCase() : resolved;
};

const withEnabledFolder = (enabledFolders, folder) => {
  const key = folderKey(folder);

  return enabledFolders.includes(key) ? enabledFolders : [...enabledFolders, key];
};

const isEnabledFolder = (enabledFolders, folder) => enabledFolders.includes(folderKey(folder));

const terminalOptions = ({ name, claudePath, args, folder, beside }) => ({
  name,
  shellPath: claudePath,
  shellArgs: args,
  cwd: folder,
  isTransient: true,
  location: { viewColumn: beside ? SECOND_COLUMN : FIRST_COLUMN, preserveFocus: beside },
});

module.exports = {
  COORDINATOR_TAB,
  activeWorkers,
  coordinatorArgs,
  coordinatorSessionName,
  defaultPluginDir,
  folderKey,
  isEnabledFolder,
  isWorkerName,
  newWorkerArgs,
  requestedWorkerArgs,
  resumeWorkerArgs,
  sessionPrefix,
  terminalOptions,
  validateRequest,
  withEnabledFolder,
  workerSessionName,
  withExcludeEntry,
};
