'use strict';

const path = require('path');
const readline = require('readline');
const { loadConfig, normalizeMode, MODES } = require('./config');
const { parseArgs, parseCommand, parsePaths, normalizeUploadPath } = require('./commands');
const { ArenaBridgeClient, BridgeError } = require('./client');
const { SessionStore } = require('./session-store');
const packageJson = require('../package.json');

const VERSION = packageJson.version;
const COMMANDS = [
  '/help', '/status', '/models', '/model', '/mode', '/session', '/new',
  '/repo', '/upload', '/vote', '/history', '/config', '/clear', '/exit', '/quit',
];

const USAGE = `Arena Code ${VERSION}

用法：
  arena-code [选项]              进入交互终端
  arena-code [选项] "问题"       单次提问
  echo "问题" | arena-code       从标准输入读取问题

选项：
  -p, --prompt <文本>            单次提问内容
  -m, --model <模型>             模型，默认 arena-agent
      --mode <模式>              agent | direct | battle | side
  -s, --session <名字>           会话名，默认 main
      --bridge-url <URL>         Arena Bridge 地址
      --api-key <密钥>           Bearer 密钥（也可用 ARENA_API_KEY / ARB_TOKEN）
      --config <路径>            settings.json 路径
      --new                      开始前清理服务端与本地会话
      --no-stream                不使用流式输出
      --no-reasoning             不显示思考与工具行
      --no-save                  不把会话保存到 ~/.arena/sessions
  -h, --help                     显示帮助
  -v, --version                  显示版本
`;

const COMMAND_HELP = `可用命令：
  /help                         显示命令帮助
  /status                       查看 Arena Bridge 与 Chrome 状态
  /models                       列出桥提供的模型
  /model [arena-agent|direct]  查看或切换基础模型
  /mode [agent|direct|battle|side]
                                查看或切换运行模式
  /session [名字]               查看或切换会话
  /new                          新建会话（清理服务端标签页与本地记录）
  /repo [owner/name]            列出或切换 Arena 工作区仓库
  /upload <路径...>             把本地文件挂到 Arena 输入框
  /vote <a|b|tie|both>          给最近一次 Battle 投票并揭晓模型
  /history                      查看本地保存的消息数量
  /config                       查看当前生效配置（密钥只显示是否已设置）
  /clear                        清屏
  /exit                         退出

输入多行问题时，在行尾加 \\ 继续下一行。`;

const BANNER = [
  ' █████╗ ██████╗ ███████╗███╗   ██╗ █████╗ ',
  '██╔══██╗██╔══██╗██╔════╝████╗  ██║██╔══██╗',
  '███████║██████╔╝█████╗  ██╔██╗ ██║███████║',
  '██╔══██║██╔══██╗██╔══╝  ██║╚██╗██║██╔══██║',
  '██║  ██║██║  ██║███████╗██║ ╚████║██║  ██║',
  '╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═══╝╚═╝  ╚═╝',
].join('\n');

function colorEnabled(stream) {
  return !!(stream && stream.isTTY && !process.env.NO_COLOR);
}

function paint(text, code, enabled) {
  return enabled ? `\x1b[${code}m${text}\x1b[0m` : text;
}

class TerminalRenderer {
  constructor(contentOut, reasoningOut, options = {}) {
    this.contentOut = contentOut;
    this.reasoningOut = reasoningOut;
    this.showReasoning = options.showReasoning !== false;
    this.color = !!options.color;
    this.current = '';
    this.lastChar = '';
  }

  reasoning(text) {
    if (!this.showReasoning || !text) return;
    if (this.current !== 'reasoning') {
      if (this.color) this.reasoningOut.write('\x1b[2m');
      this.current = 'reasoning';
    }
    this.reasoningOut.write(text);
    this.lastChar = text.slice(-1);
  }

  content(text) {
    if (!text) return;
    if (this.current === 'reasoning') {
      if (this.color) this.reasoningOut.write('\x1b[0m');
      if (this.lastChar && this.lastChar !== '\n') this.reasoningOut.write('\n');
      this.reasoningOut.write('\n');
    }
    this.current = 'content';
    this.contentOut.write(text);
    this.lastChar = text.slice(-1);
  }

  finish() {
    if (this.current === 'reasoning' && this.color) this.reasoningOut.write('\x1b[0m');
    if (this.current && this.lastChar !== '\n') {
      const out = this.current === 'reasoning' ? this.reasoningOut : this.contentOut;
      out.write('\n');
    }
    this.current = '';
    this.lastChar = '';
  }
}

function friendlyError(error) {
  if (!error) return '未知错误';
  if (error.name === 'AbortError') return '已取消当前请求';
  if (error instanceof BridgeError && error.status) return `${error.message}（HTTP ${error.status}）`;
  return error.message || String(error);
}

function timeoutSignal(ms) {
  return typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
    ? AbortSignal.timeout(ms)
    : undefined;
}

function endsWithContinuation(line) {
  const match = String(line).match(/\\+$/);
  return !!match && match[0].length % 2 === 1;
}

function promptFor(state, color) {
  return paint(`arena:${state.config.session} › `, '36;1', color);
}

function sanitizeConfig(config) {
  const { apiKey, configPath, arenaHome, ...rest } = config;
  return {
    ...rest,
    apiKey: apiKey ? '(已设置)' : '(未设置)',
    configPath,
    arenaHome,
  };
}

async function readAll(stdin) {
  const chunks = [];
  for await (const chunk of stdin) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

function saveMessages(context) {
  if (!context.state.config.saveSession) return;
  try {
    context.store.save(context.state.config.session, context.state.messages);
  } catch (error) {
    context.stderr.write(`警告：会话保存失败：${friendlyError(error)}\n`);
  }
}

async function runTurn(context, text, interactive) {
  const { state, client } = context;
  const messages = [...state.messages, { role: 'user', content: text }];
  const controller = new AbortController();
  state.activeController = controller;
  const renderer = new TerminalRenderer(context.stdout, interactive ? context.stdout : context.stderr, {
    showReasoning: state.config.showReasoning,
    color: colorEnabled(context.stdout),
  });

  try {
    const result = await client.chat({
      config: state.config,
      messages,
      fresh: state.freshNext,
      signal: controller.signal,
      onContent: (chunk) => renderer.content(chunk),
      onReasoning: (chunk) => renderer.reasoning(chunk),
    });
    renderer.finish();
    if (!result.content.trim()) throw new Error('Arena Bridge 返回了空回答');
    state.messages = [...messages, { role: 'assistant', content: result.content }];
    state.freshNext = false;
    saveMessages(context);
    return result;
  } catch (error) {
    renderer.finish();
    if (interactive) {
      context.stderr.write(`${error.name === 'AbortError' ? '' : '错误：'}${friendlyError(error)}\n`);
      return null;
    }
    throw error;
  } finally {
    if (state.activeController === controller) state.activeController = null;
  }
}

async function switchSession(context, name) {
  const { state, store } = context;
  const next = String(name || '').trim();
  if (!next) throw new Error('用法：/session <名字>');
  if (next === state.config.session) {
    context.stdout.write(`当前会话：${next}\n`);
    return;
  }
  saveMessages(context);
  state.config.session = next;
  state.messages = [];
  state.freshNext = false;
  if (state.config.saveSession) {
    try {
      state.messages = store.load(next);
    } catch (error) {
      context.stderr.write(`警告：本地会话读取失败，将从空会话开始：${friendlyError(error)}\n`);
    }
  }
  context.stdout.write(`已切换到会话：${next}（本地 ${state.messages.length} 条消息）\n`);
}

async function startNewSession(context, name, announce = true) {
  const { state, client, store } = context;
  const target = name || state.config.session;
  await client.newSession(target, timeoutSignal(20000));
  state.config.session = target;
  state.messages = [];
  state.freshNext = true;
  if (state.config.saveSession) store.clear(state.config.session);
  if (announce) context.stdout.write(`已新建会话：${state.config.session}\n`);
}

async function handleCommand(context, command) {
  const { state, client, stdout } = context;
  const config = state.config;
  const args = command.args;

  switch (command.name) {
    case 'help':
      stdout.write(`${COMMAND_HELP}\n`);
      return true;
    case 'exit':
    case 'quit':
      return false;
    case 'clear':
      if (stdout.isTTY) stdout.write('\x1b[2J\x1b[H');
      return true;
    case 'status': {
      const h = await client.health(timeoutSignal(10000));
      stdout.write([
        `Arena Bridge：${client.bridgeUrl}`,
        `状态：${h && h.chrome ? 'Chrome 已就绪' : '桥已连接，Chrome 正在启动'}`,
        `版本：${(h && h.version) || '未知'}`,
        `会话：${config.session}（本地 ${state.messages.length} 条消息）`,
        `模型/模式：${config.model} / ${config.mode}`,
        `服务端队列：${(h && h.queue) ?? 0}，工作中：${h && h.working ? '是' : '否'}`,
      ].join('\n') + '\n');
      return true;
    }
    case 'models': {
      const models = await client.models(timeoutSignal(10000));
      if (!models.length) stdout.write('（没有模型）\n');
      for (const m of models) stdout.write(`${m.id === config.model ? '●' : '○'} ${m.id}\n`);
      return true;
    }
    case 'model': {
      if (!args) {
        stdout.write(`当前模型：${config.model}\n可用：arena-agent、arena-direct，也可填 Arena 页面模型 id。\n`);
        return true;
      }
      if (/\s/.test(args)) throw new Error('模型名不能包含空格');
      config.model = args;
      if (args === 'arena-direct') config.mode = 'direct';
      if (args === 'arena-agent' && config.mode === 'direct') config.mode = 'agent';
      stdout.write(`模型已切换：${config.model}（模式 ${config.mode}）\n`);
      return true;
    }
    case 'mode': {
      if (!args) {
        stdout.write(`当前模式：${config.mode}\n可用：agent、direct、battle、side\n`);
        return true;
      }
      const mode = args.toLowerCase();
      if (!MODES.has(mode)) throw new Error('模式只能是 agent、direct、battle、side');
      config.mode = normalizeMode(mode);
      if (mode === 'direct') config.model = 'arena-direct';
      if (mode === 'agent') config.model = 'arena-agent';
      stdout.write(`模式已切换：${config.mode}（模型 ${config.model}）\n`);
      return true;
    }
    case 'session':
      if (!args) stdout.write(`当前会话：${config.session}\n`);
      else await switchSession(context, args);
      return true;
    case 'new':
      await startNewSession(context, args || config.session);
      return true;
    case 'repo': {
      if (!args) {
        const data = await client.repos(config.session, false, undefined);
        stdout.write(`当前仓库：${data.repo || '(未选择)'}\n`);
        const repos = Array.isArray(data.repos) ? data.repos : [];
        if (!repos.length) stdout.write('  （没有可选仓库）\n');
        for (const repo of repos) stdout.write(`  ${repo}\n`);
        if (repos.length) stdout.write('切换：/repo owner/name\n');
      } else {
        const data = await client.repo(config.session, args, undefined);
        if (data.changed) {
          state.messages = [];
          state.freshNext = true;
          if (config.saveSession) context.store.clear(config.session);
        }
        stdout.write(`当前仓库：${data.repo || args}\n`);
      }
      return true;
    }
    case 'upload': {
      const paths = parsePaths(args);
      if (!paths.length) throw new Error('用法：/upload <路径> [更多路径...]');
      // 路径由桥所在机器解释；客户端只把相对路径按当前目录补全，不在本机预检，
      // 这样通过隧道连接远程桥时也能传桥那台机器上的 Windows 路径。
      const files = paths.map((p) => normalizeUploadPath(p, process.cwd()));
      const data = await client.upload(config.session, files, undefined);
      const attached = Array.isArray(data.attached) ? data.attached : files.map((f) => path.basename(f));
      stdout.write(`已附加：${attached.join(', ')}\n`);
      return true;
    }
    case 'vote': {
      const choice = args.toLowerCase();
      if (!['a', 'b', 'tie', 'both'].includes(choice)) throw new Error('用法：/vote a|b|tie|both');
      const data = await client.vote(config.session, choice, undefined);
      stdout.write(`已揭晓：A=${data.a && data.a.label || '未知'}，B=${data.b && data.b.label || '未知'}\n`);
      return true;
    }
    case 'history':
      stdout.write(`当前会话有 ${state.messages.length} 条本地消息。\n`);
      return true;
    case 'config':
      stdout.write(`${JSON.stringify(sanitizeConfig(config), null, 2)}\n`);
      return true;
    default:
      throw new Error(`未知命令：/${command.name}（输入 /help 查看命令）`);
  }
}

async function runInteractive(context) {
  const { state, stdout } = context;
  const useColor = colorEnabled(stdout);
  if (stdout.isTTY) {
    stdout.write(`${paint(BANNER, '36;1', useColor)}\n`);
    stdout.write(`${paint('Arena Code', '1', useColor)} · ${state.config.model} · ${state.config.mode} · 会话 ${state.config.session}\n`);
    stdout.write('输入问题开始；/help 查看命令，/exit 退出。\n\n');
  }

  const rl = readline.createInterface({
    input: context.stdin,
    output: stdout,
    terminal: !!context.stdin.isTTY,
    historySize: 1000,
    completer(line) {
      if (!line.startsWith('/')) return [[], line];
      const hits = COMMANDS.filter((item) => item.startsWith(line));
      return [hits.length ? hits : COMMANDS, line];
    },
  });
  const iterator = rl[Symbol.asyncIterator]();
  let lastInterruptAt = 0;
  rl.on('SIGINT', () => {
    if (state.activeController) {
      state.activeController.abort();
      return;
    }
    const now = Date.now();
    if (now - lastInterruptAt < 2000) {
      rl.close();
      return;
    }
    lastInterruptAt = now;
    stdout.write('\n再按一次 Ctrl-C，或输入 /exit 退出。\n');
    stdout.write(promptFor(state, useColor));
  });

  async function nextLine(prompt) {
    stdout.write(prompt);
    const next = await iterator.next();
    return next.done ? null : String(next.value);
  }

  async function readLogicalLine() {
    const first = await nextLine(promptFor(state, useColor));
    if (first == null) return null;
    let text = first;
    while (endsWithContinuation(text)) {
      text = text.slice(0, -1);
      const more = await nextLine(paint('... ', '2', useColor));
      if (more == null) break;
      text += `\n${more}`;
    }
    return text;
  }

  try {
    for (;;) {
      const line = await readLogicalLine();
      if (line == null) break;
      const text = line.trim();
      if (!text) continue;
      const command = parseCommand(text);
      if (command) {
        try {
          if (!(await handleCommand(context, command))) break;
        } catch (error) {
          context.stderr.write(`错误：${friendlyError(error)}\n`);
        }
      } else {
        await runTurn(context, text, true);
      }
    }
  } finally {
    try { await iterator.return(); } catch {}
    rl.close();
  }
}

async function main(argv = process.argv.slice(2), io = {}) {
  const stdin = io.stdin || process.stdin;
  const stdout = io.stdout || process.stdout;
  const stderr = io.stderr || process.stderr;
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (error) {
    stderr.write(`${friendlyError(error)}\n\n${USAGE}`);
    process.exitCode = 2;
    return 2;
  }
  if (parsed.help) {
    stdout.write(USAGE);
    return 0;
  }
  if (parsed.version) {
    stdout.write(`${VERSION}\n`);
    return 0;
  }

  let config;
  try {
    config = loadConfig({ configPath: parsed.options.configPath, cliOptions: parsed.options });
  } catch (error) {
    stderr.write(`配置错误：${friendlyError(error)}\n`);
    process.exitCode = 2;
    return 2;
  }

  const client = new ArenaBridgeClient({ bridgeUrl: config.bridgeUrl, apiKey: config.apiKey });
  const store = new SessionStore(config.arenaHome);
  const state = {
    config,
    messages: [],
    freshNext: !!parsed.options.new,
    activeController: null,
  };
  const context = { stdin, stdout, stderr, client, store, state };

  if (config.saveSession) {
    try {
      state.messages = store.load(config.session);
    } catch (error) {
      stderr.write(`警告：本地会话读取失败，将从空会话开始：${friendlyError(error)}\n`);
    }
  }

  let prompt = parsed.prompt;
  if (!prompt && !stdin.isTTY) prompt = (await readAll(stdin)).trim();
  const oneShotCommand = prompt ? parseCommand(prompt) : null;
  const canRunWithoutHealth = oneShotCommand &&
    ['help', 'config', 'history', 'clear', 'exit', 'quit'].includes(oneShotCommand.name);

  let health = null;
  if (!canRunWithoutHealth) {
    try {
      health = await client.health(timeoutSignal(10000));
    } catch (error) {
      stderr.write(`${friendlyError(error)}\n请先启动 Arena Bridge：node arena_bridge.js\n`);
      process.exitCode = 1;
      return 1;
    }
  }

  try {
    if (parsed.options.new) await startNewSession(context, config.session, !prompt);

    if (prompt) {
      if (oneShotCommand) {
        await handleCommand(context, oneShotCommand);
        return 0;
      }
      const onSigint = () => {
        if (state.activeController) state.activeController.abort();
      };
      process.once('SIGINT', onSigint);
      try {
        await runTurn(context, prompt, false);
      } finally {
        process.removeListener('SIGINT', onSigint);
      }
      return 0;
    }

    if (stdin.isTTY && health && !health.chrome) {
      stderr.write('Arena Bridge 已连接，Chrome 正在启动；第一轮可能需要等待。\n');
    }
    await runInteractive(context);
    return 0;
  } catch (error) {
    stderr.write(`${friendlyError(error)}\n`);
    process.exitCode = error && error.name === 'AbortError' ? 130 : 1;
    return process.exitCode;
  }
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${friendlyError(error)}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  VERSION,
  USAGE,
  COMMAND_HELP,
  TerminalRenderer,
  friendlyError,
  handleCommand,
  main,
};
