const fs = require('fs');
const base = 'F:\\__AI__\\work\\qwen-code\\';
let n = 0;
for (const rel of ['packages\\cli\\src\\ui\\components\\Footer.tsx', 'packages\\cli\\src\\ui\\opentui\\opentui-footer.tsx']) {
  const f = base + rel;
  let s = fs.readFileSync(f, 'utf8');
  if (s.includes('arenaStatus.mode === \'agent\' && arenaStatus.repo')) { console.log('already ' + rel); continue; }
  const before = '{arenaStatus.repo &&';
  if (!s.includes(before)) { console.log('anchor missing ' + rel); continue; }
  s = s.replace(before, "{arenaStatus.mode === 'agent' && arenaStatus.repo &&");
  fs.writeFileSync(f, s, 'utf8');
  console.log('patched ' + rel);
  n++;
}
