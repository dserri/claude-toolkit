import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { text } from 'node:stream/consumers';

const STALE_HOURS = 6;
const LAST_LINE_LENGTH = 200;
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUS_LINE = /^STATUS:\s*(QUESTION|DONE)\s*$/i;

const statusDir = join(homedir(), '.agent-status');
const sessionsDir = join(statusDir, 'sessions');

const log = (message) => {
  try {
    mkdirSync(statusDir, { recursive: true });
    appendFileSync(join(statusDir, 'hook.log'), `${new Date().toISOString()} ${message}\n`);
  } catch {
    return;
  }
};

const folderName = (folderPath) => String(folderPath).split(/[\\/]/).filter(Boolean).at(-1) ?? '';

const isHeadless = () => (process.env.CLAUDE_CODE_ENTRYPOINT ?? '').startsWith('sdk');

const messageLines = (message) => String(message ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

const describeStop = (message) => {
  const lines = messageLines(message);
  const statusMatch = lines.length ? STATUS_LINE.exec(lines.at(-1)) : null;
  const content = statusMatch ? lines.slice(0, -1) : lines;
  const last = content.at(-1) ?? '';

  return {
    asks: statusMatch ? statusMatch[1].toUpperCase() === 'QUESTION' : last.endsWith('?'),
    last: last.slice(0, LAST_LINE_LENGTH),
  };
};

const eventRecord = (input) => {
  const record = { t: Date.now(), event: input.hook_event_name, promptId: input.prompt_id, tool: input.tool_name, title: input.session_title };

  if (input.hook_event_name === 'SessionStart' || input.hook_event_name === 'UserPromptSubmit') {
    const pid = Number(process.env.CLAUDE_PID);

    record.folder = folderName(process.env.CLAUDE_PROJECT_DIR || input.cwd || '');

    if (Number.isInteger(pid) && pid > 0)
      record.pid = pid;
  }

  if (input.hook_event_name === 'Stop') {
    const background = Array.isArray(input.background_tasks) ? input.background_tasks.filter((task) => task?.status === 'running').length : 0;

    Object.assign(record, describeStop(input.last_assistant_message), { background });
  }

  return record;
};

const removeIfStale = (file, now) => {
  try {
    if (now - statSync(file).mtimeMs > STALE_HOURS * 3_600_000)
      rmSync(file, { force: true });
  } catch (error) {
    log(`stale check skipped for ${basename(file)}: ${error.message}`);
  }
};

const removeStaleSessions = (now) => {
  for (const entry of readdirSync(sessionsDir))
    removeIfStale(join(sessionsDir, entry), now);
};

const startTurn = (file, line) => {
  let firstLine = '';

  try {
    firstLine = readFileSync(file, 'utf8').split('\n')[0];
  } catch {
    firstLine = '';
  }

  const temporary = `${file}.${process.pid}.tmp`;

  try {
    writeFileSync(temporary, firstLine ? `${firstLine}\n${line}` : line);
    renameSync(temporary, file);
  } catch (error) {
    rmSync(temporary, { force: true });
    log(`compaction skipped for ${basename(file)}: ${error.message}`);
    appendFileSync(file, line);
  }
};

const record = (input) => {
  if (!SESSION_ID.test(input.session_id ?? '')) {
    log(`ignored ${input.hook_event_name}: missing or invalid session_id`);

    return;
  }

  const file = join(sessionsDir, `${input.session_id}.jsonl`);
  const endedMarker = join(sessionsDir, `${input.session_id}.ended`);

  mkdirSync(sessionsDir, { recursive: true });

  if (input.hook_event_name === 'SessionEnd') {
    rmSync(file, { force: true });
    writeFileSync(endedMarker, '');

    return;
  }

  if (input.hook_event_name === 'SessionStart')
    rmSync(endedMarker, { force: true });
  else if (existsSync(endedMarker))
    return;

  const line = `${JSON.stringify(eventRecord(input))}\n`;

  if (input.hook_event_name === 'SessionStart')
    removeStaleSessions(Date.now());

  if (input.hook_event_name === 'UserPromptSubmit')
    startTurn(file, line);
  else
    appendFileSync(file, line);
};

const main = async () => {
  if (isHeadless())
    return;

  try {
    record(JSON.parse(await text(process.stdin)));
  } catch (error) {
    log(`error: ${error.message}`);
  }
};

await main();
