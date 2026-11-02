'use strict';

const { normalizeBridgeUrl } = require('./config');
const { buildChatRequest, extractErrorMessage } = require('./commands');
const { SseParser, deltaEvents } = require('./sse');

class BridgeError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'BridgeError';
    this.status = status || 0;
  }
}

async function readResponseData(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

class ArenaBridgeClient {
  constructor(options = {}) {
    this.bridgeUrl = normalizeBridgeUrl(options.bridgeUrl);
    this.apiKey = options.apiKey || '';
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
    if (typeof this.fetchImpl !== 'function') throw new Error('当前 Node 运行时没有 fetch');
  }

  url(pathname, params) {
    const url = new URL(pathname, `${this.bridgeUrl}/`);
    for (const [key, value] of Object.entries(params || {})) {
      if (value != null && value !== '') url.searchParams.set(key, String(value));
    }
    return url;
  }

  headers(hasJsonBody = false) {
    const headers = {};
    if (hasJsonBody) headers['Content-Type'] = 'application/json';
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;
    return headers;
  }

  async fetch(url, init) {
    try {
      return await this.fetchImpl(url, init);
    } catch (error) {
      if (error && error.name === 'AbortError') throw error;
      const detail = error && error.cause && error.cause.message
        ? `${error.message} (${error.cause.message})`
        : (error && error.message) || String(error);
      throw new BridgeError(`无法连接 Arena Bridge（${this.bridgeUrl}）：${detail}`);
    }
  }

  async requestJson(pathname, options = {}) {
    const response = await this.fetch(this.url(pathname, options.params), {
      method: options.method || 'GET',
      headers: this.headers(options.body !== undefined),
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
    const data = await readResponseData(response);
    if (!response.ok) throw new BridgeError(extractErrorMessage(data, response.status), response.status);
    return data;
  }

  health(signal) {
    return this.requestJson('/health', { signal });
  }

  async models(signal) {
    const data = await this.requestJson('/v1/models', { signal });
    return Array.isArray(data && data.data) ? data.data : [];
  }

  repos(session, cached = false, signal) {
    return this.requestJson('/repos', {
      params: { session, ...(cached ? { cached: 1 } : {}) },
      signal,
    });
  }

  repo(session, name, signal) {
    return this.requestJson('/repo', { params: { session, name }, signal });
  }

  newSession(session, signal) {
    return this.requestJson('/new', { params: { session }, signal });
  }

  upload(session, files, signal) {
    return this.requestJson('/upload', {
      method: 'POST',
      body: { session, files },
      signal,
    });
  }

  vote(session, choice, signal) {
    return this.requestJson('/vote', {
      method: 'POST',
      body: { session, choice },
      signal,
    });
  }

  async chat(options) {
    const body = buildChatRequest(options);
    if (!options.config.stream) {
      const data = await this.requestJson('/v1/chat/completions', {
        method: 'POST',
        body,
        signal: options.signal,
      });
      const content = data && data.choices && data.choices[0] &&
        data.choices[0].message && data.choices[0].message.content || '';
      const reasoning = data && data.arena && data.arena.reasoning || '';
      if (reasoning && options.onReasoning) options.onReasoning(String(reasoning));
      if (content && options.onContent) options.onContent(String(content));
      return { content: String(content), reasoning: String(reasoning), raw: data };
    }
    return this.chatStream(body, options);
  }

  async chatStream(body, options) {
    const response = await this.fetch(this.url('/v1/chat/completions'), {
      method: 'POST',
      headers: this.headers(true),
      body: JSON.stringify(body),
      signal: options.signal,
    });
    if (!response.ok) {
      const data = await readResponseData(response);
      throw new BridgeError(extractErrorMessage(data, response.status), response.status);
    }
    if (!response.body || typeof response.body.getReader !== 'function') {
      throw new BridgeError('Arena Bridge 没有返回可读取的流');
    }

    let content = '';
    let reasoning = '';
    let streamError = null;
    const parser = new SseParser((event) => {
      if (event.type !== 'json') return;
      for (const item of deltaEvents(event.value)) {
        if (item.type === 'content') {
          content += item.text;
          if (options.onContent) options.onContent(item.text);
        } else if (item.type === 'reasoning') {
          reasoning += item.text;
          if (options.onReasoning) options.onReasoning(item.text);
        } else if (item.type === 'error') {
          streamError = new BridgeError(item.message, response.status);
        }
      }
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parser.push(decoder.decode(value, { stream: true }));
    }
    parser.push(decoder.decode());
    parser.end();
    if (streamError) throw streamError;
    return { content, reasoning };
  }
}

module.exports = { ArenaBridgeClient, BridgeError, readResponseData };
