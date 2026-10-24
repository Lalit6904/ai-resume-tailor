import { config } from '../config/env.js';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };
const threshold = LEVELS[config.LOG_LEVEL] ?? LEVELS.info;

function write(level, message, meta) {
  if (LEVELS[level] < threshold) return;
  const entry = {
    time: new Date().toISOString(),
    level,
    message,
  };
  if (meta && typeof meta === 'object') {
    // Never log document text, job descriptions, tokens, or credentials.
    const safe = {};
    for (const [key, value] of Object.entries(meta)) {
      if (/text|content|description|resume|password|token|secret|key|body|document/i.test(key)) {
        safe[key] = typeof value === 'number' || typeof value === 'boolean' ? value : '[redacted]';
      } else {
        safe[key] = value;
      }
    }
    Object.assign(entry, safe);
  }
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (message, meta) => write('debug', message, meta),
  info: (message, meta) => write('info', message, meta),
  warn: (message, meta) => write('warn', message, meta),
  error: (message, meta) => write('error', message, meta),
};
