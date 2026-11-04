const fs = require('fs');
const p = process.argv[2];
let s = fs.readFileSync(p, 'utf8');
const eol = s.includes('\r\n') ? '\r\n' : '\n';
if (!s.includes('常驻 battle/side 模式')) { console.log('branch missing'); process.exit(0); }

// 1) 删掉误插到 /battle 端点 run() 里的那段
const re = new RegExp('      // 常驻 battle/side 模式[\\s\\S]*?\\r?\\n      \\}' + (eol === '\r\n' ? '\\r\\n' : '\\n') + '(?=      if \\(!\\(await ensureChrome\\(\\)\\)\\))');
if (!re.test(s)) { console.error('remove regex no match'); process.exit(1); }
s = s.replace(re, '');

// 2) 插到 v1 的 run()：以 getSession(name, opts) 为锚点
const anchor = '      const s = await getSession(name, opts);';
if (!s.includes(anchor)) { console.error('v1 anchor missing'); process.exit(1); }
const branch = [
  '      // 常驻 battle/side 模式：普通提问也走并排，两栏答案合成一条消息',
  "      if (opts.mode === 'battle' || opts.mode === 'side') {",
  "        const key = name + '#battle';",
  "        if (!(await ensureChrome())) throw new Error('chrome unavailable');",
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
  '',
].join(eol);
s = s.replace(anchor, branch + anchor);
fs.writeFileSync(p, s, 'utf8');
console.log('moved branch to v1 run');
