import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));

const readJson = (...segments) => JSON.parse(readFileSync(join(root, ...segments), 'utf8'));

test('marketplace lists the toolkit plugin from inside the repository', () => {
  const marketplace = readJson('.claude-plugin', 'marketplace.json');

  assert.equal(marketplace.name, 'claude-toolkit');
  assert.ok(marketplace.owner?.name);
  assert.deepEqual(
    marketplace.plugins.map(({ name, source }) => ({ name, source })),
    [{ name: 'toolkit', source: './plugins/toolkit' }],
  );
});

test('plugin manifest is named toolkit and declares no version', () => {
  const plugin = readJson('plugins', 'toolkit', '.claude-plugin', 'plugin.json');

  assert.equal(plugin.name, 'toolkit');
  assert.equal(Object.hasOwn(plugin, 'version'), false);
});

test('toolkit skeleton ships only its manifest, so nothing can shadow SDD', () => {
  assert.deepEqual(readdirSync(join(root, 'plugins', 'toolkit')), ['.claude-plugin']);
  assert.deepEqual(readdirSync(join(root, 'plugins', 'toolkit', '.claude-plugin')), ['plugin.json']);
});
