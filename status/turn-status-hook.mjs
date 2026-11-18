const INSTRUCTION = 'End every turn with a final line on its own: `STATUS: QUESTION` when you need the developer\'s answer or decision, `STATUS: DONE` otherwise. The developer\'s session view reads it.';

if (!(process.env.CLAUDE_CODE_ENTRYPOINT ?? '').startsWith('sdk'))
  process.stdout.write(`${INSTRUCTION}\n`);
