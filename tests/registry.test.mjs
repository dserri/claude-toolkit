import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import registry from '../vscode/registry.js';

const withFolder = (run) => {
  const folder = mkdtempSync(join(tmpdir(), 'toolkit-registry-'));

  try {
    return run(folder);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
};

test('the reader keeps live windows and deletes dead and unreadable files by the name it read', () => {
  withFolder((folder) => {
    const windows = join(folder, 'windows');
    const live = { pid: 10, folder: 'P:\\repos\\Rehlko\\api', sessions: ['api-coordinator'] };

    mkdirSync(windows);
    writeFileSync(join(windows, '10.json'), JSON.stringify(live));
    writeFileSync(join(windows, '20.json'), JSON.stringify({ pid: 20, folder: 'x', sessions: [] }));
    writeFileSync(join(windows, '30.json'), '{"pid": 30, "fol');
    writeFileSync(join(windows, '40.json'), JSON.stringify({ pid: 10, folder: 'y', sessions: [] }));
    writeFileSync(join(windows, 'notes.txt'), 'keep');

    const found = registry.readLiveWindows(windows, (pid) => pid === 10);

    assert.deepEqual(found.map((entry) => entry.folder).sort(), ['P:\\repos\\Rehlko\\api', 'y']);
    assert.deepEqual(readdirSync(windows).sort(), ['10.json', '40.json', 'notes.txt']);
  });
});

test('a missing registry folder means no windows', () => {
  withFolder((folder) => {
    assert.deepEqual(registry.readLiveWindows(join(folder, 'absent'), () => true), []);
  });
});

test('atomic writes create the folder, replace the target and leave no temporary file', () => {
  withFolder((folder) => {
    const file = join(folder, 'focus', '42.json');

    registry.writeAtomically(file, '{"session":"a"}');
    registry.writeAtomically(file, '{"session":"b"}');

    assert.equal(readFileSync(file, 'utf8'), '{"session":"b"}');
    assert.deepEqual(readdirSync(join(folder, 'focus')), ['42.json']);
    assert.equal(existsSync(`${file}.${process.pid}.tmp`), false);
  });
});

test('unreadable JSON reads as undefined', () => {
  withFolder((folder) => {
    const file = join(folder, 'bad.json');

    writeFileSync(file, 'nope');
    assert.equal(registry.readJson(file), undefined);
    assert.equal(registry.readJson(join(folder, 'missing.json')), undefined);
    writeFileSync(file, '{"session":"tester"}');
    assert.deepEqual(registry.readJson(file), { session: 'tester' });
  });
});
