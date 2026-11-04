const fs = require('fs');
const f = 'F:\\__AI__\\work\\qwen-code\\packages\\cli\\src\\ui\\commands\\arena-text-commands.ts';
let s = fs.readFileSync(f, 'utf8');
if (s.includes('(?:\\\\s+([\\\\s\\\\S]*))?')) { console.log('already'); process.exit(0); }
const before = "const m = args.match(/^\\s*--models\\s+(\\S+)\\s+([\\s\\S]*)$/);";
if (!s.includes(before)) { console.error('anchor missing'); process.exit(1); }
s = s.replace(before, "const m = args.match(/^\\s*--models\\s+(\\S+)(?:\\s+([\\s\\S]*))?$/);");
fs.writeFileSync(f, s, 'utf8');
console.log('patched parseSideArgs');
