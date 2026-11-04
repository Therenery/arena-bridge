const body = { model: 'arena-agent', stream: false, user: 'cli-mode-test', metadata: { mode: 'battle' }, messages: [{ role: 'user', content: '用一句话说明 AbortSignal 在 fetch 里有什么用' }] };
(async () => {
  const r = await fetch('http://127.0.0.1:17892/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  console.log('STATUS ' + r.status);
  console.log(((j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || JSON.stringify(j)).slice(0, 1200));
})();