const fs = require('node:fs');
const path = require('node:path');
const status = require('./status-core');

const readSessionFiles = (directory) => {
  if (!fs.existsSync(directory))
    return { readable: [], unreadableIds: new Set() };

  const readable = [];
  const unreadableIds = new Set();

  for (const entry of fs.readdirSync(directory).filter((name) => name.endsWith('.jsonl'))) {
    const id = entry.slice(0, -'.jsonl'.length);
    let events = [];

    try {
      events = status.parseEvents(fs.readFileSync(path.join(directory, entry), 'utf8'));
    } catch {
      events = [];
    }

    if (events.length > 0)
      readable.push({ id, events });
    else
      unreadableIds.add(id);
  }

  return { readable, unreadableIds };
};

module.exports = { readSessionFiles };
