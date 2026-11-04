const fs = require('fs');
const p = process.argv[2];
let s = fs.readFileSync(p, 'utf8');
if (s.includes('battleRounds.set(name, { panes: p')) { console.log('already'); process.exit(0); }
const eol = s.includes('\r\n') ? '\r\n' : '\n';

// 1) opts 带上 models
const optOld = "const opts = { model: body.model && body.model !== 'auto' ? body.model : '', mode: (body.metadata && body.metadata.mode) || 'agent', fresh };";
if (!s.includes(optOld)) { console.error('opts anchor missing'); process.exit(1); }
const optNew = "const opts = { model: body.model && body.model !== 'auto' ? body.model : '', mode: (body.metadata && body.metadata.mode) || 'agent', models: (body.metadata && body.metadata.models) || [], fresh };";
s = s.replace(optOld, optNew);

// 2) run 开头插入 battle/side 分支
const runOld = '    const run = async () => {' + eol + '      if (!(await ensureChrome())) throw new Error(\'chrome unavailable\');';
if (!s.includes(runOld)) { console.error('run anchor missing'); process.exit(1); }
const branch = [
  '    const run = async () => {',
  '      // 常驻 battle/side 模式：普通提问也走并排，两栏答案合成一条消息',
  "      if (opts.mode === 'battle' || opts.mode === 'side') {",
  "        const key = name + '#battle';",
  '        if (!(await ensureChrome())) throw new Error(\'chrome unavailable\');',
  '        const s2 = await getSession(key, { mode: opts.mode, models: opts.models, fresh: true });',
  '        live = s2;',
  '        s2.busy = true;',
  '        try {',
  '          const gap = Date.now() - (s2.lastAsk || 0);',
  '          if (gap < MIN_GAP_MS) await sleep(MIN_GAP_MS - gap);',
  '          s2.lastAsk = Date.now();',
  '          const p = await askBattle(s2, prompt);',
  '          battleRounds.set(name, { panes: p, mode: opts.mode, at: Date.now() });',
  "          const text = '**A · ' + (p.a.label || 'A') + '**\\n\\n' + (p.a.text || '') + '\\n\\n---\\n\\n**B · ' + (p.b.label || 'B') + '**\\n\\n' + (p.b.text || '') + '\\n\\n投票：/vote a | b | tie | both';",
  '          if (wantStream) chunk({ content: text });',
  '          return { text };',
  '        } finally {',
  '          s2.busy = false;',
  '        }',
  '      }',
  '      if (!(await ensureChrome())) throw new Error(\'chrome unavailable\');',
].join(eol);
s = s.replace(runOld, branch);
fs.writeFileSync(p, s, 'utf8');
console.log('patched ask battle branch');
