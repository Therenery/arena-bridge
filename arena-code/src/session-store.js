'use strict';

const fs = require('fs');
const path = require('path');
const { sanitizeSessionFilename } = require('./config');

function validMessages(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((message) =>
    message && (message.role === 'user' || message.role === 'assistant') &&
    typeof message.content === 'string');
}

class SessionStore {
  constructor(home) {
    this.directory = path.join(path.resolve(home), 'sessions');
  }

  pathFor(session) {
    return path.join(this.directory, sanitizeSessionFilename(session));
  }

  load(session) {
    const file = this.pathFor(session);
    if (!fs.existsSync(file)) return [];
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return validMessages(parsed && parsed.messages);
  }

  save(session, messages) {
    fs.mkdirSync(this.directory, { recursive: true });
    const file = this.pathFor(session);
    const temp = `${file}.${process.pid}.tmp`;
    const payload = JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), messages }, null, 2);
    fs.writeFileSync(temp, `${payload}\n`, 'utf8');
    fs.renameSync(temp, file);
  }

  clear(session) {
    try {
      fs.unlinkSync(this.pathFor(session));
    } catch (error) {
      if (!error || error.code !== 'ENOENT') throw error;
    }
  }
}

module.exports = { SessionStore, validMessages };
