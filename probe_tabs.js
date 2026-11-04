const CDP = 'http://127.0.0.1:9222';
(async () => {
  const list = await (await fetch(CDP + '/json/list')).json();
  const pages = list.filter((t) => t.type === 'page' && /arena\.ai/.test(t.url));
  for (const p of pages) {
    const ws = new WebSocket(p.webSocketDebuggerUrl);
    let id = 0; const pending = new Map();
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const q = pending.get(m.id); pending.delete(m.id); q(m.result); } };
    const send = (method, params) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
    await new Promise((r) => { ws.onopen = r; });
    const info = await send('Runtime.evaluate', { expression: "JSON.stringify({t:location.pathname,car:[].slice.call(document.querySelectorAll('div')).filter(function(e){return String(e.className||'').indexOf('@container/carousel')>=0}).length,txt:(document.body.innerText||'').length,has:((document.body.innerText||'').indexOf('严格的代码审查者')>=0),tail:(document.body.innerText||'').slice(-200)})", returnByValue: true });
    console.log(p.url.slice(0, 70) + ' :: ' + (info.result ? info.result.value : 'err'));
    ws.close();
  }
})();