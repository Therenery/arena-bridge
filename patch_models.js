const fs = require('fs');
const p = process.argv[2];
let s = fs.readFileSync(p, 'utf8');
if (s.includes('Array.isArray(m)')) { console.log('already'); process.exit(0); }
const old = "models: (body.metadata && body.metadata.models) || [],";
if (!s.includes(old)) { console.error('anchor missing'); process.exit(1); }
const neu = "models: (function (m) { if (Array.isArray(m)) return m.map(String).filter(Boolean).slice(0, 2); if (typeof m === 'string' && m) return m.split(',').map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 2); return []; })(body.metadata && body.metadata.models),";
s = s.replace(old, neu);
fs.writeFileSync(p, s, 'utf8');
console.log('patched models parse');
