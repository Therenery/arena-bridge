'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_CONFIG = Object.freeze({
  bridgeUrl: 'http://127.0.0.1:17892',
  model: 'arena-agent',
  mode: 'agent',
  session: 'main',
  stream: true,
  showReasoning: true,
  saveSession: true,
  apiKey: '',
});

const MODES = new Set(['agent', 'direct', 'battle', 'side']);

function parseBoolean(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const s = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(s)) return true;
  if (['0', 'false', 'no', 'off'].includes(s)) return false;
  return fallback;
}

function normalizeBridgeUrl(value) {
  const raw = String(value || DEFAULT_CONFIG.bridgeUrl).trim();
  const url = new URL(raw);
  url.hash = '';
  url.search = '';
  url.pathname = url.pathname.replace(/\/+$/g, '').replace(/\/v1$/i, '') || '/';
  return url.toString().replace(/\/$/g, '');
}

function normalizeMode(value, fallback = DEFAULT_CONFIG.mode) {
  const mode = String(value || '').trim().toLowerCase();
  return MODES.has(mode) ? mode : fallback;
}

function modeForModel(model) {
  if (model === 'arena-direct') return 'direct';
  if (model === 'arena-agent') return 'agent';
  return null;
}

function arenaHome(env = process.env, homeDir = os.homedir()) {
  return path.resolve(env.ARENA_CODE_HOME || path.join(homeDir, '.arena'));
}

function settingsPath(env = process.env, homeDir = os.homedir()) {
  return path.resolve(env.ARENA_CODE_CONFIG || path.join(arenaHome(env, homeDir), 'settings.json'));
}

function readSettings(file) {
  if (!file || !fs.existsSync(file)) return {};
  const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  if (!raw.trim()) return {};
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`配置文件必须是 JSON 对象：${file}`);
  }
  return parsed;
}

// 同时认 Arena Code 自己的 settings.json 与旧版 provider 风格配置，
// 这样已有 %USERPROFILE%\.arena\settings.json 不需要重写就能迁移。
function settingsToConfig(settings) {
  if (!settings || typeof settings !== 'object') return {};
  const out = {};
  const modelObject = settings.model && typeof settings.model === 'object' ? settings.model : null;
  const providers = settings.modelProviders && typeof settings.modelProviders === 'object'
    ? settings.modelProviders.openai
    : null;
  const provider = Array.isArray(providers) ? providers[0] : null;

  const bridgeUrl = settings.bridgeUrl || settings.baseUrl ||
    (modelObject && modelObject.baseUrl) || (provider && provider.baseUrl);
  if (bridgeUrl) out.bridgeUrl = bridgeUrl;

  const model = typeof settings.model === 'string'
    ? settings.model
    : (modelObject && (modelObject.name || modelObject.id)) || (provider && provider.id);
  if (model) out.model = String(model);

  if (settings.mode) out.mode = settings.mode;
  if (settings.session) out.session = String(settings.session);
  if (settings.stream != null) out.stream = parseBoolean(settings.stream, DEFAULT_CONFIG.stream);
  if (settings.showReasoning != null) {
    out.showReasoning = parseBoolean(settings.showReasoning, DEFAULT_CONFIG.showReasoning);
  }
  if (settings.saveSession != null) {
    out.saveSession = parseBoolean(settings.saveSession, DEFAULT_CONFIG.saveSession);
  }

  const envObject = settings.env && typeof settings.env === 'object' ? settings.env : {};
  const keyEnv = settings.apiKeyEnv || (provider && provider.envKey) || 'ARENA_API_KEY';
  const apiKey = settings.apiKey || envObject[keyEnv] || envObject.ARENA_API_KEY || envObject.ARB_TOKEN;
  if (apiKey) out.apiKey = String(apiKey);
  if (keyEnv) out.apiKeyEnv = String(keyEnv);
  return out;
}

function envToConfig(env) {
  const out = {};
  const bridgeUrl = env.ARENA_BRIDGE_URL || env.ARENA_BRIDGE;
  if (bridgeUrl) out.bridgeUrl = bridgeUrl;
  if (env.ARENA_MODEL) out.model = env.ARENA_MODEL;
  if (env.ARENA_MODE) out.mode = env.ARENA_MODE;
  if (env.ARENA_SESSION) out.session = env.ARENA_SESSION;
  if (env.ARENA_CODE_STREAM != null) out.stream = parseBoolean(env.ARENA_CODE_STREAM, DEFAULT_CONFIG.stream);
  if (env.ARENA_CODE_SHOW_REASONING != null) {
    out.showReasoning = parseBoolean(env.ARENA_CODE_SHOW_REASONING, DEFAULT_CONFIG.showReasoning);
  }
  if (env.ARENA_CODE_SAVE_SESSION != null) {
    out.saveSession = parseBoolean(env.ARENA_CODE_SAVE_SESSION, DEFAULT_CONFIG.saveSession);
  }
  const apiKey = env.ARENA_API_KEY || env.ARB_TOKEN;
  if (apiKey) out.apiKey = apiKey;
  return out;
}

function removeUndefined(object) {
  return Object.fromEntries(Object.entries(object || {}).filter(([, value]) => value !== undefined));
}

function finalizeConfig(config) {
  const out = { ...DEFAULT_CONFIG, ...removeUndefined(config) };
  out.bridgeUrl = normalizeBridgeUrl(out.bridgeUrl);
  out.model = String(out.model || DEFAULT_CONFIG.model).trim() || DEFAULT_CONFIG.model;
  const explicitMode = config && config.mode;
  const inferredMode = modeForModel(out.model);
  out.mode = normalizeMode(explicitMode || inferredMode || out.mode);
  // arena-agent / arena-direct 本身就是模式开关；在普通聊天模式间以模型名为准，
  // 避免旧 settings 里留下的 mode 把刚选的 Direct 又压回 Agent。
  if (inferredMode && out.mode !== 'battle' && out.mode !== 'side') {
    out.mode = inferredMode;
  }
  out.session = String(out.session || DEFAULT_CONFIG.session).trim() || DEFAULT_CONFIG.session;
  out.stream = parseBoolean(out.stream, DEFAULT_CONFIG.stream);
  out.showReasoning = parseBoolean(out.showReasoning, DEFAULT_CONFIG.showReasoning);
  out.saveSession = parseBoolean(out.saveSession, DEFAULT_CONFIG.saveSession);
  out.apiKey = out.apiKey ? String(out.apiKey) : '';
  return out;
}

function loadConfig(options = {}) {
  const env = options.env || process.env;
  const homeDir = options.homeDir || os.homedir();
  const file = options.configPath
    ? path.resolve(options.configPath)
    : settingsPath(env, homeDir);
  const fileConfig = settingsToConfig(readSettings(file));
  const envConfig = envToConfig(env);
  const apiKeyFromNamedEnv = fileConfig.apiKeyEnv && env[fileConfig.apiKeyEnv]
    ? env[fileConfig.apiKeyEnv]
    : '';
  const merged = finalizeConfig({
    ...fileConfig,
    ...(apiKeyFromNamedEnv ? { apiKey: apiKeyFromNamedEnv } : {}),
    ...envConfig,
    ...removeUndefined(options.cliOptions),
  });
  return { ...merged, configPath: file, arenaHome: arenaHome(env, homeDir) };
}

function sanitizeSessionFilename(session) {
  const raw = String(session || DEFAULT_CONFIG.session);
  let safe = encodeURIComponent(raw).replace(/%/g, '_').replace(/[^A-Za-z0-9._-]/g, '_');
  if (!safe || safe === '.' || safe === '..') safe = 'main';
  if (safe.length > 100) {
    const hash = crypto.createHash('sha256').update(raw).digest('hex').slice(0, 12);
    safe = `${safe.slice(0, 84)}-${hash}`;
  }
  return `${safe}.json`;
}

module.exports = {
  DEFAULT_CONFIG,
  MODES,
  arenaHome,
  settingsPath,
  readSettings,
  settingsToConfig,
  envToConfig,
  finalizeConfig,
  loadConfig,
  normalizeBridgeUrl,
  normalizeMode,
  modeForModel,
  parseBoolean,
  sanitizeSessionFilename,
};
