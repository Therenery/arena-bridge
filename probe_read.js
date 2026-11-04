const CDP = 'http://127.0.0.1:9222';
const PANES = "(function(){var cs=[].slice.call(document.querySelectorAll('div')).filter(function(e){return String(e.className||'').indexOf('@container/carousel')>=0});if(!cs.length)return '';var c=cs[cs.length-1];if(c.childElementCount!==2)return '';function pane(k){var sp=[].slice.call(k.querySelectorAll('span')).map(function(s){return (s.innerText||'').trim()}).filter(Boolean);var t=(k.innerText||'').trim();var lb=sp[0]||'';return lb+'||'+t.slice(lb.length).trim()}return pane(c.children[0])+String.fromCharCode(10)+'====='+String.fromCharCode(10)+pane(c.children[1])})()";
(async () => {
  const list = await (await fetch(CDP + '/json/list')).json();
  const pages = list.filter((t) => t.type === 'page' && /arena\.ai/.test(t.url));
  for (const p of pages.reverse()) {
    const ws = new WebSocket(p.webSocketDebuggerUrl);
    let id = 0; const pending = new Map();
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const q = pending.get(m.id); pending.delete(m.id); q(m.result); } };
    const send = (method, params) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
    await new Promise((r) => { ws.onopen = r; });
    const has = await send('Runtime.evaluate', { expression: "(document.body.innerText||'').indexOf('严格的代码审查者')>=0", returnByValue: true });
    if (has.result && has.result.value) {
      const out = await send('Runtime.evaluate', { expression: PANES, returnByValue: true });
      console.log('URL ' + p.url);
      console.log(out.result.value);
      ws.close();
      process.exit(0);
    }
    ws.close();
  }
  console.log('not found');
})();