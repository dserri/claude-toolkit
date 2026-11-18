import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { text } from 'node:stream/consumers';

const COORDINATOR_AGENT = 'toolkit:coordinator';
const WORKER_AGENT = 'toolkit:worker';
const PULL_TIMEOUT_MS = 60_000;
const SESSION_NAME = /^[a-z0-9][a-z0-9-]{0,99}$/;
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const recordWorkerSession = ({ cwd, session_title: sessionName, session_id: sessionId }) => {
  const coordDir = join(cwd, '.coord');
  const recordable = existsSync(coordDir) && SESSION_NAME.test(sessionName ?? '') && SESSION_ID.test(sessionId ?? '');

  if (!recordable)
    return;

  mkdirSync(join(coordDir, 'sessions'), { recursive: true });
  writeFileSync(join(coordDir, 'sessions', `${sessionName}.id`), `${sessionId}\n`);
};

const sddScript = () => join(homedir(), '.claude', 'skills', 'sdd', 'scripts', 'complete-change.mjs');

const firstLine = (value) => String(value).trim().split(/\r?\n/)[0];

const recapContext = (stdout) => {
  try {
    const result = JSON.parse(stdout);

    if (!result.recap)
      return 'SDD collaboration pull already run for this session: this project has no team mailbox, so there is no recap to report.';

    return `Team recap from the SDD collaboration pull, already run for this session. Report it first, exactly as returned, and do not pull again:\n${result.recap}`;
  } catch {
    return `SDD collaboration pull failed: unreadable output (${firstLine(stdout)}).`;
  }
};

const pullTeam = (repository) => new Promise((resolve) => {
  const script = sddScript();

  if (!existsSync(script)) {
    resolve(`SDD collaboration pull failed: the SDD skill script was not found at ${script}.`);

    return;
  }

  const args = [script, '--collab', 'pull', '--repository', repository];

  execFile(process.execPath, args, { timeout: PULL_TIMEOUT_MS }, (error, stdout, stderr) => {
    resolve(error ? `SDD collaboration pull failed: ${firstLine(stderr || error.message)}` : recapContext(stdout));
  });
});

const readInput = async () => {
  try {
    return JSON.parse(await text(process.stdin));
  } catch (error) {
    process.stderr.write(`toolkit session-start hook: unreadable hook input (${firstLine(error.message)}).\n`);

    return {};
  }
};

const input = await readInput();

if (input.agent_type === WORKER_AGENT)
  recordWorkerSession(input);

if (input.agent_type === COORDINATOR_AGENT && input.source === 'startup') {
  const additionalContext = await pullTeam(input.cwd);

  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext } }));
}
