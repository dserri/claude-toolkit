const fs = require('node:fs');
const path = require('node:path');
const status = require('./status-core');

const writeAtomically = (file, content) => {
  const temporary = `${file}.${process.pid}.tmp`;

  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(temporary, content);
  fs.renameSync(temporary, file);
};

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
};

const readLiveWindows = (directory, isAlive) => {
  if (!fs.existsSync(directory))
    return [];

  const live = [];

  for (const fileName of fs.readdirSync(directory).filter((entry) => entry.endsWith('.json'))) {
    const file = path.join(directory, fileName);
    const [entry] = status.liveWindows([readJson(file)], isAlive);

    if (entry)
      live.push(entry);
    else
      fs.rmSync(file, { force: true });
  }

  return live;
};

module.exports = { readJson, readLiveWindows, writeAtomically };
