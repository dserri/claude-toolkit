import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import core from '../vscode/core.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hookPath = path.join(repoRoot, 'plugins', 'toolkit', 'hooks', 'session-start.mjs');
const pluginDir = path.join(os.tmpdir(), 'ext', 'plugins', 'toolkit');
const projectFolder = path.join(os.tmpdir(), 'My Cool.Project!!');
const prefix = 'my-cool-project';
const uuid = '0f8fad5b-d9cb-469f-a165-70867728950e';
const otherUuid = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

const valueOf = (args, flag) => {
  const index = args.indexOf(flag);
  assert.notEqual(index, -1, `missing ${flag}`);
  return args[index + 1];
};

const badNames = [
  '', '-a', 'A', 'Alpha', 'a'.repeat(41), 'coordinator', 'a/b', 'a\\b', '..', '../a', 'a..b/..',
  'a b', ' a', 'a;b', 'a$b', '$(x)', "a'b", 'a"b', 'a`b', 'a.b', 'a_b', 'a\nb', 'a\n', 'a|b', 'a&b'
];

describe('isWorkerName', () => {
  test('accepts valid names', () => {
    for (const name of ['a', '1', 'abc', 'abc-1', '9lives', 'x-', 'a'.repeat(40), 'coordinator-2', 'coord']) {
      assert.equal(core.isWorkerName(name), true, name);
    }
  });

  test('rejects invalid names', () => {
    for (const name of [...badNames, null, undefined]) {
      assert.equal(core.isWorkerName(name), false, JSON.stringify(name));
    }
  });
});

describe('sessionPrefix', () => {
  test('normalises the base name', () => {
    assert.equal(core.sessionPrefix(projectFolder), prefix);
    assert.equal(core.sessionPrefix(path.join(os.tmpdir(), '--Foo__Bar--')), 'foo-bar');
    assert.equal(core.sessionPrefix(path.join(os.tmpdir(), 'abc123')), 'abc123');
    assert.equal(core.sessionPrefix(path.join(os.tmpdir(), 'Ünïcode')), 'n-code');
  });

  test('uses project when nothing remains', () => {
    assert.equal(core.sessionPrefix(path.join(os.tmpdir(), '!!!')), 'project');
    assert.equal(core.sessionPrefix(path.join(os.tmpdir(), '___')), 'project');
  });
});

describe('workerSessionName', () => {
  test('joins prefix and name', () => {
    assert.equal(core.workerSessionName(projectFolder, 'alpha'), `${prefix}-alpha`);
  });

  test('throws for invalid names', () => {
    for (const name of badNames) {
      assert.throws(() => core.workerSessionName(projectFolder, name), /Invalid worker name/, JSON.stringify(name));
    }
  });
});

describe('coordinatorArgs', () => {
  test('contains the required flags and a fixed prompt', () => {
    const args = core.coordinatorArgs({ projectFolder, pluginDir });
    assert.ok(args.every((arg) => typeof arg === 'string'));
    assert.equal(valueOf(args, '--plugin-dir'), pluginDir);
    assert.equal(valueOf(args, '--permission-mode'), 'auto');
    assert.equal(valueOf(args, '--agent'), 'toolkit:coordinator');
    assert.equal(valueOf(args, '--name'), `${prefix}-coordinator`);
    const prompt = args[args.length - 1];
    assert.ok(prompt.length > 0 && !prompt.startsWith('--'));
    const other = core.coordinatorArgs({ projectFolder: path.join(os.tmpdir(), 'other'), pluginDir });
    assert.equal(other[other.length - 1], prompt);
    assert.equal(valueOf(other, '--name'), 'other-coordinator');
  });
});

describe('newWorkerArgs', () => {
  test('contains the required flags and the brief prompt', () => {
    const args = core.newWorkerArgs({ projectFolder, pluginDir, name: 'alpha' });
    assert.equal(valueOf(args, '--plugin-dir'), pluginDir);
    assert.equal(valueOf(args, '--permission-mode'), 'auto');
    assert.equal(valueOf(args, '--agent'), 'toolkit:worker');
    assert.equal(valueOf(args, '--name'), `${prefix}-alpha`);
    assert.equal(args[args.length - 1], 'Read .coord/workers/alpha/brief.md and follow it.');
    assert.ok(!args.includes('--resume'));
  });

  test('throws for invalid names', () => {
    for (const name of badNames) {
      assert.throws(() => core.newWorkerArgs({ projectFolder, pluginDir, name }), JSON.stringify(name));
    }
  });
});

describe('resumeWorkerArgs', () => {
  const resume = (sessionRecord, name = 'alpha') => core.resumeWorkerArgs({ projectFolder, pluginDir, name, sessionRecord });

  const assertFlags = (args) => {
    assert.equal(valueOf(args, '--plugin-dir'), pluginDir);
    assert.equal(valueOf(args, '--permission-mode'), 'auto');
    assert.equal(valueOf(args, '--agent'), 'toolkit:worker');
    assert.ok(!args.some((arg) => arg.includes('brief.md')));
    assert.ok(!args.some((arg) => arg.startsWith('Read ')));
  };

  test('resumes by session ID for a UUID record', () => {
    for (const record of [uuid, `${uuid}\n`, `  ${uuid}  \n`, `\n${uuid}\r\n`]) {
      const args = resume(record);
      assert.deepEqual(args.slice(0, 2), ['--resume', uuid], JSON.stringify(record));
      assertFlags(args);
    }
  });

  test('resumes by session name otherwise', () => {
    const records = [
      undefined, null, '', 'not-a-uuid', `${uuid} extra`, `${uuid}\n${otherUuid}`, `${uuid}; rm -rf /`,
      `${uuid} --dangerously-skip-permissions`, uuid.slice(0, -1), `${uuid}0`, uuid.replace(/-/g, ''),
      `{${uuid}}`, uuid.replace('0f8', 'zf8')
    ];
    for (const record of records) {
      const args = resume(record);
      assert.deepEqual(args.slice(0, 2), ['--resume', `${prefix}-alpha`], JSON.stringify(record));
      assertFlags(args);
      assert.ok(!args.some((arg) => arg.includes('rm -rf') || arg.includes('dangerously') || arg.includes(otherUuid)));
    }
  });

  test('throws for invalid names', () => {
    for (const name of badNames) {
      assert.throws(() => resume(uuid, name), JSON.stringify(name));
    }
  });
});

describe('requestedWorkerArgs', () => {
  const requested = (sessionRecord, name = 'alpha') => core.requestedWorkerArgs({ projectFolder, pluginDir, name, sessionRecord });

  test('resumes a recorded session with the newest-section prompt', () => {
    const args = requested(`${uuid}\n`);
    assert.deepEqual(args.slice(0, 2), ['--resume', uuid]);
    assert.equal(valueOf(args, '--plugin-dir'), pluginDir);
    assert.equal(valueOf(args, '--permission-mode'), 'auto');
    assert.equal(valueOf(args, '--agent'), 'toolkit:worker');
    assert.equal(args[args.length - 1], 'Read the newest section of .coord/workers/alpha/brief.md and follow it.');
  });

  test('starts a new worker without a valid record', () => {
    const expected = core.newWorkerArgs({ projectFolder, pluginDir, name: 'alpha' });
    for (const record of [undefined, null, '', 'garbage', `${uuid} trailing`, `${uuid}\nmore`]) {
      assert.deepEqual(requested(record), expected, JSON.stringify(record));
    }
  });

  test('throws for invalid names', () => {
    for (const name of badNames) {
      assert.throws(() => requested(uuid, name), JSON.stringify(name));
    }
  });
});

describe('activeWorkers', () => {
  test('lists valid active names in order', () => {
    const team = JSON.stringify([
      { name: 'beta', state: 'active' },
      { name: 'Alpha', state: 'active' },
      { name: 'gamma', state: 'done' },
      { name: 'alpha', state: 'active' },
      { name: 'coordinator', state: 'active' },
      { name: '../evil', state: 'active' },
      { name: 'a b', state: 'active' },
      { name: 'delta' },
      { name: 'eps', state: 'Active' }
    ]);
    assert.deepEqual(core.activeWorkers(team), ['beta', 'alpha']);
    assert.deepEqual(core.activeWorkers('[]'), []);
  });

  test('throws when not an array', () => {
    for (const text of ['{}', 'null', '"x"', '5', '{"name":"a","state":"active"}']) {
      assert.throws(() => core.activeWorkers(text), text);
    }
  });

  test('throws SyntaxError on invalid JSON', () => {
    assert.throws(() => core.activeWorkers('not json'), SyntaxError);
    assert.throws(() => core.activeWorkers('[{'), SyntaxError);
  });
});

describe('validateRequest', () => {
  const check = (overrides = {}) => {
    const calls = [];
    const result = core.validateRequest({
      fileName: 'alpha.json',
      content: '{"name": "alpha"}',
      openTabs: [],
      briefExists: (name) => {
        calls.push(name);
        return true;
      },
      ...overrides
    });
    return { result, calls };
  };

  const assertRejected = (result, label) => {
    assert.equal(result.ok, false, label);
    assert.equal(typeof result.reason, 'string', label);
    assert.ok(result.reason.length > 0, label);
  };

  test('accepts a valid request', () => {
    assert.deepEqual(check().result, { ok: true, name: 'alpha' });
    assert.deepEqual(check({ content: '{"name":"alpha"}\n' }).result, { ok: true, name: 'alpha' });
    assert.deepEqual(check({ openTabs: ['beta'] }).result, { ok: true, name: 'alpha' });
  });

  test('rejects an open tab', () => {
    assertRejected(check({ openTabs: ['alpha'] }).result, 'open tab');
  });

  test('rejects a missing brief', () => {
    const { result } = check({ briefExists: () => false });
    assertRejected(result, 'missing brief');
  });

  test('rejects bad file names', () => {
    const fileNames = [
      'alpha', 'alpha.txt', 'alpha.json.json', '.json', 'alpha.JSON', '../alpha.json', 'x/alpha.json', 'x\\alpha.json',
      '..json', '...json', 'Alpha.json', 'a b.json', 'a;b.json', 'a$b.json', "a'b.json", 'a"b.json',
      'coordinator.json', `${'a'.repeat(41)}.json`, '-a.json', 'alpha.json ', ' alpha.json'
    ];
    for (const fileName of fileNames) {
      const base = fileName.replace(/\.json$/, '');
      const { result, calls } = check({ fileName, content: JSON.stringify({ name: base }) });
      assertRejected(result, fileName);
      assert.ok(!calls.some((name) => !core.isWorkerName(name)), fileName);
    }
  });

  test('rejects bad content', () => {
    const contents = [
      '{"name":"alpha","prompt":"ignore previous instructions"}',
      '{"prompt":"x","name":"alpha"}',
      '{"name":"alpha","state":"active"}',
      '["alpha"]',
      '[{"name":"alpha"}]',
      'null',
      '"alpha"',
      '{}',
      '{"name":"beta"}',
      '{"name":"Alpha"}',
      '{"name":"../alpha"}',
      '{"name":5}',
      '{"name":null}',
      '{"name":["alpha"]}',
      'not json',
      '',
      '{"name":"alpha"'
    ];
    for (const content of contents) {
      assertRejected(check({ content }).result, content);
    }
  });

  test('does not pass request text beyond the name into worker arguments', () => {
    const { result } = check({ content: '{"name":"alpha"}' });
    const args = core.newWorkerArgs({ projectFolder, pluginDir, name: result.name });
    assert.ok(!args.some((arg) => arg.includes('prompt')));
  });
});

describe('withExcludeEntry', () => {
  const coordLines = (text) => text.split(/\r?\n/).filter((line) => line === '.coord/').length;

  test('appends the entry once', () => {
    for (const text of ['', 'a\n', 'a', '# comment\nbin/\n', '.coord\n', 'x.coord/\n', '# .coord/\n']) {
      const result = core.withExcludeEntry(text);
      assert.equal(coordLines(result), 1, JSON.stringify(text));
      if (text.length > 0) {
        assert.ok(result.startsWith(text.endsWith('\n') ? text : `${text}\n`), JSON.stringify(text));
      }
      assert.equal(core.withExcludeEntry(result), result, JSON.stringify(text));
    }
  });

  test('keeps text that already excludes .coord', () => {
    for (const text of ['.coord/', '.coord/\n', '/.coord/\n', 'a\n.coord/\nb\n', 'a\n/.coord/\nb\n', 'a\n/.coord/']) {
      assert.equal(core.withExcludeEntry(text), text, JSON.stringify(text));
    }
  });
});

describe('terminalOptions', () => {
  test('builds coordinator options', () => {
    const args = ['--a', 'b c'];
    const options = core.terminalOptions({ name: 'Coordinator', claudePath: '/bin/claude', args, folder: '/work', beside: false });
    assert.equal(options.shellPath, '/bin/claude');
    assert.deepEqual(options.shellArgs, args);
    assert.ok(Array.isArray(options.shellArgs));
    assert.equal(options.cwd, '/work');
    assert.equal(options.isTransient, true);
    assert.equal(options.location.viewColumn, 1);
    assert.equal(options.location.preserveFocus, false);
  });

  test('builds worker options', () => {
    const options = core.terminalOptions({ name: 'alpha', claudePath: '/bin/claude', args: ['x'], folder: '/work', beside: true });
    assert.equal(options.location.viewColumn, 2);
    assert.equal(options.location.preserveFocus, true);
    assert.equal(options.isTransient, true);
    assert.deepEqual(options.shellArgs, ['x']);
  });
});

describe('defaultPluginDir', () => {
  test('points beside the extension', () => {
    const extension = path.join(os.tmpdir(), 'repo', 'vscode');
    assert.equal(core.defaultPluginDir(extension), path.join(extension, '..', 'plugins', 'toolkit'));
    assert.equal(core.defaultPluginDir(extension), path.join(os.tmpdir(), 'repo', 'plugins', 'toolkit'));
  });
});

describe('session-start hook', () => {
  let root;
  let home;
  let scriptDir;
  let counter = 0;

  const stub = [
    "import fs from 'node:fs';",
    "import path from 'node:path';",
    "import { fileURLToPath } from 'node:url';",
    'const dir = path.dirname(fileURLToPath(import.meta.url));',
    "fs.writeFileSync(path.join(dir, 'argv.json'), JSON.stringify(process.argv.slice(2)));",
    "const mode = fs.readFileSync(path.join(dir, 'mode.txt'), 'utf8').trim();",
    "if (mode === 'recap') { process.stdout.write(JSON.stringify({ recap: 'Recap line one\\nRecap line two' })); }",
    "if (mode === 'norecap') { process.stdout.write(JSON.stringify({ ok: true })); }",
    "if (mode === 'fail') { process.stderr.write('stub broke badly\\nsecond line\\n'); process.exit(3); }"
  ].join('\n');

  before(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'coord-blackbox-')));
    home = path.join(root, 'home');
    scriptDir = path.join(home, '.claude', 'skills', 'sdd', 'scripts');
    fs.mkdirSync(scriptDir, { recursive: true });
    fs.writeFileSync(path.join(scriptDir, 'complete-change.mjs'), stub);
  });

  after(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const newProject = (withCoord) => {
    counter += 1;
    const folder = path.join(root, `project-${counter}`);
    fs.mkdirSync(folder);
    if (withCoord) {
      fs.mkdirSync(path.join(folder, '.coord'));
    }
    return folder;
  };

  const setMode = (mode) => {
    fs.rmSync(path.join(scriptDir, 'argv.json'), { force: true });
    fs.writeFileSync(path.join(scriptDir, 'mode.txt'), mode);
  };

  const pulled = () => fs.existsSync(path.join(scriptDir, 'argv.json'));

  const runHook = (input) => {
    const result = spawnSync(process.execPath, [hookPath], {
      input: typeof input === 'string' ? input : JSON.stringify(input),
      env: { ...process.env, HOME: home, USERPROFILE: home },
      encoding: 'utf8',
      timeout: 30000
    });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };

  const contextOf = (stdout) => {
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.hookSpecificOutput.hookEventName, 'SessionStart');
    assert.equal(typeof parsed.hookSpecificOutput.additionalContext, 'string');
    return parsed.hookSpecificOutput.additionalContext;
  };

  const coordinatorInput = (cwd, source = 'startup') => ({
    agent_type: 'toolkit:coordinator', source, cwd, session_id: uuid, session_title: 'proj-coordinator'
  });

  test('coordinator startup reports the recap', () => {
    setMode('recap');
    const cwd = newProject(true);
    const context = contextOf(runHook(coordinatorInput(cwd)));
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(scriptDir, 'argv.json'), 'utf8')), ['--collab', 'pull', '--repository', cwd]);
    assert.ok(context.endsWith('Recap line one\nRecap line two'), context);
    assert.match(context, /first/i);
    assert.match(context, /pull/i);
    assert.match(context, /again/i);
  });

  test('coordinator startup without recap reports no team mailbox', () => {
    setMode('norecap');
    const context = contextOf(runHook(coordinatorInput(newProject(false))));
    assert.ok(pulled());
    assert.match(context, /no team mailbox/i);
  });

  test('coordinator startup reports a failed pull', () => {
    setMode('fail');
    const context = contextOf(runHook(coordinatorInput(newProject(false))));
    assert.equal(context, 'SDD collaboration pull failed: stub broke badly');
  });

  test('coordinator startup reports a missing script', () => {
    const emptyHome = path.join(root, 'empty-home');
    fs.mkdirSync(emptyHome, { recursive: true });
    const result = spawnSync(process.execPath, [hookPath], {
      input: JSON.stringify(coordinatorInput(newProject(false))),
      env: { ...process.env, HOME: emptyHome, USERPROFILE: emptyHome },
      encoding: 'utf8',
      timeout: 30000
    });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(contextOf(result.stdout).startsWith('SDD collaboration pull failed:'));
  });

  test('coordinator resume does nothing', () => {
    setMode('recap');
    const cwd = newProject(true);
    assert.equal(runHook(coordinatorInput(cwd, 'resume')).trim(), '');
    assert.equal(pulled(), false);
    assert.deepEqual(fs.readdirSync(path.join(cwd, '.coord')), []);
  });

  test('worker records its session ID at startup and resume', () => {
    setMode('recap');
    const cwd = newProject(true);
    const record = path.join(cwd, '.coord', 'sessions', 'proj-alpha.id');
    const input = { agent_type: 'toolkit:worker', source: 'startup', cwd, session_id: uuid, session_title: 'proj-alpha' };
    assert.equal(runHook(input).trim(), '');
    assert.equal(fs.readFileSync(record, 'utf8'), `${uuid}\n`);
    assert.equal(runHook({ ...input, source: 'resume', session_id: otherUuid }).trim(), '');
    assert.equal(fs.readFileSync(record, 'utf8'), `${otherUuid}\n`);
    assert.equal(pulled(), false);
  });

  test('worker replaces an earlier record', () => {
    setMode('recap');
    const cwd = newProject(true);
    fs.mkdirSync(path.join(cwd, '.coord', 'sessions'));
    const record = path.join(cwd, '.coord', 'sessions', 'proj-beta.id');
    fs.writeFileSync(record, 'old content that is longer than a uuid by quite a margin indeed\n');
    runHook({ agent_type: 'toolkit:worker', source: 'startup', cwd, session_id: uuid, session_title: 'proj-beta' });
    assert.equal(fs.readFileSync(record, 'utf8'), `${uuid}\n`);
  });

  test('worker writes nothing for unsafe titles or IDs', () => {
    setMode('recap');
    const cases = [
      { session_title: '../escape', session_id: uuid },
      { session_title: 'a/b', session_id: uuid },
      { session_title: 'a\\b', session_id: uuid },
      { session_title: 'Proj-Alpha', session_id: uuid },
      { session_title: 'a b', session_id: uuid },
      { session_title: '-alpha', session_id: uuid },
      { session_title: '', session_id: uuid },
      { session_id: uuid },
      { session_title: 'proj-alpha', session_id: 'not-a-uuid' },
      { session_title: 'proj-alpha', session_id: `${uuid}\nextra` },
      { session_title: 'proj-alpha' }
    ];
    for (const fields of cases) {
      const cwd = newProject(true);
      assert.equal(runHook({ agent_type: 'toolkit:worker', source: 'startup', cwd, ...fields }).trim(), '', JSON.stringify(fields));
      const sessions = path.join(cwd, '.coord', 'sessions');
      const written = fs.existsSync(sessions) ? fs.readdirSync(sessions) : [];
      assert.deepEqual(written, [], JSON.stringify(fields));
      assert.deepEqual(fs.readdirSync(root).filter((entry) => entry === 'escape' || entry.endsWith('.id')), [], JSON.stringify(fields));
    }
    assert.equal(pulled(), false);
  });

  test('worker never creates .coord', () => {
    setMode('recap');
    const cwd = newProject(false);
    assert.equal(runHook({ agent_type: 'toolkit:worker', source: 'startup', cwd, session_id: uuid, session_title: 'proj-alpha' }).trim(), '');
    assert.deepEqual(fs.readdirSync(cwd), []);
    assert.equal(pulled(), false);
  });

  test('sessions without an agent do nothing', () => {
    setMode('recap');
    for (const source of ['startup', 'resume']) {
      const cwd = newProject(true);
      assert.equal(runHook({ source, cwd, session_id: uuid, session_title: 'proj-alpha' }).trim(), '');
      assert.deepEqual(fs.readdirSync(path.join(cwd, '.coord')), []);
    }
    assert.equal(pulled(), false);
  });

  test('exits 0 on malformed input', () => {
    setMode('recap');
    runHook('not json');
    runHook('');
  });
});
