import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginDir = fileURLToPath(new URL('../plugins/toolkit', import.meta.url));

test('a real session started as toolkit:coordinator receives the start-up hook context', () => {
  const project = mkdtempSync(join(tmpdir(), 'toolkit-e2e-'));

  try {
    const result = spawnSync('claude', [
      '-p', '--plugin-dir', pluginDir, '--agent', 'toolkit:coordinator', '--model', 'haiku',
      'Quote verbatim the line in your context that starts with "SDD collaboration pull". Use no tools.',
    ], { cwd: project, encoding: 'utf8', timeout: 240_000 });

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /SDD collaboration pull already run for this session: this project has no team mailbox/);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});
