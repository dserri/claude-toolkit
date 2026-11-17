import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const skillDir = join(root, 'plugins', 'toolkit', 'skills', 'create-coordinator');

const releaseHashes = {
  'SKILL.md': 'f76e2df338b8c368cb8ce95693fc573c93f56f2dd2760f110763a836cbc8daf3',
  'launch.ps1': 'f480918c6709825fe1e9ec3b6703c32e4b0987434b7285ae899c37f911ceea37',
  'resolve-projects.ps1': '2cea7e30c9ff33e539754540fea4f0b29334fa71c93762915f0d7d8d582c431e',
};

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

test('create-coordinator files are identical to release 0.2.0', () => {
  for (const [file, expected] of Object.entries(releaseHashes)) {
    const actual = createHash('sha256').update(readFileSync(join(skillDir, file))).digest('hex');
    assert.equal(actual, expected, file);
  }
});

test('PowerShell scripts keep their UTF-8 byte order mark', () => {
  for (const file of ['launch.ps1', 'resolve-projects.ps1']) {
    assert.deepEqual([...readFileSync(join(skillDir, file)).subarray(0, 3)], [0xef, 0xbb, 0xbf], file);
  }
});

test('create-coordinator stays developer-invoked only', () => {
  const frontmatter = readFileSync(join(skillDir, 'SKILL.md'), 'utf8').split('---')[1];

  assert.match(frontmatter, /^name: create-coordinator$/m);
  assert.match(frontmatter, /^disable-model-invocation: true$/m);
});

test('toolkit ships exactly the create-coordinator skill and nothing that could shadow SDD', () => {
  const pluginEntries = readdirSync(join(root, 'plugins', 'toolkit')).sort();
  const skills = readdirSync(join(root, 'plugins', 'toolkit', 'skills'));

  assert.deepEqual(pluginEntries, ['.claude-plugin', 'skills']);
  assert.deepEqual(skills, ['create-coordinator']);
});
