#!/usr/bin/env node
/**
 * arena_bridge.js - local OpenAI-ish bridge for arena.ai
 * Design: never forge requests. Drive the real page with real input events,
 * passively tap the page's own fetch stream. No cookies stored, no tokens minted.
 */
const http = require('http');
const { exec } = require('child_process');

const CDP_PORT = 9222;
const PORT = 17892;
const HOST = '127.0.0.1';
const MIN_GAP_MS = 3000;
const READY_TIMEOUT_MS = 60000;
const ASK_TIMEOUT_MS = 600000;
const POLL_MS = 400;
const MAX_QUEUE = 4;

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- CDP plumbing ---------- */
function cdpApi(method, path) {
  return new Promise((res, rej) => {
    const req = http.request({ host: '127.0.0.1', port: CDP_PORT, path, method, timeout: 8000 }, r => {
      let b = '';
      r.on('data', d => (b += d));
      r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { res(b); } });
    });
    req.on('timeout', () => { req.destroy(new Error('cdp timeout')); });
    req.on('error', rej);
    req.end();
  });
}

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.closed = false;
    ws.onmessage = e => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.id && this.pending.has(m.id)) {
        const p = this.pending.get(m.id); this.pending.delete(m.id);
        m.error ? p.rej(new Error(m.error.message)) : p.res(m.result);
      }
    };
    ws.onclose = () => { this.closed = true; for (const [, p] of this.pending) p.rej(new Error('ws closed')); this.pending.clear(); };
  }
  send(method, params = {}, timeoutMs = 20000) {
    if (this.closed) return Promise.reject(new Error('ws closed'));
    const id = ++this.id;
    return new Promise((res, rej) => {
      const t = setTimeout(() => { this.pending.delete(id); rej(new Error(method + ' timeout')); }, timeoutMs);
      this.pending.set(id, { res: v => { clearTimeout(t); res(v); }, rej: e => { clearTimeout(t); rej(e); } });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async ev(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r && r.exceptionDetails) throw new Error('js: ' + (r.exceptionDetails.text || '') + ' ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || ''));
    return r && r.result ? r.result.value : undefined;
  }
  async evJson(expr) { const v = await this.ev(expr); try { return JSON.parse(v); } catch { return null; } }
  close() { try { this.ws.close(); } catch {} }
}

async function connectTab(tabId) {
  const list = await cdpApi('GET', '/json/list');
  const t = Array.isArray(list) ? list.find(x => x.id === tabId) : null;
  if (!t) throw new Error('tab gone');
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws open failed')); });
  const c = new CDP(ws);
  await c.send('Runtime.enable');
  await c.send('Page.enable');
  return c;
}

/* ---------- injected tap ---------- */
const INJECT = String.raw`
(() => {
  if (window.__arbInstalled) return;
  window.__arbInstalled = true;
  window.__arbSeq = 0;
  window.__arbStreams = [];
  const interesting = u => /nextjs-api\/stream|ai-proxy\/realtime/i.test(u);
  const push = (st, o) => {
    try { st.frames.push(o); if (st.frames.length > 6000) st.frames.splice(0, 1500); } catch (e) {}
  };
  const note = (st, line) => {
    try {
      if (line.indexOf('data: ') === 0) {
        var o = null;
        try { o = JSON.parse(line.slice(6)); } catch (e) { o = null; }
        if (o && Array.isArray(o.records)) {
          for (var i = 0; i < o.records.length; i++) {
            var b = null;
            try { b = JSON.parse(o.records[i].body); } catch (e) { continue; }
            var d = (b && b.data) || {};
            if (d.type) push(st, { e: d.type, d: (typeof d.delta === 'string' ? d.delta : ''), n: d.toolName || '', i: d.input || null, t: Date.now() });
          }
          return;
        }
      }
      push(st, { l: line.slice(0, 6000), t: Date.now() });
    } catch (e) { push(st, { l: String(line).slice(0, 2000), t: Date.now() }); }
  };
  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const req = args[0];
    const url = typeof req === 'string' ? req : (req && req.url) || '';
    const res = await origFetch.apply(this, args);
    try {
      if (interesting(url)) {
        const st = { id: ++window.__arbSeq, u: String(url), status: res.status, t: Date.now(), frames: [] };
        window.__arbStreams.push(st);
        if (window.__arbStreams.length > 40) window.__arbStreams.shift();
        const clone = res.clone();
        (async () => {
          const rd = clone.body.getReader();
          const dec = new TextDecoder();
          let buf = '';
          for (;;) {
            const { done, value } = await rd.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            const ls = buf.split('\n');
            buf = ls.pop();
            for (const ln of ls) { if (ln.trim()) note(st, ln); }
          }
          if (buf.trim()) note(st, buf);
          st.done = true;
        })().catch(e => { st.err = String(e); st.done = true; });
      }
    } catch (e) {}
    return res;
  };
  const XO = window.XMLHttpRequest;
  const xopen = XO.prototype.open, xsend = XO.prototype.send;
  XO.prototype.open = function (m, u) { this.__arbU = u; return xopen.apply(this, arguments); };
  XO.prototype.send = function () {
    if (interesting(String(this.__arbU || ''))) {
      const st = { id: ++window.__arbSeq, u: String(this.__arbU), status: 0, t: Date.now(), frames: [] };
      window.__arbStreams.push(st);
      this.addEventListener('progress', () => {
        try { const t = this.responseText || ''; const nl = t.lastIndexOf('\n'); if (nl > 0) note(st, t.slice(0, nl)); } catch (e) {}
      });
      this.addEventListener('load', () => { st.done = true; });
    }
    return xsend.apply(this, arguments);
  };
})();
`;

/* ---------- browser ---------- */
let chromeLaunching = false;
async function ensureChrome() {
  try { await cdpApi('GET', '/json/version'); return true; } catch (e) {}
  if (chromeLaunching) { for (let i = 0; i < 40; i++) { await sleep(1500); try { await cdpApi('GET', '/json/version'); return true; } catch (e) {} } return false; }
  chromeLaunching = true;
  log('chrome down, launching');
  try { exec('schtasks /run /tn chrome-arena', () => {}); } catch (e) { log('launch err', e.message); }
  for (let i = 0; i < 40; i++) { await sleep(1500); try { await cdpApi('GET', '/json/version'); chromeLaunching = false; log('chrome up'); return true; } catch (e) {} }
  chromeLaunching = false; log('chrome launch timeout'); return false;
}

const VERIFY_JS = "(()=>{try{var t=document.body.innerText||'';return /Just a moment|Verify you are human|确认您是真人|Checking your browser|Attention Required/i.test(t)||!!document.querySelector('iframe[src*=challenges.cloudflare.com],#challenge-form,#challenge-stage')}catch(e){return false}})()";
const EDITOR_SEL = `document.querySelector('textarea[name=message]')||document.querySelector('.ProseMirror[contenteditable="true"]')`;
const READY_JS = `!!(${EDITOR_SEL})`;
const VAL_JS = `(function(){var e=${EDITOR_SEL};if(!e)return 0;return (e.value!==undefined?e.value:(e.innerText||'')).length})()`;

const RESUME_JS = "(function(){var bs=[].slice.call(document.querySelectorAll('button'));var b=bs.filter(function(x){return /继续工作|Continue working|Keep working|Continue/i.test((x.innerText||'').trim())})[0];if(b){b.click();return 1}return 0})()";
const REVIEW_JS = "(()=>{try{var t=(document.body&&document.body.innerText)||'';return t.indexOf('此任务成功了吗')>=0||t.indexOf('Did this task succeed')>=0}catch(e){return false}})()";

async function waitReady(c) {
  const t0 = Date.now();
  while (Date.now() - t0 < READY_TIMEOUT_MS) {
    if (await c.ev(VERIFY_JS)) throw new Error('NEED_VERIFY');
    if (await c.ev(READY_JS)) { await sleep(600); return; }
    if (await c.ev(REVIEW_JS)) {
      log('review state, clicking resume');
      const ok = await c.ev(RESUME_JS);
      await sleep(2500);
      if (!ok) { await c.ev("document.body.click()"); await sleep(800); }
      continue;
    }
    await sleep(700);
  }
  throw new Error('page not ready (no composer)');
}

async function openTab(model, mode) {
  const q = [];
  if (model && !/^arena-/.test(model)) q.push('model_a=' + encodeURIComponent(model));
  const base = mode === 'agent' ? '/agent' : '/text/direct';
  const url = 'https://arena.ai' + base + (q.length ? '?' + q.join('&') : '');
  const tab = await cdpApi('PUT', '/json/new?' + encodeURIComponent('about:blank'));
  if (!tab || !tab.id) throw new Error('cannot create tab: ' + JSON.stringify(tab).slice(0, 120));
  const c = await connectTab(tab.id);
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: INJECT });
  await c.send('Page.navigate', { url });
  await waitReady(c);
  log('tab ready', tab.id, url);
  return { tabId: tab.id, cdp: c, url };
}

/* ---------- input ---------- */
async function keyCombo(c, modifiers, key, code, vk) {
  await c.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', modifiers, key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers, key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
}

async function typePrompt(c, text) {
  await c.ev(`(function(){var e=${EDITOR_SEL};if(e)e.focus()})()`);
  await sleep(150);
  await keyCombo(c, 2, 'a', 'KeyA', 65);
  await sleep(100);
  await keyCombo(c, 0, 'Backspace', 'Backspace', 8);
  await sleep(150);
  await c.send('Input.insertText', { text });
  await sleep(400);
  const n = await c.ev(VAL_JS);
  if (!n) throw new Error('typing failed (editor empty after insert)');
  for (const type of ['rawKeyDown', 'char', 'keyUp']) {
    await c.send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, text: type === 'char' ? '\r' : undefined, unmodifiedText: type === 'char' ? '\r' : undefined });
  }
  await sleep(400);
  const left = await c.ev(VAL_JS);
  if (left > 0) {
    // fallback: click the send button
    await c.ev("(function(){var b=[].slice.call(document.querySelectorAll('button')).filter(function(x){var l=(x.getAttribute('aria-label')||'')+(x.innerText||'');return /send|Send|提交|发送/.test(l)});if(b[0])b[0].click();return !!b[0]})()");
    await sleep(500);
  }
}

/* ---------- stream reading ---------- */
async function listStreams(c) {
  const v = await c.evJson("(function(){return JSON.stringify((window.__arbStreams||[]).map(function(s){return {id:s.id,u:s.u,t:s.t,n:s.frames.length,done:!!s.done}}))})()");
  return v || [];
}
async function readFrames(c, sid, from) {
  const v = await c.evJson("(function(){var s=(window.__arbStreams||[]).filter(function(x){return x.id===" + sid + "})[0];if(!s)return JSON.stringify({gone:true});return JSON.stringify({n:s.frames.length,done:!!s.done,f:s.frames.slice(" + from + ")})})()");
  return v;
}

/* ---------- session ---------- */
const sessions = new Map();
const histories = new Map();

async function getSession(name, opts) {
  const key = name || 'default';
  let s = sessions.get(key);
  if (s && opts.fresh) { try { await cdpApi('GET', '/json/close/' + s.tabId); } catch (e) {} try { s.cdp.close(); } catch (e) {} sessions.delete(key); s = null; }
  if (s) {
    const alive = await s.cdp.ev("1+1").catch(() => null);
    if (alive === 2) return s;
    sessions.delete(key); s = null;
  }
  const r = await openTab(opts.model, opts.mode);
  s = { name: key, tabId: r.tabId, cdp: r.cdp, model: opts.model || '', mode: opts.mode || 'direct', lastAsk: 0, busy: false };
  sessions.set(key, s);
  return s;
}

/* ---------- ask ---------- */
async function askOnce(s, prompt, onDelta) {
  const c = s.cdp;
  if (await c.ev(VERIFY_JS)) throw new Error('NEED_VERIFY');
  if (!(await c.ev(READY_JS))) { await waitReady(c); }
  const preList = (await listStreams(c)) || [];
  const pre = new Map(preList.map(x => [x.id, x.n]));
  const sendTs = Date.now();
  await typePrompt(c, prompt);
  const t0 = Date.now();
  let text = '', reasoning = '', done = false, routed = [], tick = 0, doneNoTextAt = 0, doneSeen = false;
  const cursors = new Map();
  const tools = [];
  let lastFrameAt = Date.now();

  const parseLine = f => {
    if (f.e) {
      const t = f.d || '';
      if (f.e === 'text-delta') { if (t) { text += t; onDelta && onDelta({ type: 'text', text: t }); } }
      else if (f.e === 'reasoning-delta') { if (t) { reasoning += t; onDelta && onDelta({ type: 'reasoning', text: t }); } }
      else if (f.e === 'tool-input-available') { tools.push({ name: f.n, input: f.i }); onDelta && onDelta({ type: 'tool', name: f.n, input: f.i }); }
      else if (f.e === 'finish') { done = true; }
      else if (f.e === 'error') { const err = new Error('agent: ' + JSON.stringify(f).slice(0, 300)); err.fatal = true; throw err; }
      return;
    }
    const line = f.l || '';
    if (!line) return;
    if (line.startsWith('a0:')) {
      let d = ''; try { d = JSON.parse(line.slice(3)); } catch (e) { d = line.slice(3).replace(/^"|"$/g, ''); }
      if (d) { text += d; onDelta && onDelta({ type: 'text', text: d }); }
      return;
    }
    if (line.startsWith('ag:')) {
      let d = ''; try { d = JSON.parse(line.slice(3)); } catch (e) { d = line.slice(3); }
      if (d) { reasoning += d; onDelta && onDelta({ type: 'reasoning', text: d }); }
      return;
    }
    if (line.startsWith('a2:')) {
      try { const a = JSON.parse(line.slice(3)); if (Array.isArray(a) && a[0] && a[0].type === 'routed_model') routed.push(a[0].organization); } catch (e) {}
      return;
    }
    if (line.startsWith('a3:')) {
      let m = line.slice(3); try { m = JSON.parse(m); } catch (e) {}
      const err = new Error('upstream: ' + String(m).slice(0, 300)); err.fatal = true; throw err;
    }
    if (line.startsWith('ad:')) { done = true; return; }
    if (line.startsWith('data: ')) {
      let o; try { o = JSON.parse(line.slice(6)); } catch (e) { return; }
      if (!o || !Array.isArray(o.records)) return;
      for (const rec of o.records) {
        let b; try { b = JSON.parse(rec.body); } catch (e) { continue; }
        const d = (b && b.data) || {};
        if (d.type === 'text-delta') { const t = d.delta || ''; if (t) { text += t; onDelta && onDelta({ type: 'text', text: t }); } }
        else if (d.type === 'reasoning-delta') { const t = d.delta || ''; if (t) { reasoning += t; onDelta && onDelta({ type: 'reasoning', text: t }); } }
        else if (d.type === 'tool-input-available') { tools.push({ name: d.toolName, input: d.input }); onDelta && onDelta({ type: 'tool', name: d.toolName, input: d.input }); }
        else if (d.type === 'finish') { done = true; }
        else if (d.type === 'error') { const err = new Error('agent: ' + JSON.stringify(d).slice(0, 300)); err.fatal = true; throw err; }
      }
    }
  };

  while (Date.now() - t0 < ASK_TIMEOUT_MS) {
    await sleep(POLL_MS);
    if (c.closed) throw new Error('tab closed');
    const now = (await listStreams(c)) || [];
    const cand = now.filter(x => /create-evaluation|create-chat|realtime|ai-proxy/.test(x.u) && (x.t >= sendTs - 1500 || pre.has(x.id)));
    if (++tick % 30 === 0) log('poll', JSON.stringify({ cur: [...cursors], len: text.length, streams: now.length, done }));
    if (!cand.length) {
      if (await c.ev(VERIFY_JS)) throw new Error('NEED_VERIFY');
      if (Date.now() - t0 > 45000) throw new Error('no stream appeared (send may have failed)');
      continue;
    }
    let anyDone = false;
    for (const st of cand) {
      if (!cursors.has(st.id)) { cursors.set(st.id, pre.get(st.id) || 0); log('stream', st.id, st.u.slice(0, 70), 'from', cursors.get(st.id)); }
      const r = await readFrames(c, st.id, cursors.get(st.id));
      if (!r || r.gone) continue;
      if (r.f && r.f.length) {
        cursors.set(st.id, r.n); lastFrameAt = Date.now();
        for (const f of r.f) parseLine(f);
      }
      if (r.done) anyDone = true;
    }
    if (anyDone) doneSeen = true;
    if (done) break;
    if (doneSeen) {
      if (!doneNoTextAt) doneNoTextAt = Date.now();
      if (text.trim()) { done = true; break; }
      if (Date.now() - doneNoTextAt > 20000) throw new Error('stream ended with no text (session may be in review state)');
    }
    if (Date.now() - lastFrameAt > 150000) throw new Error('stalled: no frame for 150s');
  }
  if (!text.trim()) throw new Error('empty answer from upstream');
  return { text, reasoning, routed: routed[routed.length - 1] || '', done, tools };
}

/* ---------- queue ---------- */
const queue = [];
let working = false;
function enqueue(fn) {
  return new Promise((res, rej) => {
    if (queue.length >= MAX_QUEUE) return rej(new Error('busy: queue full'));
    queue.push({ fn, res, rej });
    pump();
  });
}
async function pump() {
  if (working) return;
  working = true;
  while (queue.length) {
    const job = queue.shift();
    try { job.res(await job.fn()); } catch (e) { job.rej(e); }
  }
  working = false;
}

/* ---------- http ---------- */
function readBody(req) {
  return new Promise((res, rej) => {
    let b = ''; let n = 0;
    req.on('data', d => { n += d.length; if (n > 4 * 1024 * 1024) { rej(new Error('body too large')); req.destroy(); } b += d; });
    req.on('end', () => res(b));
    req.on('error', rej);
  });
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const send = (code, obj) => { const s = JSON.stringify(obj); res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(s) }); res.end(s); };

  if (u.pathname === '/health') {
    const ok = await cdpApi('GET', '/json/version').then(() => true).catch(() => false);
    return send(200, { ok, chrome: ok, sessions: [...sessions.keys()], queue: queue.length, working });
  }
  if (u.pathname === '/debug') {
    const name = u.searchParams.get('session') || 'default';
    const s = sessions.get(name);
    if (!s) return send(404, { error: 'no session', sessions: [...sessions.keys()] });
    try {
      const st = await s.cdp.evJson("JSON.stringify({inst:!!window.__arbInstalled,seq:window.__arbSeq,st:(window.__arbStreams||[]).map(function(x){return{id:x.id,u:x.u,n:x.frames.length,done:!!x.done}})})");
      const href = await s.cdp.ev('location.href');
      return send(200, { state: st, url: href });
    } catch (e) { return send(500, { error: e.message }); }
  }
  if (u.pathname === '/models') {
    return send(200, { models: ['auto', 'max'] });
  }
  if (u.pathname === '/new') {
    const name = u.searchParams.get('session') || 'default';
    histories.delete(name);
    const s = sessions.get(name);
    if (s) { try { await cdpApi('GET', '/json/close/' + s.tabId); } catch (e) {} try { s.cdp.close(); } catch (e) {} sessions.delete(name); }
    return send(200, { ok: true });
  }
  if ((u.pathname === '/v1/chat/completions' || u.pathname === '/chat/completions') && req.method === 'POST') {
    let body;
    try { body = JSON.parse(await readBody(req) || '{}'); } catch (e) { return send(400, { error: { message: 'bad json', type: 'invalid_request_error' } }); }
    const msgs = Array.isArray(body.messages) ? body.messages : [];
    const sys = msgs.filter(m => m && m.role === 'system').map(m => String(m.content || '')).join('\n\n');
    log('v1 msgs=' + msgs.length + ' roles=' + msgs.map(m => m && m.role).join(','));
    const prior = msgs.filter(m => m && m.role !== 'system' && m.content);
    if (!prior.length) return send(400, { error: { message: 'no user message', type: 'invalid_request_error' } });
    const last = String(prior[prior.length - 1].content || '');
    const name = body.user || body.session || 'main';
    const bodyPrior = prior.length > 1 ? prior.slice(0, -1) : null;
    const srvPrior = histories.get(name) || [];
    const useHist = bodyPrior && bodyPrior.length ? bodyPrior : (srvPrior.length ? srvPrior : null);
    let prompt = last;
    if (useHist) {
      const hist = useHist.map(m => (m.role === 'assistant' ? '助手' : '用户') + '：' + String(m.content)).join('\n\n');
      prompt = '以下是本次对话之前的记录，请接着最后一条继续回答，不要复述历史。\n\n【对话记录】\n' + hist + '\n\n【当前问题】\n' + last;
    }
    if (sys) prompt = sys + '\n\n' + prompt;
    if (!prompt.trim()) return send(400, { error: { message: 'empty prompt', type: 'invalid_request_error' } });
    const opts = { model: body.model && body.model !== 'auto' ? body.model : '', mode: (body.metadata && body.metadata.mode) || 'agent', fresh: !body.arena_continue };
    const wantStream = !!body.stream;
    const id = 'chatcmpl-' + Date.now().toString(36);
    const created = Math.floor(Date.now() / 1000);

    const run = async () => {
      if (!(await ensureChrome())) throw new Error('chrome unavailable');
      const s = await getSession(name, opts);
      const gap = Date.now() - (s.lastAsk || 0);
      if (gap < MIN_GAP_MS) await sleep(MIN_GAP_MS - gap);
      s.lastAsk = Date.now();
      const r = await askOnce(s, prompt, wantStream ? (d => {
        if (d.type !== 'text') return;
        try {
          res.write('data: ' + JSON.stringify({ id, object: 'chat.completion.chunk', created, model: body.model || 'arena-agent', choices: [{ index: 0, delta: { content: d.text }, finish_reason: null }] }) + '\n\n');
        } catch (e) {}
      }) : null);
      s.lastAsk = Date.now();
      if (r && r.text) {
        const h = histories.get(name) || [];
        h.push({ role: 'user', content: last });
        h.push({ role: 'assistant', content: r.text });
        if (h.length > 24) h.splice(0, h.length - 24);
        histories.set(name, h);
      }
      return r;
    };

    if (wantStream) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write(': open\n\n');
      try {
        const r = await enqueue(run);
        res.write('data: ' + JSON.stringify({ id, object: 'chat.completion.chunk', created, model: body.model || 'arena-agent', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }) + '\n\n');
        res.write('data: [DONE]\n\n');
      } catch (e) {
        log('v1 error:', e.message);
        res.write('data: ' + JSON.stringify({ error: { message: e.message, type: 'upstream_error' } }) + '\n\n');
      }
      res.end();
      return;
    }

    try {
      const r = await enqueue(run);
      return send(200, {
        id, object: 'chat.completion', created, model: body.model || 'arena-agent',
        choices: [{ index: 0, message: { role: 'assistant', content: r.text }, finish_reason: 'stop' }],
        usage: { prompt_tokens: prompt.length, completion_tokens: (r.text || '').length, total_tokens: prompt.length + (r.text || '').length },
        arena: { tools: r.tools, reasoning: r.reasoning, routed: r.routed }
      });
    } catch (e) {
      log('v1 error:', e.message);
      return send(500, { error: { message: e.message, type: 'upstream_error' } });
    }
  }
  if (u.pathname === '/v1/models') {
    return send(200, { object: 'list', data: [{ id: 'arena-agent', object: 'model', created: 0, owned_by: 'arena' }, { id: 'arena-direct', object: 'model', created: 0, owned_by: 'arena' }] });
  }
  if (u.pathname === '/ask' && req.method === 'POST') {
    let body;
    try { body = JSON.parse(await readBody(req) || '{}'); } catch (e) { return send(400, { error: 'bad json' }); }
    const prompt = String(body.prompt || '').trim();
    if (!prompt) return send(400, { error: 'empty prompt' });
    const name = body.session || 'default';
    const stream = !!body.stream;
    const opts = { model: body.model || '', mode: body.mode || 'agent', fresh: !!body.new || !body.continue_session };

    const run = async () => {
      if (!(await ensureChrome())) throw new Error('chrome unavailable');
      const s = await getSession(name, opts);
      const gap = Date.now() - (s.lastAsk || 0);
      if (gap < MIN_GAP_MS) await sleep(MIN_GAP_MS - gap);
      s.lastAsk = Date.now();
      let deltas = [];
      const r = await askOnce(s, prompt, d => { deltas.push(d); if (stream) { try { res.write('data: ' + JSON.stringify(d) + '\n\n'); } catch (e) {} } });
      s.lastAsk = Date.now();
      return r;
    };

    if (stream) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write(': open\n\n');
      try {
        const r = await enqueue(run);
        res.write('data: ' + JSON.stringify({ type: 'done', text: r.text, reasoning: r.reasoning, routed: r.routed, tools: r.tools }) + '\n\n');
      } catch (e) {
        res.write('data: ' + JSON.stringify({ type: 'error', error: e.message }) + '\n\n');
      }
      res.end();
      return;
    }

    try {
      const r = await enqueue(run);
      return send(200, { ok: true, text: r.text, reasoning: r.reasoning, routed: r.routed, tools: r.tools });
    } catch (e) {
      log('ask error:', e.message);
      const code = /NEED_VERIFY/.test(e.message) ? 409 : /busy/.test(e.message) ? 429 : 500;
      return send(code, { ok: false, error: e.message });
    }
  }
  send(404, { error: 'not found' });
});

server.listen(PORT, HOST, () => log('listening http://' + HOST + ':' + PORT));
process.on('uncaughtException', e => log('uncaught', e.message));
process.on('unhandledRejection', e => log('unhandled', e && e.message));
