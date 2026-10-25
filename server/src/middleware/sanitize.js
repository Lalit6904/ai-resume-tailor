const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_DEPTH = 12;

function isPlainObject(value) {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * A key is unsafe when it is a MongoDB operator (`$gt`, `$ne`, ...), a dotted
 * path (`profile.role`), a prototype-pollution key, or contains a NUL byte.
 */
export function isForbiddenKey(key) {
  return (
    key.startsWith('$') ||
    key.includes('.') ||
    key.includes('\0') ||
    FORBIDDEN_KEYS.has(key.toLowerCase())
  );
}

/**
 * Recursively rebuild plain objects and arrays without unsafe keys. Values that
 * are not plain data (Buffers, Dates, class instances) are returned untouched.
 * Exceeding MAX_DEPTH drops the offending subtree instead of recursing forever.
 */
export function sanitizeValue(value, depth = 0, seen = new WeakSet()) {
  if (depth > MAX_DEPTH) return undefined;

  if (Array.isArray(value)) {
    const out = [];
    for (const item of value) {
      const clean = sanitizeValue(item, depth + 1, seen);
      if (clean !== undefined) out.push(clean);
    }
    return out;
  }

  if (!isPlainObject(value)) return value;
  if (seen.has(value)) return undefined;

  seen.add(value);
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (isForbiddenKey(key)) continue;
    const clean = sanitizeValue(item, depth + 1, seen);
    if (clean !== undefined) out[key] = clean;
  }
  seen.delete(value);
  return out;
}

function replaceRequestValue(req, source, value) {
  // Express 4 defines `query` as a getter in some versions; defineProperty is
  // safe in both cases and avoids "Cannot set property query" surprises.
  Object.defineProperty(req, source, {
    value,
    writable: true,
    configurable: true,
    enumerable: true,
  });
}

/**
 * Strip NoSQL operators and dotted/prototype keys before validation and
 * controllers run. This is intentionally a strip (not a reject) so ordinary
 * form posts keep working; Zod then rejects any payload whose shape changed.
 */
export function sanitizeRequest(req, res, next) {
  try {
    if (req.body !== undefined) {
      replaceRequestValue(req, 'body', sanitizeValue(req.body));
    }
    if (req.query !== undefined) {
      replaceRequestValue(req, 'query', sanitizeValue(req.query));
    }
    next();
  } catch (error) {
    next(error);
  }
}
