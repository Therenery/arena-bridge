const fs = require('fs');
const B = 'F:\\__AI__\\work\\qwen-code\\';
function edit(rel, fn) {
  const f = B + rel;
  let s = fs.readFileSync(f, 'utf8');
  const out = fn(s);
  if (out === s) { console.log('NO CHANGE ' + rel); return; }
  fs.writeFileSync(f, out, 'utf8');
  console.log('patched ' + rel);
}

edit('packages\\core\\src\\core\\openaiContentGenerator\\pipeline.ts', (s) => {
  const old = [
    "      const models = process.env['ARENA_SIDE_MODELS'];",
    '      baseRequest.metadata = models',
    "        ? { mode: arenaMode, models: models.split(',').filter(Boolean) }",
    '        : { mode: arenaMode };',
  ].join('\n');
  const neu = [
    "      const models = process.env['ARENA_SIDE_MODELS'];",
    '      baseRequest.metadata = models',
    '        ? { mode: arenaMode, models }',
    '        : { mode: arenaMode };',
  ].join('\n');
  return s.replace(old, neu);
});

edit('packages\\cli\\src\\ui\\components\\Footer.tsx', (s) => {
  return s.replace(
    "import { primeArenaRepo, useArenaStatus } from '../arena-mode.js';",
    "import { arenaModeLabel, primeArenaRepo, useArenaStatus } from '../arena-mode.js';",
  );
});

edit('packages\\cli\\src\\ui\\opentui\\opentui-footer.tsx', (s) => {
  return s.replace(
    "import { primeArenaRepo, useArenaStatus } from '../arena-mode.js';",
    "import { arenaModeLabel, primeArenaRepo, useArenaStatus } from '../arena-mode.js';",
  );
});
