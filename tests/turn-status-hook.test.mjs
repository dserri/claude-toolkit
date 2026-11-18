import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const hook = fileURLToPath(new URL('../status/turn-status-hook.mjs', import.meta.url));

const run = (entrypoint) => spawnSync(process.execPath, [hook], {
  input: '{"hook_event_name":"SessionStart","source":"startup"}',
  encoding: 'utf8',
  env: { ...process.env, CLAUDE_CODE_ENTRYPOINT: entrypoint },
});

test('interactive sessions receive the exact status-line instruction', () => {
  const result = run('cli');

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'End every turn with a final line on its own: `STATUS: QUESTION` when you need the developer\'s answer or decision, `STATUS: DONE` otherwise. The developer\'s session view reads it.\n');
});

test('headless sessions receive nothing', () => {
  for (const entrypoint of ['sdk-cli', 'sdk-ts', 'sdk-py']) {
    const result = run(entrypoint);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '', entrypoint);
  }
});

test('the instruction matches the one in the coordinator and worker prompts', () => {
  const instruction = run('cli').stdout.trim();

  for (const agent of ['coordinator', 'worker']) {
    const prompt = readFileSync(fileURLToPath(new URL(`../plugins/toolkit/agents/${agent}.md`, import.meta.url)), 'utf8');

    assert.ok(prompt.includes(instruction), agent);
  }
});
