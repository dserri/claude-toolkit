import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

const validate = (target) => spawnSync('claude', ['plugin', 'validate', target], { cwd: root, encoding: 'utf8' });

test('claude plugin validate accepts the marketplace and the toolkit plugin', () => {
  for (const target of ['.', 'plugins/toolkit']) {
    const result = validate(target);

    assert.equal(result.error, undefined, target);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /Validation passed/, target);
  }
});
