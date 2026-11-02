'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  loadConfig,
  normalizeBridgeUrl,
  sanitizeSessionFilename,
  settingsToConfig,
} = require('../src/config');
const { parseArgs, parseCommand, parsePaths, normalizeUploadPath, buildChatRequest } = require('../src/commands');
const { SseParser, deltaEvents } = require('../src/sse');
const { ArenaBridgeClient } = require('../src/client');
const { SessionStore } = require('../src/session-store');
const { TerminalRenderer } = require('../src/cli');

test('桥地址会去掉末尾 /v1', () => {
  assert.equal(normalizeBridgeUrl('http://127.0.0.1:17892/v1/'), 'http://127.0.0.1:17892');
  assert.equal(normalizeBridgeUrl('http://127.0.0.1:17892/'), 'http://127.0.0.1:17892');
});

test('旧 provider 风格 settings 可以迁移', () => {
  const config = settingsToConfig({
    modelProviders: {
      openai: [{ id: 'arena-direct', baseUrl: 'http://127.0.0.1:17892/v1', envKey: 'MY_KEY' }],
    },
    env: { MY_KEY: 'secret' },
  });
  assert.equal(config.model, 'arena-direct');
  assert.equal(config.bridgeUrl, 'http://127.0.0.1:17892/v1');
  assert.equal(config.apiKey, 'secret');
});

test('环境变量与命令行覆盖文件配置', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-code-home-'));
  fs.writeFileSync(path.join(home, 'settings.json'), JSON.stringify({
    model: 'arena-direct',
    session: 'file-session',
  }));
  const config = loadConfig({
    homeDir: path.dirname(home),
    env: { ARENA_CODE_HOME: home, ARENA_MODEL: 'arena-agent' },
    cliOptions: { session: 'cli-session' },
  });
  assert.equal(config.model, 'arena-agent');
  assert.equal(config.mode, 'agent');
  assert.equal(config.session, 'cli-session');
});

test('命令行参数解析', () => {
  const parsed = parseArgs(['--model=arena-direct', '-s', '设计', '--no-stream', '一句话解释熵']);
  assert.equal(parsed.options.model, 'arena-direct');
  assert.equal(parsed.options.session, '设计');
  assert.equal(parsed.options.stream, false);
  assert.equal(parsed.prompt, '一句话解释熵');
  assert.throws(() => parseArgs(['--model']), /缺少参数值/);
});

test('斜杠命令与带空格的 Windows 路径解析', () => {
  assert.deepEqual(parseCommand('/Vote A'), { name: 'vote', args: 'A' });
  assert.equal(parseCommand('普通问题'), null);
  assert.deepEqual(
    parsePaths(String.raw`"C:\My Files\a.txt" D:\work\b.md`),
    [String.raw`C:\My Files\a.txt`, String.raw`D:\work\b.md`],
  );
});

test('上传路径不把 Windows 绝对路径按当前系统拼坏', () => {
  assert.equal(normalizeUploadPath(String.raw`F:\work\a.txt`, '/tmp'), String.raw`F:\work\a.txt`);
  assert.equal(normalizeUploadPath('notes/a.txt', '/tmp/work'), '/tmp/work/notes/a.txt');
});

test('聊天请求带会话、模式和新会话标记', () => {
  const body = buildChatRequest({
    config: { model: 'arena-agent', mode: 'battle', session: 'main', stream: true },
    messages: [{ role: 'user', content: '你好' }],
    fresh: true,
  });
  assert.equal(body.user, 'main');
  assert.equal(body.metadata.mode, 'battle');
  assert.equal(body.arena_new, true);
});

test('SSE 解析能处理拆包、注释心跳与 DONE', () => {
  const events = [];
  const parser = new SseParser((event) => events.push(event));
  parser.push(': ping\n\ndata: {"choices":[{"delta":{"reasoning_content":"想');
  parser.push('一想","content":"你好"}}]}\n\ndata: [DONE]\n\n');
  parser.end();
  assert.equal(events.length, 2);
  assert.deepEqual(deltaEvents(events[0].value), [
    { type: 'reasoning', text: '想一想' },
    { type: 'content', text: '你好' },
  ]);
  assert.equal(events[1].type, 'done');
});

test('流式客户端会分开累积正文和思考，并带 Bearer 头', async () => {
  let seenHeaders;
  const sse = [
    'data: {"choices":[{"delta":{"reasoning_content":"先想"}}]}',
    '',
    'data: {"choices":[{"delta":{"content":"回答"}}]}',
    '',
    'data: [DONE]',
    '',
  ].join('\n');
  const client = new ArenaBridgeClient({
    bridgeUrl: 'http://bridge.test/v1',
    apiKey: 'secret',
    fetchImpl: async (_url, init) => {
      seenHeaders = init.headers;
      return new Response(sse, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    },
  });
  const content = [];
  const reasoning = [];
  const result = await client.chat({
    config: { model: 'arena-agent', mode: 'agent', session: 'main', stream: true },
    messages: [{ role: 'user', content: '问' }],
    onContent: (text) => content.push(text),
    onReasoning: (text) => reasoning.push(text),
  });
  assert.equal(seenHeaders.Authorization, 'Bearer secret');
  assert.deepEqual(content, ['回答']);
  assert.deepEqual(reasoning, ['先想']);
  assert.equal(result.content, '回答');
});

test('只有思考没有正文时，不往正文流写空行', () => {
  const capture = () => ({ text: '', write(chunk) { this.text += chunk; } });
  const content = capture();
  const reasoning = capture();
  const renderer = new TerminalRenderer(content, reasoning, { showReasoning: true, color: false });
  renderer.reasoning('思考中');
  renderer.finish();
  assert.equal(content.text, '');
  assert.equal(reasoning.text, '思考中\n');
});

test('会话文件名不能穿越目录', () => {
  const name = sanitizeSessionFilename('../../outside');
  assert.equal(name.includes('/'), false);
  assert.equal(name.includes('\\'), false);
  assert.match(name, /\.json$/);
});

test('会话存储可以保存、加载和清空', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-code-store-'));
  const store = new SessionStore(home);
  const messages = [{ role: 'user', content: '你好' }, { role: 'assistant', content: '在' }];
  store.save('设计/main', messages);
  assert.deepEqual(store.load('设计/main'), messages);
  store.clear('设计/main');
  assert.deepEqual(store.load('设计/main'), []);
});
