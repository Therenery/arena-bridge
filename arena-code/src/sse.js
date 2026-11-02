'use strict';

function decodeSseData(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  if (text === '[DONE]') return { type: 'done' };
  try {
    return { type: 'json', value: JSON.parse(text) };
  } catch {
    return { type: 'parse-error', raw: text };
  }
}

class SseParser {
  constructor(onEvent) {
    this.onEvent = typeof onEvent === 'function' ? onEvent : () => {};
    this.buffer = '';
    this.dataLines = [];
  }

  push(chunk) {
    this.buffer += String(chunk || '');
    let newlineAt;
    while ((newlineAt = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, newlineAt).replace(/\r$/, '');
      this.buffer = this.buffer.slice(newlineAt + 1);
      this.consumeLine(line);
    }
  }

  end() {
    if (this.buffer) {
      this.consumeLine(this.buffer.replace(/\r$/, ''));
      this.buffer = '';
    }
    this.flush();
  }

  consumeLine(line) {
    if (line === '') {
      this.flush();
      return;
    }
    if (line.startsWith(':')) return;
    if (line.startsWith('data:')) {
      this.dataLines.push(line.slice(5).replace(/^ /, ''));
    }
  }

  flush() {
    if (!this.dataLines.length) return;
    const raw = this.dataLines.join('\n');
    this.dataLines = [];
    const event = decodeSseData(raw);
    if (event) this.onEvent(event);
  }
}

function deltaEvents(value) {
  if (!value || typeof value !== 'object') return [];
  if (value.error) {
    const message = typeof value.error === 'string'
      ? value.error
      : value.error.message || JSON.stringify(value.error);
    return [{ type: 'error', message: String(message) }];
  }
  const choice = Array.isArray(value.choices) ? value.choices[0] : null;
  const delta = (choice && choice.delta) || {};
  const out = [];
  if (delta.reasoning_content) out.push({ type: 'reasoning', text: String(delta.reasoning_content) });
  if (delta.content) out.push({ type: 'content', text: String(delta.content) });
  if (choice && choice.finish_reason) out.push({ type: 'finish', reason: String(choice.finish_reason) });
  return out;
}

module.exports = { SseParser, decodeSseData, deltaEvents };
