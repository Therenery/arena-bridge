const fs = require('fs');
const B = 'F:\\__AI__\\work\\qwen-code\\';
let n = 0;
// ink footer
{
  const f = B + 'packages\\cli\\src\\ui\\components\\Footer.tsx';
  let s = fs.readFileSync(f, 'utf8');
  const old = "{arenaStatus.mode === 'direct' &&";
  if (s.includes(old)) {
    s = s.replace(old, "{arenaStatus.mode !== 'agent' &&");
    s = s.replace("              {'Arena: Direct (no agent)'}", "              {arenaModeLabel(arenaStatus.mode)}");
    fs.writeFileSync(f, s, 'utf8'); console.log('patched Footer.tsx'); n++;
  } else console.log('ink anchor missing');
}
// opentui footer
{
  const f = B + 'packages\\cli\\src\\ui\\opentui\\opentui-footer.tsx';
  let s = fs.readFileSync(f, 'utf8');
  const old = "{arenaStatus.mode === 'direct' && (";
  if (s.includes(old)) {
    s = s.replace(old, "{arenaStatus.mode !== 'agent' && (");
    s = s.replace("{truncateToWidth('Arena: Direct (no agent)', statusWidth)}", '{truncateToWidth(arenaModeLabel(arenaStatus.mode), statusWidth)}');
    fs.writeFileSync(f, s, 'utf8'); console.log('patched opentui-footer.tsx'); n++;
  } else console.log('opentui anchor missing');
}
// helper in arena-mode.ts
{
  const f = B + 'packages\\cli\\src\\ui\\arena-mode.ts';
  let s = fs.readFileSync(f, 'utf8');
  if (!s.includes('arenaModeLabel')) {
    const anchor = 'export function subscribeArenaStatus(';
    const add = [
      '/** 页脚用的模式标签；agent 模式不显示（它由仓库行代表）。 */',
      'export function arenaModeLabel(mode: ArenaChatMode): string {',
      "  if (mode === 'direct') return 'Arena: Direct (no agent)';",
      "  if (mode === 'battle') return 'Arena: Battle';",
      "  if (mode === 'side') return 'Arena: Side by Side';",
      "  return '';",
      '}',
      '',
      '',
    ].join('\n');
    s = s.replace(anchor, add + anchor);
    fs.writeFileSync(f, s, 'utf8'); console.log('patched arena-mode.ts');
  }
}
