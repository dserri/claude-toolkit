import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const hook = fileURLToPath(new URL('../status/status-hook.mjs', import.meta.url));
const sessionId = '7fa97870-6578-4ed2-b7c9-1dc4c9a2ef09';

const withHome = (run) => {
  const home = mkdtempSync(join(tmpdir(), 'toolkit-status-'));

  try {
    return run(home);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
};

const runHook = (home, input, entrypoint = 'cli') => spawnSync(process.execPath, [hook], {
  input: typeof input === 'string' ? input : JSON.stringify(input),
  encoding: 'utf8',
  env: { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_CODE_ENTRYPOINT: entrypoint },
});

const sessionFile = (home, id = sessionId) => join(home, '.agent-status', 'sessions', `${id}.jsonl`);
const lines = (home) => readFileSync(sessionFile(home), 'utf8').trim().split('\n').map((line) => JSON.parse(line));

const event = (name, extra = {}) => ({ session_id: sessionId, hook_event_name: name, cwd: 'P:\\repos\\Rehlko\\rehlko-portal', ...extra });

const runQuietly = (home, input, entrypoint) => {
  const result = runHook(home, input, entrypoint);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');

  return result;
};

test('session start records the name and folder, tool events append', () => {
  withHome((home) => {
    runQuietly(home, event('SessionStart', { session_title: 'rehlko-portal-tester', source: 'startup' }));
    runQuietly(home, event('PostToolUse', { prompt_id: 'p1', tool_name: 'Bash' }));

    const [start, tool] = lines(home);

    assert.equal(start.event, 'SessionStart');
    assert.equal(start.title, 'rehlko-portal-tester');
    assert.equal(start.folder, 'rehlko-portal');
    assert.equal(tool.event, 'PostToolUse');
    assert.equal(tool.promptId, 'p1');
    assert.equal(tool.tool, 'Bash');
    assert.equal(typeof tool.t, 'number');
  });
});

test('the project folder comes from CLAUDE_PROJECT_DIR, not the current folder', () => {
  withHome((home) => {
    const result = spawnSync(process.execPath, [hook], {
      input: JSON.stringify(event('UserPromptSubmit', { prompt_id: 'p1', cwd: 'P:\\repos\\Rehlko\\rehlko-portal\\.coord' })),
      encoding: 'utf8',
      env: { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_CODE_ENTRYPOINT: 'cli', CLAUDE_PROJECT_DIR: 'P:/repos/Rehlko/rehlko-portal' },
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(lines(home)[0].folder, 'rehlko-portal');
  });
});

test('a new prompt keeps only the first line and the new turn', () => {
  withHome((home) => {
    runQuietly(home, event('SessionStart', { session_title: 'portal' }));
    runQuietly(home, event('PostToolUse', { prompt_id: 'p1', tool_name: 'Read' }));
    runQuietly(home, event('Stop', { prompt_id: 'p1', last_assistant_message: 'done' }));
    runQuietly(home, event('UserPromptSubmit', { prompt_id: 'p2', session_title: 'portal' }));

    assert.deepEqual(lines(home).map((line) => line.event), ['SessionStart', 'UserPromptSubmit']);
    assert.equal(lines(home)[1].folder, 'rehlko-portal');
  });
});

test('stop records the last line and whether the agent asks, honouring the STATUS line', () => {
  const cases = [
    ['Here is the plan.\nShall I start?\nSTATUS: DONE', false, 'Shall I start?'],
    ['Tests pass.\nSTATUS: QUESTION', true, 'Tests pass.'],
    ['Which branch should I use?', true, 'Which branch should I use?'],
    ['All done.\n\n', false, 'All done.'],
    ['', false, ''],
  ];

  for (const [message, asks, last] of cases) {
    withHome((home) => {
      runQuietly(home, event('Stop', { prompt_id: 'p1', last_assistant_message: message }));

      const [stop] = lines(home);

      assert.equal(stop.asks, asks, message);
      assert.equal(stop.last, last, message);
    });
  }
});

test('the last line is cut to 200 characters', () => {
  withHome((home) => {
    runQuietly(home, event('Stop', { prompt_id: 'p1', last_assistant_message: 'x'.repeat(500) }));
    assert.equal(lines(home)[0].last.length, 200);
  });
});

test('session end deletes the session file', () => {
  withHome((home) => {
    runQuietly(home, event('SessionStart'));
    runQuietly(home, event('SessionEnd', { reason: 'prompt_input_exit' }));
    assert.equal(existsSync(sessionFile(home)), false);
  });
});

test('events arriving after session end do not bring the session back, a new start does', () => {
  withHome((home) => {
    runQuietly(home, event('SessionStart'));
    runQuietly(home, event('SessionEnd', { reason: 'other' }));
    runQuietly(home, event('Stop', { prompt_id: 'p1', last_assistant_message: 'late' }));
    runQuietly(home, event('PostToolUse', { prompt_id: 'p1', tool_name: 'Bash' }));

    assert.equal(existsSync(sessionFile(home)), false);

    runQuietly(home, event('SessionStart', { source: 'resume' }));

    assert.equal(existsSync(sessionFile(home)), true);
    assert.equal(existsSync(join(home, '.agent-status', 'sessions', `${sessionId}.ended`)), false);
  });
});

test('ended markers are removed with the other stale files', () => {
  withHome((home) => {
    const sessions = join(home, '.agent-status', 'sessions');
    const marker = join(sessions, '33333333-3333-3333-3333-333333333333.ended');
    const sevenHoursAgo = (Date.now() - 7 * 3_600_000) / 1000;

    mkdirSync(sessions, { recursive: true });
    writeFileSync(marker, '');
    utimesSync(marker, sevenHoursAgo, sevenHoursAgo);
    runQuietly(home, event('SessionStart'));

    assert.equal(existsSync(marker), false);
  });
});

test('headless sessions are not recorded', () => {
  withHome((home) => {
    runQuietly(home, event('SessionStart'), 'sdk-cli');
    runQuietly(home, event('UserPromptSubmit', { prompt_id: 'p1' }), 'sdk-ts');
    assert.equal(existsSync(join(home, '.agent-status')), false);
  });
});

test('unreadable input and invalid session ids are logged, never printed, and record nothing', () => {
  withHome((home) => {
    runQuietly(home, 'not json');
    runQuietly(home, event('SessionStart', { session_id: '../../evil' }));

    const log = readFileSync(join(home, '.agent-status', 'hook.log'), 'utf8');

    assert.match(log, /error: /);
    assert.match(log, /invalid session_id/);
    assert.equal(existsSync(join(home, '.agent-status', 'sessions')), false);
  });
});

test('a session start removes session files idle for more than six hours', () => {
  withHome((home) => {
    const sessions = join(home, '.agent-status', 'sessions');
    const old = join(sessions, '11111111-1111-1111-1111-111111111111.jsonl');
    const recent = join(sessions, '22222222-2222-2222-2222-222222222222.jsonl');
    const sevenHoursAgo = (Date.now() - 7 * 3_600_000) / 1000;

    mkdirSync(sessions, { recursive: true });
    writeFileSync(old, '{}\n');
    writeFileSync(recent, '{}\n');
    utimesSync(old, sevenHoursAgo, sevenHoursAgo);
    runQuietly(home, event('SessionStart'));

    assert.equal(existsSync(old), false);
    assert.equal(existsSync(recent), true);
    assert.equal(existsSync(sessionFile(home)), true);
  });
});
