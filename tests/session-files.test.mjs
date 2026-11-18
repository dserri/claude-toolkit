import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sessionFiles from '../vscode/session-files.js';
import status from '../vscode/status-core.js';

test('readable session files are parsed; empty or unreadable ones are reported, not treated as activity', () => {
  const folder = mkdtempSync(join(tmpdir(), 'toolkit-session-files-'));

  try {
    writeFileSync(join(folder, 'live.jsonl'), '{"t":1,"event":"SessionStart"}\n');
    writeFileSync(join(folder, 'empty.jsonl'), '');
    writeFileSync(join(folder, 'garbled.jsonl'), 'not json\n');
    writeFileSync(join(folder, 'other.txt'), 'ignored');

    const { readable, unreadableIds } = sessionFiles.readSessionFiles(folder);

    assert.deepEqual(readable.map((entry) => entry.id), ['live']);
    assert.deepEqual([...unreadableIds].sort(), ['empty', 'garbled']);

    const sessions = readable.map(({ id, events }) => status.sessionState({ id, events, now: 10, stuckMs: 1000 }));

    assert.deepEqual(status.pruneHidden({ live: 1, empty: 5, gone: 3 }, sessions, unreadableIds), { live: 1, empty: 5 });
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test('a missing sessions folder means no sessions', () => {
  assert.deepEqual(sessionFiles.readSessionFiles(join(tmpdir(), 'toolkit-absent-folder-xyz')), { readable: [], unreadableIds: new Set() });
});
