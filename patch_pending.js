const fs = require('fs');
const f = 'F:\\__AI__\\work\\qwen-code\\packages\\cli\\src\\ui\\arena-mode.ts';
let s = fs.readFileSync(f, 'utf8');
if (s.includes('let pending = false;')) { console.log('already'); process.exit(0); }
s = s.replace('let primed = false;', 'let primed = false;\nlet pending = false;');
s = s.replace('  if (primed) return;', '  if (primed || pending) return;');
s = s.replace("  if (process.env['NODE_ENV'] === 'test') return;", "  if (process.env['NODE_ENV'] === 'test') return;\n  pending = true;");
s = s.replace('    .finally(() => clearTimeout(timer));', '    .finally(() => {\n      pending = false;\n      clearTimeout(timer);\n    });');
fs.writeFileSync(f, s, 'utf8');
console.log('patched pending guard');
