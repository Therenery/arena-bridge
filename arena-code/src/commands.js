'use strict';

const VALUE_OPTIONS = new Map([
  ['--bridge-url', 'bridgeUrl'],
  ['--bridge', 'bridgeUrl'],
  ['--model', 'model'],
  ['-m', 'model'],
  ['--mode', 'mode'],
  ['--session', 'session'],
  ['-s', 'session'],
  ['--api-key', 'apiKey'],
  ['--config', 'configPath'],
  ['--prompt', 'prompt'],
  ['-p', 'prompt'],
]);

function parseArgs(argv = []) {
  const options = {};
  const positional = [];
  let help = false;
  let version = false;
  let endOfOptions = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i]);
    if (endOfOptions) {
      positional.push(arg);
      continue;
    }
    if (arg === '--') {
      endOfOptions = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }
    if (arg === '--version' || arg === '-v') {
      version = true;
      continue;
    }
    if (arg === '--new') {
      options.new = true;
      continue;
    }
    if (arg === '--stream') {
      options.stream = true;
      continue;
    }
    if (arg === '--no-stream') {
      options.stream = false;
      continue;
    }
    if (arg === '--reasoning') {
      options.showReasoning = true;
      continue;
    }
    if (arg === '--no-reasoning') {
      options.showReasoning = false;
      continue;
    }
    if (arg === '--save') {
      options.saveSession = true;
      continue;
    }
    if (arg === '--no-save') {
      options.saveSession = false;
      continue;
    }

    const equalsAt = arg.indexOf('=');
    const flag = equalsAt > 0 ? arg.slice(0, equalsAt) : arg;
    if (VALUE_OPTIONS.has(flag)) {
      let value = equalsAt > 0 ? arg.slice(equalsAt + 1) : '';
      if (!value) {
        i += 1;
        if (i >= argv.length) throw new Error(`缺少参数值：${flag}`);
        value = String(argv[i]);
      }
      options[VALUE_OPTIONS.get(flag)] = value;
      continue;
    }
    if (arg.startsWith('-') && arg !== '-') throw new Error(`未知选项：${arg}`);
    positional.push(arg);
  }

  const prompt = options.prompt || positional.join(' ').trim();
  return { options, prompt, help, version };
}

function parseCommand(line) {
  const text = String(line || '').trim();
  if (!text.startsWith('/')) return null;
  const match = text.match(/^\/([A-Za-z][A-Za-z0-9_-]*)\s*([\s\S]*)$/);
  if (!match) return { name: '', args: text.slice(1).trim() };
  return { name: match[1].toLowerCase(), args: (match[2] || '').trim() };
}

// 词法足够覆盖普通路径和 Windows 路径：引号内保留反斜杠，未引号部分按空白分词。
function parsePaths(input) {
  const text = String(input || '');
  const out = [];
  let token = '';
  let quote = '';
  let hasToken = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === quote) {
        quote = '';
      } else if (ch === '\\' && text[i + 1] === quote) {
        token += quote;
        i += 1;
      } else {
        token += ch;
      }
      hasToken = true;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      hasToken = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (hasToken || token) out.push(token);
      token = '';
      hasToken = false;
      continue;
    }
    token += ch;
    hasToken = true;
  }
  if (quote) throw new Error('路径参数引号没有闭合');
  if (hasToken || token) out.push(token);
  return out.filter(Boolean);
}

function normalizeUploadPath(input, cwd = process.cwd()) {
  const value = String(input || '');
  // /upload 的路径最终由桥所在机器解释。Windows 绝对路径原样传递，
  // 不能让非 Windows 客户端先按 POSIX 规则把它拼坏。
  if (/^[A-Za-z]:[\\/]/.test(value) || /^\\\\/.test(value)) return value;
  if (/^\//.test(value)) return value;
  const path = require('path');
  return path.resolve(cwd, value);
}

function buildChatRequest({ config, messages, fresh = false }) {
  const body = {
    model: config.model,
    messages,
    stream: !!config.stream,
    user: config.session,
    metadata: { mode: config.mode },
  };
  if (fresh) body.arena_new = true;
  return body;
}

function extractErrorMessage(data, status) {
  if (data && typeof data === 'object') {
    if (typeof data.error === 'string') return data.error;
    if (data.error && typeof data.error.message === 'string') return data.error.message;
    if (typeof data.message === 'string') return data.message;
  }
  if (typeof data === 'string' && data.trim()) return data.trim().slice(0, 500);
  return status ? `HTTP ${status}` : '请求失败';
}

module.exports = {
  parseArgs,
  parseCommand,
  parsePaths,
  normalizeUploadPath,
  buildChatRequest,
  extractErrorMessage,
};
