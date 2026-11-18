import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('the installed Claude Code tells hooks of a headless session that its entrypoint is sdk-*', () => {
  const folder = mkdtempSync(join(tmpdir(), 'toolkit-entrypoint-'));

  try {
    const probe = join(folder, 'probe.cjs').replaceAll('\\', '/');
    const output = join(folder, 'entrypoint.txt').replaceAll('\\', '/');
    const settings = join(folder, 'settings.json');

    writeFileSync(probe, `require('fs').writeFileSync(${JSON.stringify(output)}, process.env.CLAUDE_CODE_ENTRYPOINT ?? '');\n`);
    writeFileSync(settings, JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: 'command', command: `node "${probe}"` }] }] } }));

    const result = spawnSync('claude', ['-p', 'Reply with: ok', '--settings', settings, '--model', 'haiku'], { cwd: folder, encoding: 'utf8', timeout: 240_000 });

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(readFileSync(output, 'utf8'), /^sdk/);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
