import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const hook = fileURLToPath(new URL('../plugins/toolkit/hooks/session-start.mjs', import.meta.url));

const withHome = (stubSource, run) => {
  const home = mkdtempSync(join(tmpdir(), 'toolkit-hook-'));

  try {
    if (stubSource !== undefined) {
      const scripts = join(home, '.claude', 'skills', 'sdd', 'scripts');

      mkdirSync(scripts, { recursive: true });
      writeFileSync(join(scripts, 'complete-change.mjs'), stubSource);
    }

    return run(home);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
};

const runHook = (home, input) => spawnSync(process.execPath, [hook], {
  input: JSON.stringify(input),
  encoding: 'utf8',
  env: { ...process.env, HOME: home, USERPROFILE: home },
});

const contextOf = (result) => {
  assert.equal(result.status, 0, result.stderr);

  const output = JSON.parse(result.stdout);

  assert.equal(output.hookSpecificOutput.hookEventName, 'SessionStart');

  return output.hookSpecificOutput.additionalContext;
};

const recordingStub = (stdout) => `
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
writeFileSync(join(homedir(), 'args.json'), JSON.stringify(process.argv.slice(2)));
process.stdout.write(${JSON.stringify(stdout)});
`;

const coordinator = (cwd) => ({ hook_event_name: 'SessionStart', source: 'startup', agent_type: 'toolkit:coordinator', cwd });

test('the coordinator receives the team recap from the SDD pull for its project', () => {
  withHome(recordingStub(JSON.stringify({ mailbox: 'github.com/team/collab', recap: '**team**: 2 waiting for you' })), (home) => {
    const context = contextOf(runHook(home, coordinator('P:\\repos\\project')));

    assert.match(context, /Report it first, exactly as returned, and do not pull again:\n\*\*team\*\*: 2 waiting for you$/);
    assert.deepEqual(JSON.parse(readFileSync(join(home, 'args.json'), 'utf8')), ['--collab', 'pull', '--repository', 'P:\\repos\\project']);
  });
});

test('a project without a team mailbox says so instead of a recap', () => {
  withHome(recordingStub(JSON.stringify({ mailbox: null, news: [] })), (home) => {
    assert.match(contextOf(runHook(home, coordinator('P:\\repos\\project'))), /no team mailbox/);
  });
});

test('a failing pull is reported in one line', () => {
  withHome('process.stderr.write("network down\\nstack line"); process.exit(3);', (home) => {
    const context = contextOf(runHook(home, coordinator('P:\\repos\\project')));

    assert.equal(context, 'SDD collaboration pull failed: network down');
  });
});

test('unreadable pull output is reported as a failure', () => {
  withHome('process.stdout.write("not json");', (home) => {
    assert.equal(contextOf(runHook(home, coordinator('P:\\repos\\project'))), 'SDD collaboration pull failed: unreadable output (not json).');
  });
});

test('a missing SDD skill is reported as a failure', () => {
  withHome(undefined, (home) => {
    assert.match(contextOf(runHook(home, coordinator('P:\\repos\\project'))), /^SDD collaboration pull failed: the SDD skill script was not found at /);
  });
});

const sessionId = '7fa97870-6578-4ed2-b7c9-1dc4c9a2ef09';

const withProject = (run) => {
  const project = mkdtempSync(join(tmpdir(), 'toolkit-project-'));

  try {
    mkdirSync(join(project, '.coord'));

    return run(project);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
};

const worker = (cwd, overrides = {}) => ({
  hook_event_name: 'SessionStart', source: 'startup', agent_type: 'toolkit:worker', cwd,
  session_id: sessionId, session_title: 'playground-tester', ...overrides,
});

const recordPath = (project, sessionName = 'playground-tester') => join(project, '.coord', 'sessions', `${sessionName}.id`);

test('a worker records its session ID at start and at resume, replacing the old record', () => {
  withHome(recordingStub('{}'), (home) => withProject((project) => {
    const first = runHook(home, worker(project));

    assert.equal(first.status, 0, first.stderr);
    assert.equal(first.stdout, '');
    assert.equal(readFileSync(recordPath(project), 'utf8'), `${sessionId}\n`);

    const resumedId = '0f0f0f0f-1111-2222-3333-444455556666';

    runHook(home, worker(project, { source: 'resume', session_id: resumedId }));
    assert.equal(readFileSync(recordPath(project), 'utf8'), `${resumedId}\n`);
    assert.equal(existsSync(join(home, 'args.json')), false);
  }));
});

test('no record is written for unsafe names, bad IDs, other agents or projects without a board', () => {
  withHome(recordingStub('{}'), (home) => withProject((project) => {
    for (const overrides of [
      { session_title: '../../evil' },
      { session_title: 'Playground Tester' },
      { session_title: undefined },
      { session_id: 'not-an-id' },
      { agent_type: undefined },
    ]) {
      const result = runHook(home, worker(project, overrides));

      assert.equal(result.status, 0, result.stderr);
    }

    assert.equal(existsSync(join(project, '.coord', 'sessions')), false);
    assert.equal(existsSync(join(project, 'evil.id')), false);
  }));

  withHome(recordingStub('{}'), (home) => {
    const project = mkdtempSync(join(tmpdir(), 'toolkit-plain-'));

    try {
      runHook(home, worker(project));
      assert.equal(existsSync(join(project, '.coord')), false);
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });
});

test('unreadable hook input never breaks session start', () => {
  withHome(recordingStub('{}'), (home) => {
    for (const input of ['not json', '']) {
      const result = spawnSync(process.execPath, [hook], { input, encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home } });

      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, '');
      assert.match(result.stderr, /unreadable hook input/);
    }

    assert.equal(existsSync(join(home, 'args.json')), false);
  });
});

test('a resumed coordinator gets no second pull', () => {
  withHome(recordingStub('{}'), (home) => {
    const result = runHook(home, { ...coordinator('P:\\repos\\project'), source: 'resume' });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '');
    assert.equal(existsSync(join(home, 'args.json')), false);
  });
});

test('workers and plain sessions get no output and no pull', () => {
  for (const input of [
    { hook_event_name: 'SessionStart', source: 'startup', agent_type: 'toolkit:worker', cwd: 'P:\\repos\\project' },
    { hook_event_name: 'SessionStart', source: 'startup', cwd: 'P:\\repos\\project' },
  ]) {
    withHome(recordingStub('{}'), (home) => {
      const result = runHook(home, input);

      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, '');
      assert.equal(existsSync(join(home, 'args.json')), false);
    });
  }
});
