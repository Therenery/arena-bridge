const fs = require('fs');
const base = 'F:\\__AI__\\work\\qwen-code\\';
function edit(rel, fn) {
  const f = base + rel;
  let s = fs.readFileSync(f, 'utf8');
  const out = fn(s);
  if (out === s) { console.log('NO CHANGE ' + rel); return; }
  fs.writeFileSync(f, out, 'utf8');
  console.log('patched ' + rel);
}

edit('packages\\cli\\src\\ui\\commands\\arena-text-commands.ts', (s) => {
  s = s.replace('const BATTLE_TIMEOUT_MS = 300000;', '// 强模型 + 长 prompt 常常要跑几分钟，5 分钟不够\nconst BATTLE_TIMEOUT_MS = 900000;');
  if (!s.includes('cleanPane')) {
    const anchor = 'function paneBlock(pane: BattlePane | undefined, fallback: string): string {';
    const helper = [
      '/** 页面上「Thought for 5 seconds」这种思考提示不属于答案正文 */',
      'function cleanPaneText(text: string): string {',
      '  return text',
      '    .replace(/^Thought for [^\\n]*\\n+/i, \'\')',
      '    .replace(/^思考了[^\\n]*\\n+/i, \'\')',
      '    .trim();',
      '}',
      '',
      '',
    ].join('\n');
    s = s.replace(anchor, helper + anchor);
    s = s.replace("const text = (pane?.text || '').trim();", "const text = cleanPaneText((pane?.text || '').trim());");
  }
  return s;
});

edit('packages\\cli\\src\\ui\\arena-mode.ts', (s) => {
  if (!s.includes('primed = true;')) return s;
  s = s.replace('  primed = true;\n  const base', '  const base');
  s = s.replace("      if (typeof repo === 'string' && repo) setArenaRepo(repo);", "      if (typeof repo === 'string' && repo) { setArenaRepo(repo); primed = true; }");
  return s;
});
