const fs = require('fs');
const B = 'F:\\__AI__\\work\\qwen-code\\';
function edit(rel, fn) {
  const f = B + rel;
  let s = fs.readFileSync(f, 'utf8');
  const out = fn(s);
  if (out === s) { console.log('NO CHANGE ' + rel); return; }
  fs.writeFileSync(f, out, 'utf8');
  console.log('patched ' + rel);
}

edit('packages\\cli\\src\\ui\\arena-mode.ts', (s) => {
  s = s.replace("export type ArenaChatMode = 'agent' | 'direct';", "export type ArenaChatMode = 'agent' | 'direct' | 'battle' | 'side';");
  s = s.replace(
    "  mode: process.env['ARENA_CHAT_MODE'] === 'direct' ? 'direct' : 'agent',",
    "  mode: normalizeMode(process.env['ARENA_CHAT_MODE']),",
  );
  if (!s.includes('function normalizeMode')) {
    const anchor = 'let state: ArenaStatus = {';
    const helper = [
      'function normalizeMode(value: string | undefined): ArenaChatMode {',
      "  return value === 'direct' || value === 'battle' || value === 'side'",
      '    ? value',
      "    : 'agent';",
      '}',
      '',
      '',
    ].join('\n');
    s = s.replace(anchor, helper + anchor);
  }
  if (!s.includes('setArenaSideModels')) {
    const anchor2 = 'export function setArenaChatMode(';
    const add = [
      '/** /side 选定的两个模型，随请求 metadata.models 发给 bridge。 */',
      'export function setArenaSideModels(models: string[]): void {',
      '  const value = models.map((m) => m.trim()).filter(Boolean).slice(0, 2).join(\',\');',
      "  if (value) process.env['ARENA_SIDE_MODELS'] = value;",
      "  else delete process.env['ARENA_SIDE_MODELS'];",
      '}',
      '',
      '',
    ].join('\n');
    s = s.replace(anchor2, add + anchor2);
  }
  return s;
});

edit('packages\\cli\\src\\ui\\commands\\arena-text-commands.ts', (s) => {
  s = s.replace(
    "import { setArenaChatMode } from '../arena-mode.js';",
    "import { setArenaChatMode, setArenaSideModels } from '../arena-mode.js';",
  );
  // /battle 不带问题 -> 切模式
  const oldBattle = [
    '    const prompt = args.trim();',
    '    if (!prompt) {',
    '      return {',
    "        type: 'message' as const,",
    "        messageType: 'info' as const,",
    '        content: [',
    "          '用法：/battle <问题>',",
    "          '',",
    "          '两个匿名模型同时作答，投完票再揭示模型名。',",
    "          '投票：/vote a | b | tie | both',",
    "        ].join('\\n'),",
    '      };',
    '    }',
  ].join('\n');
  const newBattle = [
    '    const prompt = args.trim();',
    '    if (!prompt) {',
    "      setArenaChatMode('battle');",
    '      return {',
    "        type: 'message' as const,",
    "        messageType: 'info' as const,",
    '        content: [',
    "          '已切到 Battle 模式：之后每次提问都让两个匿名模型同时作答。',",
    "          '每轮用 /vote a | b | tie | both 投票并揭示模型名。',",
    "          '带问题直接跑一轮：/battle <问题>；切回：/agent。',",
    "        ].join('\\n'),",
    '      };',
    '    }',
  ].join('\n');
  if (!s.includes(oldBattle)) console.log('WARN battle anchor');
  s = s.replace(oldBattle, newBattle);

  // /side 不带问题 -> 切模式
  const oldSide = [
    '    const { models, prompt } = parseSideArgs(args);',
    '    if (!prompt) {',
    '      return {',
    "        type: 'message' as const,",
    "        messageType: 'info' as const,",
    '        content: [',
    "          '用法：/side [--models 模型A,模型B] <问题>',",
    "          '',",
    "          '例：/side --models gemini-4-argon-high,claude-opus-5.5-high 写一个快排',",
    "          '不指定模型时用网页当前默认的两个模型。',",
    "        ].join('\\n'),",
    '      };',
    '    }',
  ].join('\n');
  const newSide = [
    '    const { models, prompt } = parseSideArgs(args);',
    '    if (!prompt) {',
    '      if (models.length) setArenaSideModels(models);',
    "      setArenaChatMode('side');",
    '      return {',
    "        type: 'message' as const,",
    "        messageType: 'info' as const,",
    '        content: [',
    "          '已切到 Side by Side 模式：之后每次提问都让两个模型并排作答。',",
    '          models.length',
    "            ? '模型：' + models.join(' vs ')",
    "            : '模型：沿用网页当前选中的两个（可用 /side --models a,b 指定）',",
    "          '每轮用 /vote a | b | tie | both 投票。切回：/agent。',",
    "        ].join('\\n'),",
    '      };',
    '    }',
  ].join('\n');
  if (!s.includes(oldSide)) console.log('WARN side anchor');
  s = s.replace(oldSide, newSide);
  return s;
});

edit('packages\\core\\src\\core\\openaiContentGenerator\\pipeline.ts', (s) => {
  const old = [
    '    // Arena 的对话模式（agent / direct）由 /direct、/agent 切换，随请求发给 bridge。',
    "    const arenaMode = process.env['ARENA_CHAT_MODE'];",
    "    if (arenaMode === 'direct' || arenaMode === 'agent') {",
    '      baseRequest.metadata = { mode: arenaMode };',
    '    }',
  ].join('\n');
  const neu = [
    '    // Arena 的对话模式（agent / direct / battle / side）由斜杠命令切换，随请求发给 bridge。',
    "    const arenaMode = process.env['ARENA_CHAT_MODE'];",
    "    if (arenaMode && ['agent', 'direct', 'battle', 'side'].includes(arenaMode)) {",
    "      const models = process.env['ARENA_SIDE_MODELS'];",
    '      baseRequest.metadata = models',
    '        ? { mode: arenaMode, models: models.split(\',\').filter(Boolean) }',
    '        : { mode: arenaMode };',
    '    }',
  ].join('\n');
  if (!s.includes(old)) { console.log('WARN pipeline anchor'); return s; }
  return s.replace(old, neu);
});
