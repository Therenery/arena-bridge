const fs = require('fs');
const p = process.argv[2];
let s = fs.readFileSync(p, 'utf8');
if (s.includes('insertText')) { console.log('already'); process.exit(0); }
const eol = s.includes('\r\n') ? '\r\n' : '\n';
const old = [
  '  const body = text.slice(0, MAX_PROMPT_CHARS);',
  '  for (let i = 0; i < body.length; i++) {',
  "    await c.send('Input.dispatchKeyEvent', { type: 'char', text: body.charAt(i) });",
  '    if (i % 25 === 24) await sleep(20);',
  '  }',
  '  await sleep(700);',
  '  const n = await c.ev(VAL_JS);',
].join(eol);
if (!s.includes(old)) { console.error('anchor missing'); process.exit(1); }
const neu = [
  '  const body = text.slice(0, MAX_PROMPT_CHARS);',
  '  const want = body.replace(/[\\s\\u00a0\\u200b]/g, \'\').length;',
  '  // 一次插入整段：逐字符发键事件要几十秒，长 prompt 期间页面容易自己跳走',
  "  await c.send('Input.insertText', { text: body });",
  '  await sleep(500);',
  '  let n = await c.ev(VAL_JS);',
  '  if (n < Math.max(1, Math.floor(want * 0.9))) {',
  '    // 回退：部分编辑器不吃 insertText，退回逐字符',
  '    for (let i = 0; i < body.length; i++) {',
  "      await c.send('Input.dispatchKeyEvent', { type: 'char', text: body.charAt(i) });",
  '      if (i % 25 === 24) await sleep(20);',
  '    }',
  '    await sleep(700);',
  '    n = await c.ev(VAL_JS);',
  '  }',
].join(eol);
s = s.replace(old, neu);
fs.writeFileSync(p, s, 'utf8');
console.log('patched insertText');
